/**
 * SPEC-0002 acceptance: P-001, P-002, P-005, P-009.
 *
 * These are the cases SPEC-0001 DELEGATED here, because a storage-agnostic
 * engine cannot prove a store's guarantees. They run against real PostgreSQL
 * semantics via PGlite, including btree_gist.
 *
 * P-002 is structural on purpose: a behavioural test alone cannot distinguish
 * "the constraint holds" from "no test happened to race".
 */

import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { PostgresBookingStore, type SqlClient } from '../src/store.ts';
import { createPgliteDriver, type Database } from '../src/driver.ts';

const here = dirname(fileURLToPath(import.meta.url));
function migrationSql(): string {
  for (const p of ['../migrations/001_bookings.sql', '../../migrations/001_bookings.sql', '../../../migrations/001_bookings.sql']) {
    try {
      return readFileSync(resolve(here, p), 'utf8');
    } catch {
      /* try the next */
    }
  }
  throw new Error('migration not found');
}

let db: Database;
let sql: SqlClient;

async function fresh(): Promise<PostgresBookingStore> {
  await sql.exec('DROP TABLE IF EXISTS bookings, idempotency_keys CASCADE;');
  await sql.exec(migrationSql());
  return new PostgresBookingStore(sql, 'owner-1', db);
}

before(async () => {
  db = await createPgliteDriver();
  sql = db;
});

// ── P-002 · structural ─────────────────────────────────────────────────────
test('P-002 both constraints exist in the live schema, and btree_gist is installed', async () => {
  await fresh();
  const ext = await sql.query(
    `SELECT extname FROM pg_extension WHERE extname = 'btree_gist'`,
  );
  assert.equal(ext.rows.length, 1, 'btree_gist must be installed');

  const con = await sql.query(
    `SELECT conname, contype FROM pg_constraint WHERE conname = 'bookings_no_overlap'`,
  );
  assert.equal(con.rows[0]?.['contype'], 'x', 'P1a must be an EXCLUDE constraint, not a check');

  const idx = await sql.query(
    `SELECT indexdef FROM pg_indexes WHERE indexname = 'bookings_one_confirmed_per_booking'`,
  );
  assert.match(String(idx.rows[0]?.['indexdef'] ?? ''), /UNIQUE/);
  assert.match(String(idx.rows[0]?.['indexdef'] ?? ''), /confirmed/);
});

// ── P-001 · exclusivity, enforced by the database ──────────────────────────
test('P-001 the database refuses overlapping confirmed bookings for one owner', async () => {
  const store = await fresh();
  const a = await store.insertConfirmed('bk1', '2026-06-01T13:00:00Z', '2026-06-01T14:00:00Z', 'k1');
  assert.equal(a.ok, true);

  for (const [s, e] of [
    ['2026-06-01T13:30:00Z', '2026-06-01T14:30:00Z'], // overlaps the tail
    ['2026-06-01T12:30:00Z', '2026-06-01T13:30:00Z'], // overlaps the head
    ['2026-06-01T13:15:00Z', '2026-06-01T13:45:00Z'], // strictly inside
    ['2026-06-01T12:00:00Z', '2026-06-01T15:00:00Z'], // strictly contains
  ] as const) {
    const r = await store.insertConfirmed(`x-${s}`, s, e, `key-${s}`);
    assert.equal(r.ok, false, `${s}–${e} should conflict`);
  }

  // Half-open: abutting intervals do NOT overlap.
  const abut = await store.insertConfirmed('bk2', '2026-06-01T14:00:00Z', '2026-06-01T15:00:00Z', 'k2');
  assert.equal(abut.ok, true, 'a booking starting exactly when another ends must be allowed');

  assert.equal((await store.confirmed()).length, 2);
});

test('P-001 a different owner may hold the same interval', async () => {
  const a = await fresh();
  const b = new PostgresBookingStore(sql, 'owner-2', db);
  assert.equal((await a.insertConfirmed('bk1', '2026-06-01T13:00:00Z', '2026-06-01T14:00:00Z', 'k1')).ok, true);
  assert.equal((await b.insertConfirmed('bk2', '2026-06-01T13:00:00Z', '2026-06-01T14:00:00Z', 'k2')).ok, true);
});

// ── P-005 · a reschedule never holds two intervals, nor none ───────────────
test('P-005 a reschedule leaves exactly one confirmed interval', async () => {
  const store = await fresh();
  await store.insertConfirmed('bk1', '2026-06-11T09:00:00Z', '2026-06-11T10:00:00Z', 'k1');

  const moved = await store.move('bk1', '2026-06-11T15:00:00Z', '2026-06-11T16:00:00Z', 'k2');
  assert.equal(moved.ok, true);

  const confirmed = await store.confirmed();
  assert.equal(confirmed.length, 1, 'never two intervals, never none');
  assert.equal(confirmed[0]?.start, '2026-06-11T15:00:00Z');

  // P4 — the prior record survives.
  const history = await store.history('bk1');
  assert.equal(history.length, 2, 'the old row is preserved, not destroyed');
  assert.equal(history.filter((r) => r.status === 'confirmed').length, 1);

  // The vacated interval is genuinely free.
  const other = await store.insertConfirmed('bk2', '2026-06-11T09:00:00Z', '2026-06-11T10:00:00Z', 'k3');
  assert.equal(other.ok, true);
});

test('P-005 P1b makes the two-confirmed-rows state impossible even by direct SQL', async () => {
  // The bug the first draft of SPEC-0002 permitted: the two rows do NOT
  // overlap, so P1a is satisfied and only P1b catches it. Written as raw SQL
  // because no application path should be trusted to prove this.
  await fresh();
  await sql.query(
    `INSERT INTO bookings (booking_id, owner_id, starts_at, ends_at, status)
     VALUES ('bk1','owner-1','2026-06-11T09:00:00Z','2026-06-11T10:00:00Z','confirmed')`,
  );
  await assert.rejects(
    () =>
      sql.query(
        `INSERT INTO bookings (booking_id, owner_id, starts_at, ends_at, status)
         VALUES ('bk1','owner-1','2026-06-11T15:00:00Z','2026-06-11T16:00:00Z','confirmed')`,
      ),
    /unique constraint/,
    'a booking must never hold two confirmed intervals, overlapping or not',
  );
});

test('P-005 a losing move leaves the booking confirmed and unmoved', async () => {
  const store = await fresh();
  await store.insertConfirmed('bk1', '2026-06-11T09:00:00Z', '2026-06-11T10:00:00Z', 'k1');
  await store.insertConfirmed('bk2', '2026-06-11T15:00:00Z', '2026-06-11T16:00:00Z', 'k2');

  const moved = await store.move('bk1', '2026-06-11T15:00:00Z', '2026-06-11T16:00:00Z', 'k3');
  assert.equal(moved.ok, false, 'the target is taken');

  const confirmed = await store.confirmed();
  assert.equal(confirmed.length, 2);
  const bk1 = confirmed.find((r) => r.booking_id === 'bk1');
  assert.equal(bk1?.start, '2026-06-11T09:00:00Z', 'unmoved');
  assert.equal(bk1?.status, 'confirmed', 'a failed move must never become a cancellation');
});

// ── B1 · an idempotency key belongs to its first booking ───────────────────
test('B1 a later operation cannot steal another booking’s idempotency key', async () => {
  const store = await fresh();
  await store.insertConfirmed('bkA', '2026-06-15T09:00:00Z', '2026-06-15T10:00:00Z', 'kA');
  await store.insertConfirmed('bkB', '2026-06-15T11:00:00Z', '2026-06-15T12:00:00Z', 'kB');

  await store.cancel('bkB', 'kA'); // passes A's key while cancelling B

  const replay = await store.findByIdempotencyKey('kA');
  assert.equal(replay?.booking_id, 'bkA', 'kA must still report the booking it created');
  assert.equal(replay?.status, 'confirmed');
});

// ── B5 · cancelling releases the interval ──────────────────────────────────
test('B5 cancelling frees the interval immediately', async () => {
  const store = await fresh();
  await store.insertConfirmed('bk1', '2026-06-20T09:00:00Z', '2026-06-20T10:00:00Z', 'k1');
  await store.cancel('bk1', 'k2');
  const again = await store.insertConfirmed('bk2', '2026-06-20T09:00:00Z', '2026-06-20T10:00:00Z', 'k3');
  assert.equal(again.ok, true, 'the released interval must be bookable at once');
  assert.equal((await store.confirmed()).length, 1);
});
