/**
 * P6 — routing forms and meeting polls.
 *
 * Routing stores questions and destinations, never answers; a poll's votes are
 * personal data deleted with the poll; booking the winner is a real booking
 * with real exclusivity.
 */

import { test, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import EmbeddedPostgres from 'embedded-postgres';
import { migrate } from '../src/db.ts';
import { createPostgresDriver, type Database } from '../src/driver.ts';
import { handle, type AppDeps } from '../src/app.ts';
import { loadConfig } from '../src/config.ts';
import { RecordingMail, RetryingMail } from '../src/mail.ts';

const PORT = 55444;
const NOW = '2026-06-01T08:00:00Z';
let pg: EmbeddedPostgres;
let db: Database;
let deps: AppDeps;
let mail: RecordingMail;

before(async () => {
  pg = new EmbeddedPostgres({
    databaseDir: '/tmp/pumasi-pg-routing', user: 'pumasi', password: 'pumasi',
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
    set_overrides, routing_forms, routing_options, polls, poll_options, poll_votes
    RESTART IDENTITY CASCADE`);
  await db.query(`DELETE FROM rate_events`);
  mail = new RecordingMail();
  deps = {
    sql: db, tx: db,
    config: loadConfig({ BASE_URL: 'https://booking.test' } as NodeJS.ProcessEnv),
    mail: new RetryingMail(mail),
    now: () => NOW,
    ready: () => true,
  };
});

const call = (method: string, path: string, opts: Partial<{ form: Record<string,string>; cookie: string; query: Record<string,string>; ip: string }> = {}) =>
  handle(deps, { method, path, ip: opts.ip ?? '7.7.7.7', form: opts.form, cookie: opts.cookie, query: opts.query });

const cookieOf = (r: { headers: Record<string, string> }) =>
  (r.headers['set-cookie'] ?? '').split(';')[0]!;

async function makeOwner(email = 'p6@example.com') {
  await db.query(`INSERT INTO invites (code) VALUES ($1)`, [`inv-${email}`]);
  const r = await call('POST', '/signup', {
    form: { invite: `inv-${email}`, email, display_name: 'Ro', timezone: 'UTC' },
  });
  const cookie = cookieOf(r as never);
  const created = await call('POST', '/app/schedules', {
    cookie, form: { title: 'Intro', slug: `intro-${email.split('@')[0]}`, duration_minutes: '30' },
  });
  const scheduleId = String(created.headers['location']).split('/').pop()!;
  const { rows } = await db.query(`SELECT owner_id FROM owners WHERE email = $1`, [email]);
  return { cookie, scheduleId, ownerId: String(rows[0]!['owner_id']) };
}

// ── routing ────────────────────────────────────────────────────────────────

test('a routing form routes to an event page, a URL, or a message', async () => {
  const { cookie, scheduleId } = await makeOwner();
  await call('POST', '/app/routing', {
    cookie, form: { title: 'Talk to us', slug: 'talk', question: 'What do you need?' } });
  const form = await db.query(`SELECT form_id FROM routing_forms`);
  const formId = String(form.rows[0]!['form_id']);

  for (const [label, kind, value] of [
    ['Sales', 'event', scheduleId],
    ['Docs', 'url', 'https://docs.example.com/start'],
    ['Other', 'message', 'Write to hello@example.com instead.'],
  ] as const) {
    const add = await call('POST', `/app/routing/${formId}/options`, {
      cookie, form: { label, destination_kind: kind, destination_value: value } });
    assert.equal(add.status, 303);
  }

  const page = await call('GET', '/r/talk');
  assert.equal(page.status, 200);
  assert.ok(page.body.includes('What do you need?'));

  const opts = await db.query(`SELECT option_id, label FROM routing_options ORDER BY position`);
  const byLabel = new Map(opts.rows.map((o) => [String(o['label']), String(o['option_id'])]));

  const toEvent = await call('POST', '/r/talk', { form: { answer: byLabel.get('Sales')! } });
  assert.equal(toEvent.status, 303);
  assert.equal(toEvent.headers['location'], '/p6/intro-p6');

  const toUrl = await call('POST', '/r/talk', { form: { answer: byLabel.get('Docs')! } });
  assert.equal(toUrl.headers['location'], 'https://docs.example.com/start');

  const toMsg = await call('POST', '/r/talk', { form: { answer: byLabel.get('Other')! } });
  assert.equal(toMsg.status, 200);
  assert.ok(toMsg.body.includes('hello@example.com'));
});

test("a routing option cannot point at someone else's event (I4)", async () => {
  const a = await makeOwner('ra@example.com');
  const b = await makeOwner('rb@example.com');
  await call('POST', '/app/routing', {
    cookie: a.cookie, form: { title: 'T', slug: 'rt', question: 'Q' } });
  const form = await db.query(`SELECT form_id FROM routing_forms`);
  const add = await call('POST', `/app/routing/${String(form.rows[0]!['form_id'])}/options`, {
    cookie: a.cookie,
    form: { label: 'X', destination_kind: 'event', destination_value: b.scheduleId } });
  assert.equal(add.status, 400);
});

// ── polls ──────────────────────────────────────────────────────────────────

async function makePoll(cookie: string) {
  const r = await call('POST', '/app/polls', {
    cookie, form: {
      title: 'Retro', duration_minutes: '30',
      opt1: '2026-06-08T10:00', opt2: '2026-06-08T14:00', opt3: '2026-06-09T10:00',
    },
  });
  assert.equal(r.status, 303);
  const p = await db.query(`SELECT poll_id, token FROM polls`);
  return { pollId: String(p.rows[0]!['poll_id']), token: String(p.rows[0]!['token']) };
}

test('votes tally per option and a re-vote replaces the previous answer', async () => {
  const { cookie } = await makeOwner();
  const { pollId, token } = await makePoll(cookie);
  const opts = await db.query(`SELECT option_id FROM poll_options ORDER BY starts_at`);
  const [o1, o2] = opts.rows.map((o) => String(o['option_id']));

  const vote = await call('POST', `/p/${token}`, {
    form: { name: 'Ada', email: 'ada@example.com', [`vote:${o1}`]: 'on', [`vote:${o2}`]: 'on' } });
  assert.equal(vote.status, 200);
  await call('POST', `/p/${token}`, {
    form: { name: 'Bo', email: 'bo@example.com', [`vote:${o1}`]: 'on' }, ip: '8.8.8.8' });

  const detail = await call('GET', `/app/polls/${pollId}`, { cookie });
  assert.ok(detail.body.includes('<b>2</b> vote'));

  // Ada changes her mind: only o2 now.
  await call('POST', `/p/${token}`, {
    form: { name: 'Ada', email: 'ada@example.com', [`vote:${o2!}`]: 'on' }, ip: '9.9.9.8' });
  const votes = await db.query(
    `SELECT option_id FROM poll_votes WHERE voter_email = 'ada@example.com'`);
  assert.equal(votes.rows.length, 1);
  assert.equal(String(votes.rows[0]!['option_id']), o2);
});

test('booking the winner books for real, closes the poll, and mails every voter', async () => {
  const { cookie } = await makeOwner();
  const { pollId, token } = await makePoll(cookie);
  const opts = await db.query(`SELECT option_id, starts_at FROM poll_options ORDER BY starts_at`);
  const o1 = String(opts.rows[0]!['option_id']);
  await call('POST', `/p/${token}`, {
    form: { name: 'Ada', email: 'ada@example.com', [`vote:${o1}`]: 'on' } });

  const booked = await call('POST', `/app/polls/${pollId}/book`, {
    cookie, form: { option: o1 } });
  assert.equal(booked.status, 303);
  const b = await db.query(`SELECT starts_at FROM bookings WHERE status = 'confirmed'`);
  assert.equal(b.rows.length, 1);
  assert.equal(new Date(String(b.rows[0]!['starts_at'])).toISOString(), '2026-06-08T10:00:00.000Z');
  const p = await db.query(`SELECT status FROM polls`);
  assert.equal(String(p.rows[0]!['status']), 'booked');
  assert.ok(mail.sent.some((m) => m.to === 'ada@example.com' && m.kind === 'confirmed'));

  const closedVote = await call('POST', `/p/${token}`, {
    form: { name: 'Late', email: 'late@example.com', [`vote:${o1}`]: 'on' }, ip: '9.7.7.7' });
  assert.equal(closedVote.status, 409);
});

test('booking a winner that now conflicts refuses and keeps the poll open', async () => {
  const { cookie, ownerId } = await makeOwner();
  const { pollId } = await makePoll(cookie);
  await db.query(
    `INSERT INTO bookings (booking_id, owner_id, starts_at, ends_at, status)
     VALUES ('clash', $1, '2026-06-08T10:00:00Z', '2026-06-08T10:30:00Z', 'confirmed')`,
    [ownerId]);
  const opts = await db.query(`SELECT option_id FROM poll_options ORDER BY starts_at`);
  const booked = await call('POST', `/app/polls/${pollId}/book`, {
    cookie, form: { option: String(opts.rows[0]!['option_id']) } });
  assert.equal(booked.status, 409);
  const p = await db.query(`SELECT status FROM polls`);
  assert.equal(String(p.rows[0]!['status']), 'open');
});

test('deleting a poll deletes its votes with it', async () => {
  const { cookie } = await makeOwner();
  const { pollId, token } = await makePoll(cookie);
  const opts = await db.query(`SELECT option_id FROM poll_options LIMIT 1`);
  await call('POST', `/p/${token}`, {
    form: { name: 'Ada', email: 'ada@example.com', [`vote:${String(opts.rows[0]!['option_id'])}`]: 'on' } });
  await call('POST', `/app/polls/${pollId}/delete`, { cookie });
  const votes = await db.query(`SELECT count(*)::int AS c FROM poll_votes`);
  assert.equal(Number(votes.rows[0]!['c']), 0);
});
