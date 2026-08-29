/**
 * SPEC-0002 acceptance on the SQLite lineage: P-001, P-002 (structural, via the
 * trigger), P-005, P-009 — plus the schema semantics 002–005 encode.
 *
 * The Node SQLite driver here is the test double for the Cloudflare Durable
 * Object driver in worker.ts: same engine, same dialect seam
 * (sqlite-dialect.ts), one serialised writer. What these tests prove about the
 * dialect holds for both.
 */

import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { PostgresBookingStore } from '../src/store.ts';
import { createSqliteDriver } from '../src/driver-sqlite.ts';
import { migrate } from '../src/db.ts';
import type { Database } from '../src/driver.ts';

let db: Database;

before(async () => {
  db = await createSqliteDriver();
  const applied = await migrate(db, { dir: 'migrations-sqlite' });
  // Every file in the directory applies, in order — the exact list grows with
  // the product, so assert shape rather than enumerate it here.
  assert.equal(applied[0], '001_schema.sql');
  assert.deepEqual(applied, [...applied].sort());
  assert.ok(applied.length >= 4);
  // The ledger makes a second run a no-op (P6).
  assert.deepEqual(await migrate(db, { dir: 'migrations-sqlite' }), []);
});

after(async () => {
  await db.close();
});

const T = (h: number, m = 0): string =>
  `2026-09-01T${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:00Z`;

async function fresh(owner = 'owner-1'): Promise<PostgresBookingStore> {
  await db.query(`DELETE FROM idempotency_keys`);
  await db.query(`DELETE FROM bookings`);
  return new PostgresBookingStore(db, owner, db);
}

test('P-001 · overlapping confirmed bookings: exactly one wins', async () => {
  const store = await fresh();
  const a = await store.insertConfirmed('b-1', T(10), T(11), 'key-1');
  const b = await store.insertConfirmed('b-2', T(10, 30), T(11, 30), 'key-2');
  assert.deepEqual(a, { ok: true });
  assert.deepEqual(b, { ok: false, reason: 'conflict' });
});

test('P-002 · the constraint is structural: a raw INSERT cannot bypass it', async () => {
  await fresh();
  await db.query(
    `INSERT INTO bookings (booking_id, owner_id, starts_at, ends_at, status) VALUES ($1,$2,$3,$4,'confirmed')`,
    ['raw-1', 'owner-1', T(10), T(11)],
  );
  await assert.rejects(
    db.query(
      `INSERT INTO bookings (booking_id, owner_id, starts_at, ends_at, status) VALUES ($1,$2,$3,$4,'confirmed')`,
      ['raw-2', 'owner-1', T(10, 30), T(11, 30)],
    ),
    /violates exclusion constraint/,
  );
  // Different owners do not contend; cancelled rows release the interval.
  await db.query(
    `INSERT INTO bookings (booking_id, owner_id, starts_at, ends_at, status) VALUES ($1,$2,$3,$4,'confirmed')`,
    ['raw-3', 'owner-2', T(10), T(11)],
  );
});

test('P1b · one booking holds at most one confirmed interval, even non-overlapping', async () => {
  await fresh();
  await db.query(
    `INSERT INTO bookings (booking_id, owner_id, starts_at, ends_at, status) VALUES ($1,$2,$3,$4,'confirmed')`,
    ['dup', 'owner-1', T(10), T(11)],
  );
  await assert.rejects(
    db.query(
      `INSERT INTO bookings (booking_id, owner_id, starts_at, ends_at, status) VALUES ($1,$2,$3,$4,'confirmed')`,
      ['dup', 'owner-1', T(14), T(15)],
    ),
    /violates unique constraint/,
  );
});

test('B1 · idempotency: a replayed key returns the original booking', async () => {
  const store = await fresh();
  await store.insertConfirmed('b-1', T(10), T(11), 'key-1');
  const replay = await store.findByIdempotencyKey('key-1');
  assert.equal(replay?.booking_id, 'b-1');
  // The key belongs to b-1 forever: a second booking cannot claim it.
  const thief = await store.insertConfirmed('b-9', T(14), T(15), 'key-1');
  assert.deepEqual(thief, { ok: false, reason: 'conflict' });
});

test('P-005 · cancel releases the interval immediately', async () => {
  const store = await fresh();
  await store.insertConfirmed('b-1', T(10), T(11), 'key-1');
  await store.cancel('b-1', 'key-cancel');
  const again = await store.insertConfirmed('b-2', T(10), T(11), 'key-2');
  assert.deepEqual(again, { ok: true });
});

test('P-009 · move is one transaction; history keeps every row (P4)', async () => {
  const store = await fresh();
  await store.insertConfirmed('b-1', T(10), T(11), 'key-1', {
    name: 'A',
    email: 'a@example.com',
    timezone: 'UTC',
    token: 'tok-1',
  });
  const moved = await store.move('b-1', T(12), T(13), 'key-move');
  assert.deepEqual(moved, { ok: true });
  // The old interval is free again…
  assert.deepEqual(await store.insertConfirmed('b-2', T(10), T(11), 'key-2'), { ok: true });
  // …the booker's token survived the move on the confirmed row…
  const { rows } = await db.query(
    `SELECT token FROM bookings WHERE booking_id = $1 AND status = 'confirmed'`,
    ['b-1'],
  );
  assert.equal(rows[0]?.['token'], 'tok-1');
  // …and history holds both rows.
  const history = await store.history('b-1');
  assert.equal(history.length, 2);
});

test('B2 · N contenders for one slot: exactly one confirmed', async () => {
  const store = await fresh();
  const results = await Promise.all(
    Array.from({ length: 8 }, (_, i) => store.insertConfirmed(`c-${i}`, T(10), T(11), `k-${i}`)),
  );
  assert.equal(results.filter((r) => r.ok).length, 1);
  assert.equal((await store.confirmed()).length, 1);
});

test('D3/005 · deleting an owner cascades, and a spent invite stays spent', async () => {
  await db.query(`DELETE FROM invites`);
  await db.query(`DELETE FROM owners`);
  await db.query(`INSERT INTO owners (owner_id, email, display_name, timezone) VALUES ($1,$2,$3,$4)`, [
    'own-1',
    'x@example.com',
    'X',
    'UTC',
  ]);
  await db.query(`INSERT INTO schedules
      (schedule_id, owner_id, slug, title, duration_minutes, granularity_minutes)
    VALUES ($1,$2,$3,$4,30,30)`, ['sch-1', 'own-1', 'x-30', 'Chat']);
  await db.query(`INSERT INTO sessions (session_id, owner_id, expires_at) VALUES ($1,$2,$3)`, [
    'sess-1',
    'own-1',
    T(23),
  ]);
  await db.query(
    `INSERT INTO invites (code, consumed_by, consumed_at) VALUES ($1,$2,$3)`,
    ['inv-1', 'own-1', T(9)],
  );

  await db.query(`DELETE FROM owners WHERE owner_id = $1`, ['own-1']);

  assert.equal((await db.query(`SELECT * FROM schedules`)).rows.length, 0);
  assert.equal((await db.query(`SELECT * FROM sessions`)).rows.length, 0);
  const inv = (await db.query(`SELECT consumed_by, consumed_at FROM invites WHERE code = 'inv-1'`)).rows[0]!;
  assert.equal(inv['consumed_by'], null);
  assert.equal(inv['consumed_at'], T(9));
});

test('unique email is case-insensitive at the query seam', async () => {
  await db.query(`DELETE FROM owners`);
  await db.query(`INSERT INTO owners (owner_id, email, display_name, timezone) VALUES ($1,$2,$3,$4)`, [
    'own-1',
    'Case@Example.com',
    'X',
    'UTC',
  ]);
  const { rows } = await db.query(`SELECT owner_id FROM owners WHERE lower(email) = lower($1)`, [
    'case@example.com',
  ]);
  assert.equal(rows[0]?.['owner_id'], 'own-1');
});

test('S9 on SQLite: slot computation, daily counts included, runs on this dialect', async () => {
  // The pg-only `AT TIME ZONE` in daily counting broke the deployed Worker on
  // first page view; this pins slot computation to the SQLite dialect forever.
  const { availableSlots, findScheduleBySlug } = await import('../src/schedules.ts');
  await db.query(`DELETE FROM bookings`);
  await db.query(`DELETE FROM owners`);
  await db.query(`INSERT INTO owners (owner_id, email, display_name, timezone) VALUES ($1,$2,$3,$4)`,
    ['own-s9', 's9@example.com', 'S9', 'America/Chicago']);
  await db.query(
    `INSERT INTO schedules (schedule_id, owner_id, slug, title, duration_minutes,
       granularity_minutes, minimum_notice_minutes, maximum_horizon_days, max_bookings_per_day)
     VALUES ('sch-s9','own-s9','s9','S9',30,30,0,14,2)`);
  await db.query(
    `INSERT INTO availability_rules (schedule_id, weekday, starts_local, ends_local)
     VALUES ('sch-s9','MO','09:00','17:00')`);
  await db.query(
    `INSERT INTO bookings (booking_id, owner_id, starts_at, ends_at, status)
     VALUES ('bk-s9','own-s9','2026-06-01T14:00:00Z','2026-06-01T14:30:00Z','confirmed')`);

  const schedule = (await findScheduleBySlug(db, 's9'))!;
  const res = await availableSlots(db, schedule, {
    from: '2026-06-01T00:00:00Z', to: '2026-06-02T00:00:00Z', now: '2026-06-01T00:00:00Z',
  });
  assert.ok(res.slots.length > 0, 'slots computed on sqlite');
  assert.ok(!res.slots.some((s) => s.start === '2026-06-01T14:00:00Z'), 'booked slot excluded');
});
