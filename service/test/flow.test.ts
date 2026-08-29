/**
 * SPEC-0002 — the booking flow, end to end.
 *
 * Real PostgreSQL semantics (PGlite + btree_gist), the real engine, the real
 * handler. Nothing is stubbed except mail, which is a port precisely so it can
 * be.
 */

import { test, before, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { migrate } from '../src/db.ts';
import { createPgliteDriver, type Database } from '../src/driver.ts';
import { handle, type AppDeps } from '../src/app.ts';
import { loadConfig } from '../src/config.ts';
import { AlwaysFailingMail, RecordingMail, RetryingMail } from '../src/mail.ts';
import type { SqlClient } from '../src/store.ts';

let db: Database;
let sql: SqlClient;
let mail: RecordingMail;
let deps: AppDeps;

// A Monday, 09:00–17:00 New York. 13:00Z is the first slot.
const NOW = '2026-06-01T08:00:00Z';

async function seed(): Promise<void> {
  await sql.query(`DELETE FROM rate_events`);
  await sql.query(`DELETE FROM idempotency_keys`);
  await sql.query(`DELETE FROM bookings`);
  await sql.query(`DELETE FROM availability_rules`);
  await sql.query(`DELETE FROM schedules`);
  await sql.query(`DELETE FROM owners`);
  await sql.query(
    `INSERT INTO owners (owner_id, email, display_name, timezone)
     VALUES ('o1','owner@example.com','Owner','America/New_York')`,
  );
  await sql.query(
    `INSERT INTO schedules (schedule_id, owner_id, slug, title, duration_minutes,
        granularity_minutes, minimum_notice_minutes, maximum_horizon_days)
     VALUES ('s1','o1','intro','Intro call',60,60,0,30)`,
  );
  await sql.query(
    `INSERT INTO availability_rules (schedule_id, weekday, starts_local, ends_local)
     VALUES ('s1','MO','09:00','12:00')`,
  );
}

before(async () => {
  db = await createPgliteDriver();
  sql = db;
  await migrate(sql);
});

beforeEach(async () => {
  await seed();
  mail = new RecordingMail();
  deps = {
    sql,
    tx: db,
    config: loadConfig({} as NodeJS.ProcessEnv),
    mail: new RetryingMail(mail),
    now: () => NOW,
    ready: () => true,
  };
});

const get = (path: string, ip = '1.1.1.1') => handle(deps, { method: 'GET', path, ip });
const post = (path: string, form: Record<string, string>, ip = '1.1.1.1') =>
  handle(deps, { method: 'POST', path, ip, form });

test('health is up; readiness reports the versions actually in use', async () => {
  const h = await get('/healthz');
  assert.equal(h.status, 200);

  const r = await get('/readyz');
  assert.equal(r.status, 200);
  const body = JSON.parse(r.body) as { status: string; tzdata: string };
  assert.equal(body.status, 'ready');
  assert.ok(body.tzdata && body.tzdata !== 'unknown', 'O4 requires the tzdata version be reported');

  // O3 · not-ready is distinct from unhealthy.
  const notReady = await handle({ ...deps, ready: () => false }, { method: 'GET', path: '/readyz', ip: '1.1.1.1' });
  assert.equal(notReady.status, 503);
});

test('F1 the page offers exactly the slots the engine returned', async () => {
  const page = await get('/intro');
  assert.equal(page.status, 200);
  // 09:00–12:00 New York on Monday 2026-06-01 is 13:00Z–16:00Z: three slots.
  for (const t of ['2026-06-01T13:00:00Z', '2026-06-01T14:00:00Z', '2026-06-01T15:00:00Z']) {
    assert.ok(page.body.includes(t), `expected ${t} on the page`);
  }
  assert.ok(!page.body.includes('data-start=\"2026-06-01T16:00:00Z\"'), 'no slot STARTS at 16:00Z — S5 forbids spilling past the window');
});

test('F2 the page sends UTC and converts only for display', async () => {
  const page = await get('/intro');
  assert.ok(page.body.includes('data-start="2026-06-01T13:00:00Z"'), 'server emits UTC');
  assert.ok(page.body.includes('resolvedOptions().timeZone'), 'the browser supplies the display zone');
  // The submitted field is the server's UTC value, not a formatted string.
  assert.ok(page.body.includes(`document.getElementById('start').value = s.start`));
});

test('a booking is confirmed, stored, and removed from the page', async () => {
  const r = await post('/intro/book', {
    start: '2026-06-01T13:00:00Z',
    end: '2026-06-01T14:00:00Z',
    name: 'Ada',
    email: 'ada@example.com',
    booker_tz: 'Europe/London',
  });
  assert.equal(r.status, 200);
  assert.ok(r.body.includes('Booked'));

  const { rows } = await sql.query(`SELECT booker_name, status, schedule_id FROM bookings`);
  assert.equal(rows.length, 1);
  assert.equal(rows[0]?.['booker_name'], 'Ada');
  assert.equal(rows[0]?.['status'], 'confirmed');
  assert.equal(rows[0]?.['schedule_id'], 's1');

  const page = await get('/intro');
  assert.ok(!page.body.includes('data-start="2026-06-01T13:00:00Z"'), 'the taken slot is gone');
  assert.ok(page.body.includes('data-start="2026-06-01T14:00:00Z"'), 'the others remain');
});

test('F4 a slot taken between render and submit returns conflict with a refreshed list', async () => {
  await post('/intro/book', {
    start: '2026-06-01T13:00:00Z', end: '2026-06-01T14:00:00Z',
    name: 'Ada', email: 'ada@example.com',
  });
  const second = await post('/intro/book', {
    start: '2026-06-01T13:00:00Z', end: '2026-06-01T14:00:00Z',
    name: 'Grace', email: 'grace@example.com',
  }, '2.2.2.2');
  assert.equal(second.status, 409);
  // The engine no longer offers the taken slot, so F1 refuses it before the
  // database is asked. Either way the outcome is the one that matters: refused,
  // with the times that ARE available.
  assert.match(second.body, /not available|just took that time/);
  assert.ok(second.body.includes('2026-06-01T14:00:00Z'), 'the refreshed list is included');

  const { rows } = await sql.query(`SELECT count(*)::int AS c FROM bookings WHERE status='confirmed'`);
  assert.equal(Number(rows[0]?.['c']), 1);
});

test('F5 a double submission creates one booking', async () => {
  const form = {
    start: '2026-06-01T13:00:00Z', end: '2026-06-01T14:00:00Z',
    name: 'Ada', email: 'ada@example.com', idempotency_key: 'k-double',
  };
  const a = await post('/intro/book', form);
  const b = await post('/intro/book', form);
  assert.equal(a.status, 200);
  assert.equal(b.status, 200);
  const { rows } = await sql.query(`SELECT count(*)::int AS c FROM bookings WHERE status='confirmed'`);
  assert.equal(Number(rows[0]?.['c']), 1, 'users double-click');
});

test('B3 a slot that has passed the notice window is refused at commit', async () => {
  await sql.query(`UPDATE schedules SET minimum_notice_minutes = 600 WHERE schedule_id='s1'`);
  const r = await post('/intro/book', {
    start: '2026-06-01T13:00:00Z', end: '2026-06-01T14:00:00Z',
    name: 'Ada', email: 'ada@example.com',
  });
  assert.equal(r.status, 409);
  // F1 recomputes at commit time, so a slot inside the notice window is not
  // offered any more and is refused there. B3's guarantee holds either way:
  // nothing is confirmed, and nothing is left behind.
  assert.match(r.body, /not available|That time has passed/);
  const { rows } = await sql.query(`SELECT count(*)::int AS c FROM bookings`);
  assert.equal(Number(rows[0]?.['c']), 0, 'B4 — a non-confirmed result leaves no trace');
});

test('M3 a total mail outage does not invalidate a confirmed booking', async () => {
  const failing = new RetryingMail(new AlwaysFailingMail());
  const r = await handle(
    { ...deps, mail: failing },
    { method: 'POST', path: '/intro/book', ip: '3.3.3.3',
      form: { start: '2026-06-01T13:00:00Z', end: '2026-06-01T14:00:00Z',
              name: 'Ada', email: 'ada@example.com' } },
  );
  assert.equal(r.status, 200, 'the booking stands');
  assert.ok(r.body.includes('Booked'), 'and the page says so');
  const { rows } = await sql.query(`SELECT count(*)::int AS c FROM bookings WHERE status='confirmed'`);
  assert.equal(Number(rows[0]?.['c']), 1);
  assert.equal(failing.failed.length, 2, 'both messages are queued for retry, not lost');
});

test('M5 both parties are notified, and the booker gets the management link', async () => {
  await post('/intro/book', {
    start: '2026-06-01T13:00:00Z', end: '2026-06-01T14:00:00Z',
    name: 'Ada', email: 'ada@example.com', booker_tz: 'Europe/London',
  });
  assert.equal(mail.sent.length, 2);
  const toBooker = mail.sent.find((m) => m.to === 'ada@example.com');
  const toOwner = mail.sent.find((m) => m.to === 'owner@example.com');
  assert.ok(toBooker?.token, 'M4 — the booker gets the management link');
  assert.equal(toBooker?.timezone, 'Europe/London', 'rendered in the recipient’s zone');
  assert.ok(toOwner, 'the owner learns their calendar changed');
});

test('L1/L2 the management link works and reveals only its own booking', async () => {
  await post('/intro/book', {
    start: '2026-06-01T13:00:00Z', end: '2026-06-01T14:00:00Z',
    name: 'Ada', email: 'ada@example.com',
  });
  const token = mail.sent.find((m) => m.to === 'ada@example.com')?.token;
  assert.ok(token);
  assert.ok(token.length >= 22, 'L1 — at least 128 bits, base64url encoded');

  const page = await get(`/b/${token}`);
  assert.equal(page.status, 200);
  assert.ok(page.body.includes('Your booking'));

  // L2 · an unknown token is indistinguishable from one that exists but is not
  // yours — it does not confirm anything about other bookings.
  const bogus = await get('/b/aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa');
  assert.equal(bogus.status, 404);
});

test('B5 cancelling from the link frees the interval immediately', async () => {
  await post('/intro/book', {
    start: '2026-06-01T13:00:00Z', end: '2026-06-01T14:00:00Z',
    name: 'Ada', email: 'ada@example.com',
  });
  const token = mail.sent.find((m) => m.to === 'ada@example.com')!.token!;
  const cancelled = await post(`/b/${token}/cancel`, {});
  assert.equal(cancelled.status, 200);

  const page = await get('/intro');
  assert.ok(page.body.includes('data-start="2026-06-01T13:00:00Z"'), 'the slot is bookable again');
});

test('D8 a bearer link cannot delete personal data in one step', async () => {
  await post('/intro/book', {
    start: '2026-06-01T13:00:00Z', end: '2026-06-01T14:00:00Z',
    name: 'Ada', email: 'ada@example.com',
  });
  const token = mail.sent.find((m) => m.to === 'ada@example.com')!.token!;

  const unconfirmed = await post(`/b/${token}/delete`, {});
  assert.equal(unconfirmed.status, 400);
  const still = await sql.query(`SELECT booker_email FROM bookings WHERE token = $1`, [token]);
  assert.equal(still.rows[0]?.['booker_email'], 'ada@example.com', 'nothing deleted without confirmation');

  const confirmed = await post(`/b/${token}/delete`, { confirm: 'yes' });
  assert.equal(confirmed.status, 200);
  const gone = await sql.query(`SELECT booker_email, booker_name FROM bookings WHERE token = $1`, [token]);
  assert.equal(gone.rows[0]?.['booker_email'], null, 'D3 — removed, not flagged');
  assert.equal(gone.rows[0]?.['booker_name'], null);
});

test('F3 extra personal fields are not stored', async () => {
  await post('/intro/book', {
    start: '2026-06-01T13:00:00Z', end: '2026-06-01T14:00:00Z',
    name: 'Ada', email: 'ada@example.com',
    phone: '+15550000', notes: 'private matter', address: '10 Downing St',
  });
  const { rows } = await sql.query(`SELECT * FROM bookings LIMIT 1`);
  const stored = JSON.stringify(rows[0]);
  assert.ok(!stored.includes('15550000'), 'no phone');
  assert.ok(!stored.includes('private matter'), 'no notes');
  assert.ok(!stored.includes('Downing'), 'no address');
});

test('D9 the booker is told what is stored, next to the field', async () => {
  const page = await get('/intro');
  assert.ok(page.body.includes('We store your name, email and the meeting time'));
  assert.ok(page.body.includes('deletes these details'));
});

test('I6 the booking surface is rate-limited and sends no mail when limited', async () => {
  const form = {
    start: '2026-06-01T15:00:00Z', end: '2026-06-01T16:00:00Z',
    name: 'X', email: 'x@example.com',
  };
  let limited = 0;
  for (let i = 0; i < 10; i++) {
    const r = await post('/intro/book', { ...form, idempotency_key: `k${i}` }, '9.9.9.9');
    if (r.status === 429) limited++;
  }
  assert.ok(limited > 0, 'the limit must actually fire');
  assert.ok(mail.sent.length <= 2, 'rate-limited attempts send no mail');
});

test('I2 public signup is off by default and honoured when explicitly enabled', async () => {
  const dflt = loadConfig({} as unknown as NodeJS.ProcessEnv);
  assert.equal(dflt.publicSignup, false, 'absent configuration means disabled');
  const on = loadConfig({ PUBLIC_SIGNUP: 'true' } as unknown as NodeJS.ProcessEnv);
  assert.equal(on.publicSignup, true, 'an explicit true is an operator decision, and is honoured');
  const junk = loadConfig({ PUBLIC_SIGNUP: 'perhaps' } as unknown as NodeJS.ProcessEnv);
  assert.equal(junk.publicSignup, false, 'unparseable is not a licence to guess');
});

test('D1 the ceilings default low and may be raised or lowered', async () => {
  const dflt = loadConfig({} as unknown as NodeJS.ProcessEnv);
  assert.equal(dflt.maxBookingsRetained, 200, 'the default keeps the choice visible');
  const raised = loadConfig({ MAX_BOOKINGS: '99999' } as unknown as NodeJS.ProcessEnv);
  assert.equal(raised.maxBookingsRetained, 99999, 'raising is an operator decision');
  const lowered = loadConfig({ MAX_BOOKINGS: '10' } as unknown as NodeJS.ProcessEnv);
  assert.equal(lowered.maxBookingsRetained, 10, 'lowering is permitted');
});

test('D1 the booking ceiling is enforced, not merely configured', async () => {
  const tiny = { ...deps, config: { ...deps.config, maxBookingsRetained: 1 } };
  await handle(tiny, { method: 'POST', path: '/intro/book', ip: '4.4.4.4',
    form: { start: '2026-06-01T13:00:00Z', end: '2026-06-01T14:00:00Z', name: 'A', email: 'a@example.com' } });
  const second = await handle(tiny, { method: 'POST', path: '/intro/book', ip: '5.5.5.5',
    form: { start: '2026-06-01T14:00:00Z', end: '2026-06-01T15:00:00Z', name: 'B', email: 'b@example.com' } });
  assert.equal(second.status, 503);
  assert.ok(second.body.includes('booking limit'));
});

test('a replay never discloses the management token', async () => {
  // The default idempotency key is derived from slug, start and email -- all of
  // which an attacker can guess or already knows. Returning the token on replay
  // would hand a bearer credential that cancels and deletes someone else's
  // booking to anyone who guesses an email address. Found in adversarial review.
  await post('/intro/book', {
    start: '2026-06-01T13:00:00Z', end: '2026-06-01T14:00:00Z',
    name: 'Ada', email: 'ada@example.com',
  });
  const token = mail.sent.find((m) => m.to === 'ada@example.com')!.token!;

  const replay = await post('/intro/book', {
    start: '2026-06-01T13:00:00Z', end: '2026-06-01T14:00:00Z',
    name: 'Mallory', email: 'ada@example.com',
  }, '6.6.6.6');

  assert.equal(replay.status, 200);
  assert.ok(!replay.body.includes(token), 'the token must not appear in a replay response');
  assert.ok(!replay.body.includes('/b/'), 'nor a management link of any kind');
  assert.ok(replay.body.includes('confirmation message'), 'point the real booker at their email instead');
});

test('the booking page cannot be broken out of by slot data', async () => {
  // JSON injected raw into a <script> body breaks out on "</script>". The data
  // now lives in a JSON script tag with "<" escaped.
  const page = await get('/intro');
  assert.ok(page.body.includes('type="application/json" id="slots-data"'));
  assert.ok(!/<script>[^<]*var all = \[/.test(page.body), 'slot data is not inlined into executable script');
});

test('L4 a booking can be moved from the management link', async () => {
  await post('/intro/book', {
    start: '2026-06-01T13:00:00Z', end: '2026-06-01T14:00:00Z',
    name: 'Ada', email: 'ada@example.com', booker_tz: 'Europe/London',
  });
  const token = mail.sent.find((m) => m.to === 'ada@example.com')!.token!;

  const page = await get(`/b/${token}`);
  assert.ok(page.body.includes('Move it'), 'the manage page offers other times');
  assert.ok(page.body.includes('data-start="2026-06-01T14:00:00Z"'), 'and they are real slots');

  mail.sent.length = 0;
  const moved = await post(`/b/${token}/reschedule`, {
    start: '2026-06-01T15:00:00Z', end: '2026-06-01T16:00:00Z',
  });
  assert.equal(moved.status, 200);

  const { rows } = await sql.query(
    `SELECT starts_at FROM bookings WHERE status='confirmed'`,
  );
  assert.equal(rows.length, 1, 'exactly one confirmed interval — never two, never none');
  assert.equal(new Date(String(rows[0]?.['starts_at'])).toISOString(), '2026-06-01T15:00:00.000Z');

  // M5 · both parties learn it moved.
  assert.equal(mail.sent.filter((m) => m.kind === 'rescheduled').length, 2);

  // The vacated time is bookable again.
  const publicPage = await get('/intro');
  assert.ok(publicPage.body.includes('data-start="2026-06-01T13:00:00Z"'), 'the old slot is free');
});

test('L4 a move into a taken slot conflicts and leaves the booking unmoved', async () => {
  await post('/intro/book', {
    start: '2026-06-01T13:00:00Z', end: '2026-06-01T14:00:00Z',
    name: 'Ada', email: 'ada@example.com',
  });
  const token = mail.sent.find((m) => m.to === 'ada@example.com')!.token!;
  await post('/intro/book', {
    start: '2026-06-01T15:00:00Z', end: '2026-06-01T16:00:00Z',
    name: 'Grace', email: 'grace@example.com',
  }, '2.2.2.2');

  const clash = await post(`/b/${token}/reschedule`, {
    start: '2026-06-01T15:00:00Z', end: '2026-06-01T16:00:00Z',
  });
  assert.equal(clash.status, 409);
  assert.match(clash.body, /not available|just took that time/);

  const { rows } = await sql.query(
    `SELECT starts_at FROM bookings WHERE status='confirmed' ORDER BY starts_at`,
  );
  assert.equal(rows.length, 2);
  assert.equal(
    new Date(String(rows[0]?.['starts_at'])).toISOString(),
    '2026-06-01T13:00:00.000Z',
    'a failed move leaves the booking exactly where it was',
  );
});

test('L3 a management link stops working after the booking is long past', async () => {
  await post('/intro/book', {
    start: '2026-06-01T13:00:00Z', end: '2026-06-01T14:00:00Z',
    name: 'Ada', email: 'ada@example.com',
  });
  const token = mail.sent.find((m) => m.to === 'ada@example.com')!.token!;

  assert.equal((await get(`/b/${token}`)).status, 200, 'valid while the booking is current');

  // Eight days after the meeting ended, past the seven-day grace.
  const later = { ...deps, now: () => '2026-06-09T14:00:00Z' };
  const expired = await handle(later, { method: 'GET', path: `/b/${token}`, ip: '1.1.1.1' });
  assert.equal(expired.status, 404, 'an old link in an old mailbox stops working');
  assert.ok(expired.body.includes('not valid'), 'and says nothing about why');

  // It cannot act either, not merely display.
  const cancel = await handle(later, { method: 'POST', path: `/b/${token}/cancel`, ip: '1.1.1.1', form: {} });
  assert.equal(cancel.status, 404);
});

test('O5 results do not depend on the host timezone', async () => {
  // The server must never consult its own zone. Rendering the same page under a
  // host in Auckland and a host in UTC must produce byte-identical output.
  const original = process.env['TZ'];
  try {
    process.env['TZ'] = 'UTC';
    const a = await get('/intro');
    process.env['TZ'] = 'Pacific/Auckland';
    const b = await get('/intro');
    process.env['TZ'] = 'America/Los_Angeles';
    const c = await get('/intro');
    assert.equal(a.body, b.body, 'Auckland and UTC must agree');
    assert.equal(a.body, c.body, 'Los Angeles and UTC must agree');
  } finally {
    if (original === undefined) delete process.env['TZ'];
    else process.env['TZ'] = original;
  }
});

test('F1 an interval the engine never offered is refused', async () => {
  // The whole point: the form is not trusted. Each of these is a perfectly
  // well-formed request that the database alone would have accepted, because
  // it only forbids OVERLAP -- so without this check an attacker could park a
  // booking anywhere on a real person's calendar.
  const attacks = [
    { name: 'the middle of the night', start: '2026-06-02T03:00:00Z', end: '2026-06-02T04:00:00Z' },
    { name: 'an entire week', start: '2026-06-01T13:00:00Z', end: '2026-06-08T13:00:00Z' },
    { name: 'the wrong duration', start: '2026-06-01T13:00:00Z', end: '2026-06-01T13:07:00Z' },
    { name: 'a time outside every rule', start: '2026-06-06T13:00:00Z', end: '2026-06-06T14:00:00Z' },
    { name: 'an off-grid start', start: '2026-06-01T13:17:00Z', end: '2026-06-01T14:17:00Z' },
  ];
  for (const a of attacks) {
    const r = await post('/intro/book', {
      start: a.start, end: a.end, name: 'M', email: 'm@example.com',
      idempotency_key: `atk-${a.start}`,
    }, '7.7.7.7');
    assert.equal(r.status, 409, `${a.name} must be refused`);
  }
  const { rows } = await sql.query(`SELECT count(*)::int AS c FROM bookings`);
  assert.equal(Number(rows[0]?.['c']), 0, 'not one of them created a booking');
});

test('the confirmation page does not carry the management token', async () => {
  const r = await post('/intro/book', {
    start: '2026-06-01T13:00:00Z', end: '2026-06-01T14:00:00Z',
    name: 'Ada', email: 'ada@example.com',
  });
  assert.equal(r.status, 200);
  const token = mail.sent.find((m) => m.to === 'ada@example.com')!.token!;
  assert.ok(!r.body.includes(token), 'the token belongs in the mailbox, not on a screen');
  assert.ok(!r.body.includes('/b/'), 'nor a management link of any kind');
});

test('L3 a cancelled booking’s link stops working immediately', async () => {
  await post('/intro/book', {
    start: '2026-06-01T13:00:00Z', end: '2026-06-01T14:00:00Z',
    name: 'Ada', email: 'ada@example.com',
  });
  const token = mail.sent.find((m) => m.to === 'ada@example.com')!.token!;
  await post(`/b/${token}/cancel`, {});
  const after = await get(`/b/${token}`);
  assert.equal(after.status, 404, 'a cancelled booking’s link is spent');
});
