/**
 * SPEC-0002 P-001, P-005, P-009 — against a REAL PostgreSQL with real parallel
 * connections.
 *
 * This is the file the other suites could not be. PGlite is genuine PostgreSQL
 * and its constraints are really enforced, but it has exactly one connection,
 * so nothing there can interleave and no race is ever run. SPEC-0001 delegated
 * B-002 and B-010 here precisely because exclusivity under concurrency is a
 * property of the store — and a store that cannot be raced cannot demonstrate
 * it.
 *
 * PostgreSQL runs as a user process (no root, no container), so this is part of
 * the ordinary suite rather than something only CI can do.
 */

import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { startPostgres, type TestPostgres } from './support/pg.ts';
import { migrate } from '../src/db.ts';
import { createPostgresDriver, type Database } from '../src/driver.ts';
import { PostgresBookingStore } from '../src/store.ts';

let pg: TestPostgres;
let db: Database;

before(async () => {
  pg = await startPostgres('concurrency');
  db = await createPostgresDriver(pg.url);
  await migrate(db);
});

after(async () => {
  await db?.close();
  await pg?.stop();
});

async function reset(): Promise<void> {
  await db.query(`TRUNCATE bookings, idempotency_keys RESTART IDENTITY CASCADE`);
}

test('the driver is genuinely PostgreSQL with a connection pool', async () => {
  assert.equal(db.kind, 'postgres');
  const v = await db.query('SELECT version() AS v');
  assert.match(String(v.rows[0]?.['v']), /PostgreSQL/);

  // Distinct backend PIDs prove these are separate connections, which is the
  // whole premise of the races below.
  const pids = await Promise.all(
    Array.from({ length: 5 }, () =>
      db.transaction(async (tx) => {
        const r = await tx.query('SELECT pg_backend_pid() AS pid');
        return Number(r.rows[0]?.['pid']);
      }),
    ),
  );
  assert.ok(new Set(pids).size > 1, 'the pool must hand out more than one connection');
});

test('P-001 exactly one of N parallel bookings of the same slot wins', async () => {
  const ATTEMPTS = 24;
  for (let round = 0; round < 20; round++) {
    await reset();
    const store = new PostgresBookingStore(db, 'owner-1', db);

    const results = await Promise.all(
      Array.from({ length: ATTEMPTS }, (_, i) =>
        store.insertConfirmed(
          `bk-${round}-${i}`,
          '2026-06-01T13:00:00Z',
          '2026-06-01T14:00:00Z',
          `key-${round}-${i}`,
        ),
      ),
    );

    const won = results.filter((r) => r.ok).length;
    assert.equal(won, 1, `round ${round}: exactly one caller may win, got ${won}`);

    const confirmed = await store.confirmed();
    assert.equal(confirmed.length, 1);
  }
});

test('P-001 parallel bookings of OVERLAPPING but distinct intervals still yield one', async () => {
  // Not the same interval, so a naive unique key on (owner, start) would miss
  // this entirely. The exclusion constraint is what catches overlap.
  for (let round = 0; round < 10; round++) {
    await reset();
    const store = new PostgresBookingStore(db, 'owner-1', db);
    const spans = [
      ['2026-06-01T13:00:00Z', '2026-06-01T14:00:00Z'],
      ['2026-06-01T13:15:00Z', '2026-06-01T14:15:00Z'],
      ['2026-06-01T13:30:00Z', '2026-06-01T14:30:00Z'],
      ['2026-06-01T12:45:00Z', '2026-06-01T13:45:00Z'],
    ] as const;

    const results = await Promise.all(
      spans.map(([s, e], i) => store.insertConfirmed(`bk-${round}-${i}`, s, e, `k-${round}-${i}`)),
    );
    assert.equal(results.filter((r) => r.ok).length, 1, 'overlap is overlap');
  }
});

test('P-005/P-009 a reschedule never leaves two intervals or none, under contention', async () => {
  for (let round = 0; round < 20; round++) {
    await reset();
    const store = new PostgresBookingStore(db, 'owner-1', db);
    await store.insertConfirmed('bk1', '2026-06-11T09:00:00Z', '2026-06-11T10:00:00Z', `seed-${round}`);

    // A reschedule into the target, racing a direct booking of that same target.
    const [moved, booked] = await Promise.all([
      store.move('bk1', '2026-06-11T15:00:00Z', '2026-06-11T16:00:00Z', `mv-${round}`),
      store.insertConfirmed('bk2', '2026-06-11T15:00:00Z', '2026-06-11T16:00:00Z', `bk-${round}`),
    ]);

    assert.equal(
      [moved.ok, booked.ok].filter(Boolean).length,
      1,
      `round ${round}: exactly one may take the target`,
    );

    const confirmed = await store.confirmed();
    const bk1 = confirmed.filter((r) => r.booking_id === 'bk1');
    assert.equal(bk1.length, 1, 'bk1 holds exactly one confirmed interval — never two, never none');
    assert.ok(
      bk1[0]?.start === '2026-06-11T09:00:00Z' || bk1[0]?.start === '2026-06-11T15:00:00Z',
      'and it is at one of the two intervals, not somewhere else',
    );

    // A losing move must never degrade into a cancellation.
    if (!moved.ok) assert.equal(bk1[0]?.start, '2026-06-11T09:00:00Z', 'the loser is unmoved');
  }
});

test('P-009 two parallel reschedules of ONE booking leave exactly one interval', async () => {
  for (let round = 0; round < 20; round++) {
    await reset();
    const store = new PostgresBookingStore(db, 'owner-1', db);
    await store.insertConfirmed('bk1', '2026-06-12T09:00:00Z', '2026-06-12T10:00:00Z', `seed-${round}`);

    const [a, b] = await Promise.all([
      store.move('bk1', '2026-06-12T14:00:00Z', '2026-06-12T15:00:00Z', `a-${round}`),
      store.move('bk1', '2026-06-12T16:00:00Z', '2026-06-12T17:00:00Z', `b-${round}`),
    ]);

    // NOT "exactly one wins". Serialised, these are two genuine intents with
    // different idempotency keys, applied in order -- the second legitimately
    // moves a booking the first already moved. The invariants below are what
    // P2c actually protects, and an earlier version of this test asserted the
    // wrong thing because the clause did too.
    const winners = [a.ok, b.ok].filter(Boolean).length;
    assert.ok(winners >= 1, `round ${round}: at least one must succeed, got ${winners}`);

    const confirmed = await store.confirmed();
    assert.equal(confirmed.length, 1, 'exactly one confirmed interval -- never two, never none (P1b)');
    assert.ok(
      ['2026-06-12T14:00:00Z', '2026-06-12T16:00:00Z'].includes(confirmed[0]!.start),
      'and it is an interval some caller actually asked for',
    );
    assert.notEqual(confirmed[0]!.start, '2026-06-12T09:00:00Z', 'a successful move actually moved it');

    const history = await store.history('bk1');
    assert.ok(
      history.every((r) => r.status !== 'confirmed' || r.start === confirmed[0]!.start),
      'no stale confirmed row survives',
    );
  }
});

test('B1 a key belongs to its first booking, even when keys race', async () => {
  await reset();
  const store = new PostgresBookingStore(db, 'owner-1', db);
  await store.insertConfirmed('bkA', '2026-06-15T09:00:00Z', '2026-06-15T10:00:00Z', 'kA');
  await store.insertConfirmed('bkB', '2026-06-15T11:00:00Z', '2026-06-15T12:00:00Z', 'kB');

  await Promise.all([store.cancel('bkB', 'kA'), store.cancel('bkA', 'kB')]);

  assert.equal((await store.findByIdempotencyKey('kA'))?.booking_id, 'bkA');
  assert.equal((await store.findByIdempotencyKey('kB'))?.booking_id, 'bkB');
});
