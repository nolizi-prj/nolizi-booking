/**
 * P7 — workflows, webhooks, the job queue, and the public API.
 */

import { test, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { startPostgres, type TestPostgres } from './support/pg.ts';
import { migrate } from '../src/db.ts';
import { createPostgresDriver, type Database } from '../src/driver.ts';
import { handle, type AppDeps } from '../src/app.ts';
import { loadConfig } from '../src/config.ts';
import { RecordingMail, RetryingMail } from '../src/mail.ts';
import { processDueJobs } from '../src/automation.ts';

const NOW = '2026-06-01T08:00:00Z'; // a Monday
let pg: TestPostgres;
let db: Database;
let deps: AppDeps;
let mail: RecordingMail;

before(async () => {
  pg = await startPostgres('automation');
  db = await createPostgresDriver(pg.url);
  await migrate(db);
});
after(async () => { await db?.close(); await pg?.stop(); });

beforeEach(async () => {
  await db.query(`TRUNCATE sign_in_tokens, sessions, invites, bookings, idempotency_keys,
    availability_rules, date_overrides, schedules, owners, availability_sets, set_rules,
    set_overrides, workflows, jobs, webhooks, api_keys RESTART IDENTITY CASCADE`);
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

const call = (method: string, path: string, opts: Partial<{ form: Record<string,string>; cookie: string; query: Record<string,string>; ip: string; authorization: string }> = {}) =>
  handle(deps, { method, path, ip: opts.ip ?? '11.1.1.1', form: opts.form, cookie: opts.cookie,
    query: opts.query, authorization: opts.authorization });

const cookieOf = (r: { headers: Record<string, string> }) =>
  (r.headers['set-cookie'] ?? '').split(';')[0]!;

async function ownerWithPage() {
  await db.query(`INSERT INTO invites (code) VALUES ('inv-p7')`);
  const r = await call('POST', '/signup', {
    form: { invite: 'inv-p7', email: 'p7@example.com', display_name: 'Wf', timezone: 'UTC' },
  });
  const cookie = cookieOf(r as never);
  const created = await call('POST', '/app/schedules', {
    cookie, form: { title: 'Intro', slug: 'intro', duration_minutes: '30' },
  });
  const scheduleId = String(created.headers['location']).split('/').pop()!;
  const set = await db.query(
    `SELECT availability_set_id FROM schedules WHERE schedule_id = $1`, [scheduleId]);
  await call('POST', `/app/availability/${String(set.rows[0]!['availability_set_id'])}/hours`, {
    cookie, form: { MO_start: '09:00', MO_end: '17:00' },
  });
  return { cookie, scheduleId };
}

const book = (start: string, email = 'ada@example.com') =>
  call('POST', '/intro/book', {
    form: { start, end: start.replace(':00:00Z', ':30:00Z'),
            name: 'Ada', email, booker_tz: 'UTC' } });

test('a created-trigger workflow mails the booker with the template rendered', async () => {
  const { cookie } = await ownerWithPage();
  await call('POST', '/app/workflows', {
    cookie, form: { title: 'Welcome', trigger: 'booking_created', offset_minutes: '0',
      recipient: 'booker', subject: 'Thanks {{name}}',
      body: 'See you for {{title}} at {{start}}.' } });

  await book('2026-06-01T10:00:00Z');
  await processDueJobs(db, deps.mail, NOW);

  const wf = mail.sent.find((m) => m.kind === 'custom');
  assert.ok(wf, 'workflow mail missing');
  assert.equal(wf!.to, 'ada@example.com');
  assert.equal(wf!.subject, 'Thanks Ada');
  assert.ok(wf!.body!.includes('Intro'));
  assert.ok(wf!.body!.includes('2026-06-01 10:00 (UTC)'));
});

test('a before-event reminder waits for its moment, and dies with a cancellation', async () => {
  const { cookie } = await ownerWithPage();
  await call('POST', '/app/workflows', {
    cookie, form: { title: 'Reminder', trigger: 'before_event', offset_minutes: '60',
      recipient: 'booker', subject: 'Soon: {{title}}', body: 'At {{start}}.' } });

  await book('2026-06-01T14:00:00Z');
  // Not due yet at NOW, nor a minute before the send time.
  await processDueJobs(db, deps.mail, NOW);
  assert.ok(!mail.sent.some((m) => m.kind === 'custom'));
  await processDueJobs(db, deps.mail, '2026-06-01T12:59:00Z');
  assert.ok(!mail.sent.some((m) => m.kind === 'custom'));
  // Due at start − 60min.
  await processDueJobs(db, deps.mail, '2026-06-01T13:00:00Z');
  assert.ok(mail.sent.some((m) => m.kind === 'custom' && m.subject === 'Soon: Intro'));

  // A second booking's reminder is erased by cancelling that booking.
  mail.sent.length = 0;
  await book('2026-06-01T15:00:00Z', 'bo@example.com');
  const tok = await db.query(
    `SELECT token FROM bookings WHERE booker_email = 'bo@example.com'`);
  await call('POST', `/b/${String(tok.rows[0]!['token'])}/cancel`);
  await processDueJobs(db, deps.mail, '2026-06-01T14:00:00Z');
  assert.ok(!mail.sent.some((m) => m.kind === 'custom' && m.to === 'bo@example.com'),
    'reminder for a cancelled booking still sent');
});

test('marking a no-show fires its workflow once; clearing it does not', async () => {
  const { cookie } = await ownerWithPage();
  await call('POST', '/app/workflows', { cookie, form: {
    title: 'No-show recovery', trigger: 'booking_no_show', offset_minutes: '0',
    recipient: 'booker', subject: 'We missed you, {{name}}', body: 'Reschedule {{title}}.',
  } });
  await book('2026-06-01T10:00:00Z', 'late@example.com');
  const booking = await db.query(
    `SELECT booking_id FROM bookings WHERE booker_email = 'late@example.com'`);
  const id = String(booking.rows[0]!['booking_id']);

  await call('POST', `/app/meetings/${id}/noshow`, { cookie });
  await processDueJobs(db, deps.mail, NOW);
  assert.equal(mail.sent.filter((m) => m.subject === 'We missed you, Ada').length, 1);

  await call('POST', `/app/meetings/${id}/noshow`, { cookie });
  await processDueJobs(db, deps.mail, NOW);
  assert.equal(mail.sent.filter((m) => m.subject === 'We missed you, Ada').length, 1,
    'clearing a no-show must not send the recovery message again');
});

test('webhooks deliver signed JSON, retry on failure, and give up at five', async () => {
  const { cookie } = await ownerWithPage();
  await call('POST', '/app/webhooks', {
    cookie, form: { url: 'https://hooks.example.com/x', format: 'json' } });

  const calls: { body: string; sig: string }[] = [];
  let failing = true;
  const realFetch = globalThis.fetch;
  globalThis.fetch = (async (url: unknown, init?: RequestInit) => {
    if (String(url).startsWith('https://hooks.example.com/')) {
      calls.push({
        body: String(init?.body),
        sig: String((init?.headers as Record<string, string>)['x-pumasi-signature']),
      });
      return new Response('no', { status: failing ? 500 : 200 });
    }
    return realFetch(url as never, init as never);
  }) as typeof fetch;

  try {
    await book('2026-06-01T10:00:00Z');
    await processDueJobs(db, deps.mail, NOW);
    assert.equal(calls.length, 1);
    const payload = JSON.parse(calls[0]!.body) as { event: string; data: { booker_name: string } };
    assert.equal(payload.event, 'booking_created');
    assert.equal(payload.data.booker_name, 'Ada');
    assert.match(calls[0]!.sig, /^[0-9a-f]{64}$/);

    // Retry backoff: attempts move run_at forward; drive time until failure.
    let t = NOW;
    for (let i = 0; i < 10; i++) {
      t = '2026-06-0' + (1 + Math.min(8, i)) + 'T23:00:00Z';
      await processDueJobs(db, deps.mail, t);
    }
    const job = await db.query(`SELECT job_id, status, attempts FROM jobs WHERE kind = 'webhook'`);
    assert.equal(String(job.rows[0]!['status']), 'failed');
    assert.equal(Number(job.rows[0]!['attempts']), 5);
    const history = await call('GET', '/app/webhooks', { cookie });
    assert.ok(history.body.includes('Delivery history'));
    assert.ok(history.body.includes('delivery-failed'));
    assert.ok(history.body.includes('>Retry</button>'));
    const retry = await call('POST', '/app/webhooks/retry', {
      cookie, form: { id: String(job.rows[0]!['job_id']) },
    });
    assert.equal(retry.status, 303);
    assert.equal(retry.headers['location'], '/app/webhooks?retried=1');
    const reset = await db.query(`SELECT status, attempts FROM jobs WHERE job_id = $1`,
      [String(job.rows[0]!['job_id'])]);
    assert.deepEqual(reset.rows[0], { status: 'pending', attempts: 0 });
  } finally {
    globalThis.fetch = realFetch;
    failing = false;
  }
});

test('the slack format posts a text payload', async () => {
  const { cookie } = await ownerWithPage();
  await call('POST', '/app/webhooks', {
    cookie, form: { url: 'https://hooks.slack.com/services/T/B/x', format: 'slack' } });
  let seen = '';
  const realFetch = globalThis.fetch;
  globalThis.fetch = (async (url: unknown, init?: RequestInit) => {
    if (String(url).startsWith('https://hooks.slack.com/')) {
      seen = String(init?.body);
      return new Response('ok', { status: 200 });
    }
    return realFetch(url as never, init as never);
  }) as typeof fetch;
  try {
    await book('2026-06-01T10:00:00Z');
    await processDueJobs(db, deps.mail, NOW);
  } finally { globalThis.fetch = realFetch; }
  const body = JSON.parse(seen) as { text: string };
  assert.ok(body.text.includes('booking created'));
  assert.ok(body.text.includes('Ada'));
});

test('the API books, lists, and cancels with a bearer key; a bad key gets 401', async () => {
  const { cookie } = await ownerWithPage();
  const keyPage = await call('POST', '/app/api-keys', { cookie, form: { name: 'Test' } });
  const key = keyPage.body.match(/pk_[A-Za-z0-9_-]+/)![0];

  const noAuth = await call('GET', '/api/v1/event-types');
  assert.equal(noAuth.status, 401);
  const badAuth = await call('GET', '/api/v1/event-types', { authorization: 'Bearer pk_wrong' });
  assert.equal(badAuth.status, 401);

  const types = await call('GET', '/api/v1/event-types', { authorization: `Bearer ${key}` });
  assert.equal(types.status, 200);
  assert.ok(types.body.includes('"intro"'));

  const slots = await call('GET', '/api/v1/slots', {
    authorization: `Bearer ${key}`, query: { event_type: 'intro' } });
  assert.ok(slots.body.includes('2026-06-01T09:00:00Z'));

  const made = await call('POST', '/api/v1/bookings', {
    authorization: `Bearer ${key}`,
    form: { event_type: 'intro', start: '2026-06-01T09:00:00Z', end: '2026-06-01T09:30:00Z',
            name: 'Api', email: 'api@example.com' } });
  assert.equal(made.status, 201);
  const bookingId = (JSON.parse(made.body) as { booking: { booking_id: string } }).booking.booking_id;

  const listed = await call('GET', '/api/v1/bookings', { authorization: `Bearer ${key}` });
  assert.ok(listed.body.includes(bookingId));

  const gone = await call('POST', `/api/v1/bookings/${bookingId}/cancel`, {
    authorization: `Bearer ${key}` });
  assert.equal(gone.status, 200);
  const left = await db.query(`SELECT count(*)::int AS c FROM bookings WHERE status = 'confirmed'`);
  assert.equal(Number(left.rows[0]!['c']), 0);
});
