/**
 * P3 — meetings, contacts, sharing.
 *
 * Claims: the owner can see, annotate, no-show and cancel their meetings (and
 * only theirs); bookers accrete into contacts unless excluded; a single-use
 * link books exactly once; confirmations carry an importable .ics; the embed
 * loader serves.
 */

import { test, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import EmbeddedPostgres from 'embedded-postgres';
import { migrate } from '../src/db.ts';
import { createPostgresDriver, type Database } from '../src/driver.ts';
import { handle, type AppDeps } from '../src/app.ts';
import { loadConfig } from '../src/config.ts';
import { RecordingMail, RetryingMail } from '../src/mail.ts';
import { icsFor } from '../src/ics.ts';

const PORT = 55441;
const NOW = '2026-06-01T08:00:00Z'; // a Monday
let pg: EmbeddedPostgres;
let db: Database;
let deps: AppDeps;
let mail: RecordingMail;

before(async () => {
  pg = new EmbeddedPostgres({
    databaseDir: '/tmp/pumasi-pg-meetings', user: 'pumasi', password: 'pumasi',
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
    set_overrides, contacts, contact_exclusions, single_use_links RESTART IDENTITY CASCADE`);
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
  handle(deps, { method, path, ip: opts.ip ?? '4.4.4.4', form: opts.form, cookie: opts.cookie, query: opts.query });

const cookieOf = (r: { headers: Record<string, string> }) =>
  (r.headers['set-cookie'] ?? '').split(';')[0]!;

async function ownerWithPage(email = 'p3@example.com', slug = 'intro') {
  await db.query(`INSERT INTO invites (code) VALUES ($1)`, [`inv-${email}-${slug}`]);
  const r = await call('POST', '/signup', {
    form: { invite: `inv-${email}-${slug}`, email, display_name: 'Mo', timezone: 'UTC' },
  });
  const cookie = cookieOf(r as never);
  const created = await call('POST', '/app/schedules', {
    cookie, form: { title: 'Intro', slug, duration_minutes: '30' },
  });
  const scheduleId = String(created.headers['location']).split('/').pop()!;
  const set = await db.query(
    `SELECT availability_set_id FROM schedules WHERE schedule_id = $1`, [scheduleId]);
  await call('POST', `/app/availability/${String(set.rows[0]!['availability_set_id'])}/hours`, {
    cookie, form: { MO_start: '09:00', MO_end: '17:00' },
  });
  return { cookie, scheduleId };
}

async function book(slug: string, start: string, name = 'Ada', email = 'ada@example.com') {
  const end = start.replace(/T(\d{2}):00/, (m, h) => `T${h}:30`);
  return call('POST', `/${slug}/book`, {
    form: { start, end, name, email, booker_tz: 'UTC' },
  });
}

// ── meetings ───────────────────────────────────────────────────────────────

test('the meetings page lists upcoming bookings and search narrows them', async () => {
  const { cookie } = await ownerWithPage();
  await book('intro', '2026-06-01T09:00:00Z', 'Ada', 'ada@example.com');
  await book('intro', '2026-06-01T10:00:00Z', 'Grace', 'grace@example.com');

  const page = await call('GET', '/app/meetings', { cookie });
  assert.equal(page.status, 200);
  assert.ok(page.body.includes('ada@example.com'));
  assert.ok(page.body.includes('grace@example.com'));

  const filtered = await call('GET', '/app/meetings', { cookie, query: { q: 'grace' } });
  assert.ok(!filtered.body.includes('ada@example.com'));
  assert.ok(filtered.body.includes('grace@example.com'));
});

test('owner cancel releases the slot and mails the booker', async () => {
  const { cookie } = await ownerWithPage();
  await book('intro', '2026-06-01T09:00:00Z');
  const b = await db.query(`SELECT booking_id FROM bookings WHERE status = 'confirmed'`);
  const id = String(b.rows[0]!['booking_id']);

  mail.sent.length = 0;
  const r = await call('POST', `/app/meetings/${id}/cancel`, { cookie });
  assert.equal(r.status, 303);
  const after = await db.query(`SELECT count(*)::int AS c FROM bookings WHERE status = 'confirmed'`);
  assert.equal(Number(after.rows[0]!['c']), 0);
  const cancelled = mail.sent.find((m) => m.kind === 'cancelled');
  assert.equal(cancelled?.to, 'ada@example.com');
});

test('no-show toggles and notes persist; another owner is refused (I4)', async () => {
  const { cookie } = await ownerWithPage();
  await book('intro', '2026-06-01T09:00:00Z');
  const b = await db.query(`SELECT booking_id FROM bookings`);
  const id = String(b.rows[0]!['booking_id']);

  await call('POST', `/app/meetings/${id}/noshow`, { cookie });
  await call('POST', `/app/meetings/${id}/note`, { cookie, form: { note: 'brought cookies' } });
  const row = await db.query(`SELECT no_show, owner_note FROM bookings WHERE booking_id = $1`, [id]);
  assert.equal(Number(row.rows[0]!['no_show']), 1);
  assert.equal(String(row.rows[0]!['owner_note']), 'brought cookies');

  const other = await ownerWithPage('other@example.com', 'other');
  const denied = await call('POST', `/app/meetings/${id}/noshow`, { cookie: other.cookie });
  assert.equal(denied.status, 404);
});

// ── contacts ───────────────────────────────────────────────────────────────

test('bookers accrete into contacts; rebooking counts up', async () => {
  const { cookie } = await ownerWithPage();
  await book('intro', '2026-06-01T09:00:00Z', 'Ada', 'Ada@Example.com');
  await book('intro', '2026-06-01T10:00:00Z', 'Ada L', 'ada@example.com');

  const c = await db.query(`SELECT name, times_booked FROM contacts`);
  assert.equal(c.rows.length, 1);
  assert.equal(Number(c.rows[0]!['times_booked']), 2);
  assert.equal(String(c.rows[0]!['name']), 'Ada L');

  const page = await call('GET', '/app/contacts', { cookie });
  assert.ok(page.body.includes('ada@example.com'));
});

test('an excluded domain never becomes a contact, and the booking still lands', async () => {
  const { cookie } = await ownerWithPage();
  await call('POST', '/app/contacts/exclusions', { cookie, form: { pattern: 'secret.org' } });

  const r = await book('intro', '2026-06-01T09:00:00Z', 'Spy', 'spy@secret.org');
  assert.equal(r.status, 200);
  const c = await db.query(`SELECT count(*)::int AS c FROM contacts`);
  assert.equal(Number(c.rows[0]!['c']), 0);
  const b = await db.query(`SELECT count(*)::int AS c FROM bookings WHERE status = 'confirmed'`);
  assert.equal(Number(b.rows[0]!['c']), 1);
});

// ── single-use links ───────────────────────────────────────────────────────

test('a single-use link books exactly once', async () => {
  const { cookie, scheduleId } = await ownerWithPage();
  await call('POST', `/app/event/${scheduleId}/single-use`, { cookie });
  const link = await db.query(`SELECT token FROM single_use_links`);
  const token = String(link.rows[0]!['token']);

  const page = await call('GET', `/s/${token}`);
  assert.equal(page.status, 200);
  assert.ok(page.body.includes(`/s/${token}/book`));

  const booked = await call('POST', `/s/${token}/book`, {
    form: { start: '2026-06-01T09:00:00Z', end: '2026-06-01T09:30:00Z',
            name: 'Once', email: 'once@example.com' },
  });
  assert.equal(booked.status, 200);

  const again = await call('GET', `/s/${token}`);
  assert.equal(again.status, 404);
  const rebook = await call('POST', `/s/${token}/book`, {
    form: { start: '2026-06-01T10:00:00Z', end: '2026-06-01T10:30:00Z',
            name: 'Twice', email: 'twice@example.com' },
  });
  assert.equal(rebook.status, 404);
});

// ── ics & embed & snippet ──────────────────────────────────────────────────

test('the booker confirmation carries an importable .ics', async () => {
  await ownerWithPage();
  await book('intro', '2026-06-01T09:00:00Z');
  const confirmed = mail.sent.find((m) => m.kind === 'confirmed' && m.to === 'ada@example.com');
  assert.ok(confirmed?.ics, 'no ics attached');
  assert.ok(confirmed!.ics!.includes('BEGIN:VEVENT'));
  assert.ok(confirmed!.ics!.includes('DTSTART:20260601T090000Z'));
});

test('ics escaping keeps structure with hostile titles', () => {
  const ics = icsFor({
    bookingId: 'x', title: 'a;b,c\nEND:VEVENT', start: '2026-06-01T09:00:00Z',
    end: '2026-06-01T09:30:00Z',
  });
  assert.ok(ics.includes('SUMMARY:a\\;b\\,c\\nEND:VEVENT'));
  // The hostile newline was escaped, so structurally there is still exactly
  // one line that IS the terminator.
  assert.equal(ics.split('\r\n').filter((l) => l === 'END:VEVENT').length, 1);
});

test('embed.js serves as cacheable javascript', async () => {
  const r = await call('GET', '/embed.js');
  assert.equal(r.status, 200);
  assert.ok(r.headers['content-type']!.includes('javascript'));
  assert.ok(r.body.includes('data-pumasi'));
});

test('the snippet page renders the next openings for pasting', async () => {
  const { cookie, scheduleId } = await ownerWithPage();
  const r = await call('GET', `/app/event/${scheduleId}/snippet`, { cookie });
  assert.equal(r.status, 200);
  assert.ok(r.body.includes('snip-data'));
  assert.ok(r.body.includes('2026-06-01T09:00:00Z'));
});
