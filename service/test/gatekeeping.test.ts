/**
 * Who is allowed to book — blocked sources, and proof the booker owns the
 * address they typed.
 *
 * Both answer the same question at the same moment, so they are tested
 * together: the block must be refused before a slot is held, and an unverified
 * booking must not become a meeting anyone relies on.
 */

import { test, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import EmbeddedPostgres from 'embedded-postgres';
import { migrate } from '../src/db.ts';
import { createPostgresDriver, type Database } from '../src/driver.ts';
import { handle, type AppDeps } from '../src/app.ts';
import { loadConfig } from '../src/config.ts';
import { RecordingMail, RetryingMail } from '../src/mail.ts';

const PORT = 55451;
const NOW = '2026-06-01T08:00:00Z';
let pg: EmbeddedPostgres;
let db: Database;
let deps: AppDeps;
let recorder: RecordingMail;

before(async () => {
  pg = new EmbeddedPostgres({
    databaseDir: '/tmp/pumasi-pg-gate', user: 'pumasi', password: 'pumasi',
    port: PORT, persistent: false,
  });
  await pg.initialise();
  await pg.start();
  db = await createPostgresDriver(`postgres://pumasi:pumasi@localhost:${PORT}/postgres`);
  await migrate(db);
});
after(async () => { await db?.close(); await pg?.stop(); });

beforeEach(async () => {
  await db.query(`TRUNCATE sign_in_tokens, sessions, invites, bookings, idempotency_keys,
    availability_rules, date_overrides, schedules, owners, availability_sets, set_rules,
    set_overrides, contacts, contact_exclusions, booking_blocks, audit_events
    RESTART IDENTITY CASCADE`);
  await db.query(`DELETE FROM rate_events`);
  recorder = new RecordingMail();
  deps = {
    sql: db, tx: db,
    config: loadConfig({ BASE_URL: 'https://booking.test' } as NodeJS.ProcessEnv),
    mail: new RetryingMail(recorder),
    now: () => NOW,
    ready: () => true,
  };
});

const call = (method: string, path: string, opts: Partial<{ form: Record<string,string>; cookie: string; ip: string }> = {}) =>
  handle(deps, { method, path, ip: opts.ip ?? '15.1.1.1', form: opts.form, cookie: opts.cookie });

const cookieOf = (r: { headers: Record<string, string> }) =>
  (r.headers['set-cookie'] ?? '').split(';')[0]!;

/** An owner with one bookable event type, Mondays 09:00–17:00 UTC. */
async function ownerWithEvent() {
  await db.query(`INSERT INTO invites (code) VALUES ('inv-gate')`);
  const r = await call('POST', '/signup', {
    form: { invite: 'inv-gate', email: 'host@example.com', display_name: 'Ho', timezone: 'UTC' },
  });
  const cookie = cookieOf(r as never);
  const created = await call('POST', '/app/schedules', {
    cookie, form: { title: 'Chat', slug: 'chat', duration_minutes: '30' } });
  const id = String(created.headers['location']).split('/').pop()!;
  const set = await db.query(
    `SELECT availability_set_id FROM schedules WHERE schedule_id = $1`, [id]);
  await call('POST', `/app/availability/${String(set.rows[0]!['availability_set_id'])}/hours`, {
    cookie, form: { MO: '', MO_start: '09:00', MO_end: '17:00' } });
  return { cookie, id };
}

const book = (email: string, extra: Record<string, string> = {}) =>
  call('POST', '/chat/book', {
    form: {
      start: '2026-06-01T09:00:00Z', end: '2026-06-01T09:30:00Z',
      name: 'Ada', email, ...extra,
    },
  });

// ── blocked sources ─────────────────────────────────────────────────────────

test('a blocked address cannot book, and holds no slot by trying', async () => {
  const { cookie } = await ownerWithEvent();
  await call('POST', '/app/contacts/blocks', {
    cookie, form: { pattern: 'nuisance@spam.test', note: 'kept no-showing' } });

  const refused = await book('nuisance@spam.test');
  assert.equal(refused.status, 403);
  assert.match(refused.body, /not accepting bookings from that address/i);

  const held = await db.query(`SELECT count(*)::int AS c FROM bookings`);
  assert.equal(Number(held.rows[0]!['c']), 0, 'the refused attempt still took a slot');

  // The time it was refused for is still free for everyone else.
  const ok = await book('welcome@example.com');
  assert.equal(ok.status, 200);
});

test('blocking a domain blocks every address under it, and nothing else', async () => {
  const { cookie } = await ownerWithEvent();
  await call('POST', '/app/contacts/blocks', { cookie, form: { pattern: 'spam.test' } });

  assert.equal((await book('anyone@spam.test')).status, 403);
  // A domain that merely ENDS with the blocked one is a different domain.
  assert.equal((await book('someone@notspam.test')).status, 200);
});

test('the refusal names no one — it is the owner\'s business, not the caller\'s', async () => {
  const { cookie } = await ownerWithEvent();
  await call('POST', '/app/contacts/blocks', {
    cookie, form: { pattern: 'nuisance@spam.test', note: 'kept no-showing' } });
  const refused = await book('nuisance@spam.test');
  assert.ok(!refused.body.includes('host@example.com'), 'the refusal named the owner');
  assert.ok(!refused.body.includes('no-showing'), 'the refusal leaked the private note');
});

test('unblocking restores booking', async () => {
  const { cookie } = await ownerWithEvent();
  await call('POST', '/app/contacts/blocks', { cookie, form: { pattern: 'later@spam.test' } });
  assert.equal((await book('later@spam.test')).status, 403);
  await call('POST', '/app/contacts/blocks', { cookie, form: { remove: 'later@spam.test' } });
  assert.equal((await book('later@spam.test')).status, 200);
});

test('an owner cannot block themselves out of their own page', async () => {
  const { cookie } = await ownerWithEvent();
  await call('POST', '/app/contacts/blocks', { cookie, form: { pattern: 'host@example.com' } });
  const rows = await db.query(`SELECT count(*)::int AS c FROM booking_blocks`);
  assert.equal(Number(rows.rows[0]!['c']), 0);
});

test('a block belongs to one owner, not to the service', async () => {
  const { cookie } = await ownerWithEvent();
  await call('POST', '/app/contacts/blocks', { cookie, form: { pattern: 'nuisance@spam.test' } });

  // A second owner, untouched by the first one's block.
  await db.query(`INSERT INTO invites (code) VALUES ('inv-two')`);
  const r2 = await call('POST', '/signup', {
    form: { invite: 'inv-two', email: 'other@example.com', display_name: 'Ot', timezone: 'UTC' } });
  const c2 = cookieOf(r2 as never);
  const made = await call('POST', '/app/schedules', {
    cookie: c2, form: { title: 'Talk', slug: 'talk', duration_minutes: '30' } });
  const id2 = String(made.headers['location']).split('/').pop()!;
  const set2 = await db.query(
    `SELECT availability_set_id FROM schedules WHERE schedule_id = $1`, [id2]);
  await call('POST', `/app/availability/${String(set2.rows[0]!['availability_set_id'])}/hours`, {
    cookie: c2, form: { MO: '', MO_start: '09:00', MO_end: '17:00' } });

  const r = await call('POST', '/talk/book', {
    form: { start: '2026-06-01T09:00:00Z', end: '2026-06-01T09:30:00Z',
            name: 'Ada', email: 'nuisance@spam.test' } });
  assert.equal(r.status, 200, 'one owner\'s block reached another owner\'s page');
});

test('blocks are audited, and go when the account goes', async () => {
  const { cookie } = await ownerWithEvent();
  await call('POST', '/app/contacts/blocks', { cookie, form: { pattern: 'nuisance@spam.test' } });
  const ev = await db.query(`SELECT action FROM audit_events WHERE action = 'block.added'`);
  assert.equal(ev.rows.length, 1);

  const gone = await call('POST', '/app/delete', { cookie, form: { confirm: 'yes' } });
  assert.ok(gone.status < 400, `deletion itself failed: ${gone.status}`);
  const left = await db.query(`SELECT count(*)::int AS c FROM booking_blocks`);
  assert.equal(Number(left.rows[0]!['c']), 0, 'the deleted account left its blocks behind');
});
