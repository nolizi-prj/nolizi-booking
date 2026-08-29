/**
 * Per-event custom questions.
 *
 * This is the first feature that stores personal data whose shape the service
 * did not choose, so most of what is asserted here is about restraint: the
 * answer is capped, the label is snapshot so a later edit cannot rewrite what
 * someone was asked, the booking page tells the truth about what it collects,
 * and every deletion path that reaches a booker's name also reaches their
 * answers.
 */

import { test, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import EmbeddedPostgres from 'embedded-postgres';
import { migrate } from '../src/db.ts';
import { createPostgresDriver, type Database } from '../src/driver.ts';
import { handle, type AppDeps } from '../src/app.ts';
import { loadConfig } from '../src/config.ts';
import { RecordingMail, RetryingMail } from '../src/mail.ts';

const PORT = 55452;
const NOW = '2026-06-01T08:00:00Z';
let pg: EmbeddedPostgres;
let db: Database;
let deps: AppDeps;

before(async () => {
  pg = new EmbeddedPostgres({
    databaseDir: '/tmp/pumasi-pg-questions', user: 'pumasi', password: 'pumasi',
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
    set_overrides, contacts, event_questions, booking_answers, audit_events
    RESTART IDENTITY CASCADE`);
  await db.query(`DELETE FROM rate_events`);
  deps = {
    sql: db, tx: db,
    config: loadConfig({ BASE_URL: 'https://booking.test' } as NodeJS.ProcessEnv),
    mail: new RetryingMail(new RecordingMail()),
    now: () => NOW,
    ready: () => true,
  };
});

const call = (method: string, path: string, opts: Partial<{ form: Record<string,string>; cookie: string; ip: string }> = {}) =>
  handle(deps, { method, path, ip: opts.ip ?? '15.1.1.1', form: opts.form, cookie: opts.cookie });

const cookieOf = (r: { headers: Record<string, string> }) =>
  (r.headers['set-cookie'] ?? '').split(';')[0]!;

async function ownerWithEvent() {
  await db.query(`INSERT INTO invites (code) VALUES ('inv-q')`);
  const r = await call('POST', '/signup', {
    form: { invite: 'inv-q', email: 'host@example.com', display_name: 'Ho', timezone: 'UTC' } });
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

async function addQuestion(cookie: string, id: string, form: Record<string, string>) {
  await call('POST', `/app/event/${id}/questions`, { cookie, form });
  const q = await db.query(
    `SELECT question_id, label, kind, required, options FROM event_questions
      WHERE schedule_id = $1 ORDER BY position DESC LIMIT 1`, [id]);
  return q.rows[0]!;
}

const bookWith = (extra: Record<string, string> = {}) =>
  call('POST', '/chat/book', {
    form: { start: '2026-06-01T09:00:00Z', end: '2026-06-01T09:30:00Z',
            name: 'Ada', email: 'ada@example.com', ...extra } });

test('a question appears on the booking page and its answer is stored', async () => {
  const { cookie, id } = await ownerWithEvent();
  const q = await addQuestion(cookie, id, { label: 'What would you like to cover?', kind: 'text' });
  const qid = String(q['question_id']);

  const page = await call('GET', '/chat');
  assert.match(page.body, /What would you like to cover\?/);
  assert.ok(page.body.includes(`q:${qid}`), 'the field was not on the page');

  const r = await bookWith({ [`q:${qid}`]: 'The migration plan' });
  assert.equal(r.status, 200);
  const stored = await db.query(`SELECT label, answer FROM booking_answers`);
  assert.equal(stored.rows.length, 1);
  assert.equal(stored.rows[0]!['answer'], 'The migration plan');
  assert.equal(stored.rows[0]!['label'], 'What would you like to cover?');
});

test('a required question must be answered, and the attempt is not lost', async () => {
  const { cookie, id } = await ownerWithEvent();
  const q = await addQuestion(cookie, id, {
    label: 'Your company', kind: 'text', required: 'on' });
  const qid = String(q['question_id']);

  const refused = await bookWith();
  assert.equal(refused.status, 400);
  assert.match(refused.body, /Your company/);
  const none = await db.query(`SELECT count(*)::int AS c FROM bookings`);
  assert.equal(Number(none.rows[0]!['c']), 0);

  // What they typed elsewhere survives the refusal.
  const partial = await call('POST', '/chat/book', {
    form: { start: '2026-06-01T09:00:00Z', end: '2026-06-01T09:30:00Z',
            name: 'Ada', email: '', [`q:${qid}`]: 'Contoso' } });
  assert.ok(partial.body.includes('Contoso'), 'the answer was thrown away on a re-render');
});

test('an optional question may be skipped', async () => {
  const { cookie, id } = await ownerWithEvent();
  await addQuestion(cookie, id, { label: 'Anything else?', kind: 'text' });
  const r = await bookWith();
  assert.equal(r.status, 200);
  const stored = await db.query(`SELECT count(*)::int AS c FROM booking_answers`);
  assert.equal(Number(stored.rows[0]!['c']), 0, 'an empty answer was stored as data');
});

test('an answer is capped rather than stored whole', async () => {
  const { cookie, id } = await ownerWithEvent();
  const q = await addQuestion(cookie, id, { label: 'Notes', kind: 'textarea' });
  await bookWith({ [`q:${String(q['question_id'])}`]: 'x'.repeat(9000) });
  const stored = await db.query(`SELECT answer FROM booking_answers`);
  assert.equal(String(stored.rows[0]!['answer']).length, 2000);
});

test('editing the question later does not relabel answers already given', async () => {
  const { cookie, id } = await ownerWithEvent();
  const q = await addQuestion(cookie, id, { label: 'Your phone number', kind: 'text' });
  const qid = String(q['question_id']);
  await bookWith({ [`q:${qid}`]: '555-0100' });

  // The owner repurposes the question.
  await db.query(`UPDATE event_questions SET label = 'Anything else?' WHERE question_id = $1`, [qid]);
  const stored = await db.query(`SELECT label FROM booking_answers`);
  assert.equal(stored.rows[0]!['label'], 'Your phone number',
    'the record of what was asked was rewritten');
});

test('the booking page says what it collects, and stops saying it when there is nothing', async () => {
  const { cookie, id } = await ownerWithEvent();
  const plain = await call('GET', '/chat');
  assert.ok(!/your answers above/i.test(plain.body));

  await addQuestion(cookie, id, { label: 'Your company', kind: 'text' });
  const withQ = await call('GET', '/chat');
  assert.match(withQ.body, /your answers above/i);
  assert.match(withQ.body, /written by the organiser/i);
});

test('a list question renders its choices; an empty list falls back to a line', async () => {
  const { cookie, id } = await ownerWithEvent();
  await addQuestion(cookie, id, {
    label: 'Which team?', kind: 'select', options: 'Sales\nSupport\nEngineering' });
  const page = await call('GET', '/chat');
  assert.match(page.body, /<option>Support<\/option>/);

  const empty = await addQuestion(cookie, id, {
    label: 'Which office?', kind: 'select', options: '   ' });
  assert.equal(empty['kind'], 'text', 'an unanswerable list control was shipped');
});

test('answers are deleted when the booker deletes their booking', async () => {
  const { cookie, id } = await ownerWithEvent();
  const q = await addQuestion(cookie, id, { label: 'Your company', kind: 'text' });
  await bookWith({ [`q:${String(q['question_id'])}`]: 'Contoso' });

  const tok = await db.query(`SELECT token FROM bookings WHERE token IS NOT NULL`);
  const r = await call('POST', `/b/${String(tok.rows[0]!['token'])}/delete`,
    { form: { confirm: 'yes' } });
  assert.ok(r.status < 400, `deletion failed: ${r.status}`);
  const left = await db.query(`SELECT count(*)::int AS c FROM booking_answers`);
  assert.equal(Number(left.rows[0]!['c']), 0,
    'the booker deleted their details and their answer stayed behind');
});

test('answers and questions go when the account goes', async () => {
  const { cookie, id } = await ownerWithEvent();
  const q = await addQuestion(cookie, id, { label: 'Your company', kind: 'text' });
  await bookWith({ [`q:${String(q['question_id'])}`]: 'Contoso' });

  const gone = await call('POST', '/app/delete', { cookie, form: { confirm: 'yes' } });
  assert.ok(gone.status < 400);
  const a = await db.query(`SELECT count(*)::int AS c FROM booking_answers`);
  const e = await db.query(`SELECT count(*)::int AS c FROM event_questions`);
  assert.equal(Number(a.rows[0]!['c']), 0);
  assert.equal(Number(e.rows[0]!['c']), 0);
});

test('removing a question keeps the answers people already gave, still readable', async () => {
  const { cookie, id } = await ownerWithEvent();
  const q = await addQuestion(cookie, id, { label: 'Your company', kind: 'text' });
  const qid = String(q['question_id']);
  await bookWith({ [`q:${qid}`]: 'Contoso' });

  await call('POST', `/app/event/${id}/questions`, { cookie, form: { remove: qid } });
  const left = await db.query(`SELECT label, answer FROM booking_answers`);
  assert.equal(left.rows.length, 1, 'the record of what was asked was destroyed');
  assert.equal(left.rows[0]!['label'], 'Your company',
    'the answer outlived its label and became unreadable');
});

test('the owner sees the answers on their meetings page', async () => {
  const { cookie, id } = await ownerWithEvent();
  const q = await addQuestion(cookie, id, { label: 'Your company', kind: 'text' });
  await bookWith({ [`q:${String(q['question_id'])}`]: 'Contoso' });
  const page = await call('GET', '/app/meetings', { cookie });
  assert.match(page.body, /Your company/);
  assert.match(page.body, /Contoso/);
});

test('one owner cannot add or remove questions on another owner\'s event', async () => {
  const { id } = await ownerWithEvent();
  await db.query(`INSERT INTO invites (code) VALUES ('inv-q2')`);
  const r2 = await call('POST', '/signup', {
    form: { invite: 'inv-q2', email: 'other@example.com', display_name: 'Ot', timezone: 'UTC' } });
  const c2 = cookieOf(r2 as never);

  const r = await call('POST', `/app/event/${id}/questions`, {
    cookie: c2, form: { label: 'Snooping', kind: 'text' } });
  assert.equal(r.status, 404);
  const none = await db.query(`SELECT count(*)::int AS c FROM event_questions`);
  assert.equal(Number(none.rows[0]!['c']), 0);
});
