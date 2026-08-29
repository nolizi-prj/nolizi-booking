/**
 * D-105 — the privacy pack.
 *
 * The documents must be reachable, must name what the code actually stores and
 * who actually sees it, and the deletion they promise must be the deletion the
 * code performs. That last one is the point: a policy describing a deletion
 * that does not happen is worse than no policy.
 */

import { test, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import EmbeddedPostgres from 'embedded-postgres';
import { migrate } from '../src/db.ts';
import { createPostgresDriver, type Database } from '../src/driver.ts';
import { handle, type AppDeps } from '../src/app.ts';
import { loadConfig } from '../src/config.ts';
import { RecordingMail, RetryingMail } from '../src/mail.ts';
import { LEGAL_DOCS } from '../src/legal.ts';
import { RESERVED_SLUGS } from '../src/identity.ts';

const PORT = 55448;
const NOW = '2026-06-01T08:00:00Z'; // a Monday
let pg: EmbeddedPostgres;
let db: Database;
let deps: AppDeps;

before(async () => {
  pg = new EmbeddedPostgres({
    databaseDir: '/tmp/pumasi-pg-legal', user: 'pumasi', password: 'pumasi',
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
    set_overrides, contacts, contact_exclusions, jobs, workflows RESTART IDENTITY CASCADE`);
  await db.query(`DELETE FROM rate_events`);
  deps = {
    sql: db, tx: db,
    config: loadConfig({ BASE_URL: 'https://booking.test' } as NodeJS.ProcessEnv),
    mail: new RetryingMail(new RecordingMail()),
    now: () => NOW,
    ready: () => true,
  };
});

const call = (method: string, path: string, opts: Partial<{ form: Record<string,string>; cookie: string; query: Record<string,string>; ip: string }> = {}) =>
  handle(deps, { method, path, ip: opts.ip ?? '13.1.1.1', form: opts.form, cookie: opts.cookie, query: opts.query });

const cookieOf = (r: { headers: Record<string, string> }) =>
  (r.headers['set-cookie'] ?? '').split(';')[0]!;

async function ownerWithPage() {
  await db.query(`INSERT INTO invites (code) VALUES ('inv-legal')`);
  const r = await call('POST', '/signup', {
    form: { invite: 'inv-legal', email: 'legal@example.com', display_name: 'Le', timezone: 'UTC' },
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
  return { cookie };
}

test('every document in the pack is reachable and titled', async () => {
  for (const doc of LEGAL_DOCS) {
    const r = await call('GET', `/${doc.slug}`);
    assert.equal(r.status, 200, `${doc.slug} did not serve`);
    assert.ok(r.body.includes(doc.title), `${doc.slug} missing its title`);
  }
  assert.deepEqual(LEGAL_DOCS.map((d) => d.slug).sort(),
    ['dpa', 'privacy', 'subprocessors', 'terms']);
});

test('the privacy notice names the data the code actually stores', async () => {
  const r = await call('GET', '/privacy');
  for (const claim of ['name', 'email address', 'timezone', 'private note',
                       'free/busy', 'two hours', 'management link']) {
    assert.ok(r.body.includes(claim), `privacy notice never mentions "${claim}"`);
  }
  // and it must not claim tracking we do not do
  assert.ok(r.body.includes('no analytics') || r.body.includes('run no analytics'));
});

test('the register names the providers actually in use', async () => {
  const r = await call('GET', '/subprocessors');
  for (const provider of ['Cloudflare', 'Google', 'Microsoft']) {
    assert.ok(r.body.includes(provider), `register omits ${provider}`);
  }
});

test('the booking page points a booker at the privacy notice', async () => {
  await ownerWithPage();
  const page = await call('GET', '/intro');
  assert.ok(page.body.includes('href="/privacy"'), 'no route from collection to notice');
});

test('a booker deleting their details removes the contact and any queued mail', async () => {
  const { cookie } = await ownerWithPage();
  // a workflow so the booking enqueues mail carrying the booker's details
  await call('POST', '/app/workflows', {
    cookie, form: { title: 'Remind', trigger: 'before_event', offset_minutes: '60',
      recipient: 'booker', subject: 'Soon {{name}}', body: 'At {{start}}' } });

  await call('POST', '/intro/book', {
    form: { start: '2026-06-01T14:00:00Z', end: '2026-06-01T14:30:00Z',
            name: 'Ada', email: 'ada@example.com', booker_tz: 'UTC' } });

  assert.equal(Number((await db.query(`SELECT count(*)::int AS c FROM contacts`)).rows[0]!['c']), 1);
  assert.ok(Number((await db.query(
    `SELECT count(*)::int AS c FROM jobs WHERE status = 'pending'`)).rows[0]!['c']) > 0);

  const tok = await db.query(`SELECT token FROM bookings WHERE status = 'confirmed'`);
  const del = await call('POST', `/b/${String(tok.rows[0]!['token'])}/delete`,
    { form: { confirm: 'yes' } });
  assert.equal(del.status, 200);
  assert.ok(del.body.includes('deleted'));

  // the promise, checked by absence rather than by a flag
  const row = await db.query(
    `SELECT booker_name, booker_email, booker_tz, owner_note FROM bookings`);
  assert.equal(row.rows[0]!['booker_name'], null);
  assert.equal(row.rows[0]!['booker_email'], null);
  assert.equal(row.rows[0]!['booker_tz'], null);
  assert.equal(Number((await db.query(`SELECT count(*)::int AS c FROM contacts`)).rows[0]!['c']), 0,
    'the contact created from the booking survived deletion');
  assert.equal(Number((await db.query(
    `SELECT count(*)::int AS c FROM jobs`)).rows[0]!['c']), 0,
    'queued mail still carried the deleted details');
});

test('deletion still needs the confirmation box (D8)', async () => {
  await ownerWithPage();
  await call('POST', '/intro/book', {
    form: { start: '2026-06-01T09:00:00Z', end: '2026-06-01T09:30:00Z',
            name: 'Bo', email: 'bo@example.com' } });
  const tok = await db.query(`SELECT token FROM bookings WHERE status = 'confirmed'`);
  const r = await call('POST', `/b/${String(tok.rows[0]!['token'])}/delete`, { form: {} });
  assert.equal(r.status, 400);
  const still = await db.query(`SELECT booker_email FROM bookings`);
  assert.equal(String(still.rows[0]!['booker_email']), 'bo@example.com');
});

test('nobody can claim a legal page as their public link', () => {
  for (const slug of ['privacy', 'terms', 'dpa', 'subprocessors']) {
    assert.ok(RESERVED_SLUGS.has(slug), `${slug} is claimable as an owner link`);
  }
});
