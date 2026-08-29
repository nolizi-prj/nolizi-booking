/**
 * An owner's logo.
 *
 * The browser resizes the image before sending it, but that is a courtesy, not
 * a control — the request is an ordinary form post and anything can be in the
 * field. So the validator is tested against what a hostile client would send,
 * not against what our own page produces.
 */

import { test, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import EmbeddedPostgres from 'embedded-postgres';
import { migrate } from '../src/db.ts';
import { createPostgresDriver, type Database } from '../src/driver.ts';
import { handle, type AppDeps } from '../src/app.ts';
import { loadConfig } from '../src/config.ts';
import { RecordingMail, RetryingMail } from '../src/mail.ts';
import { validateLogo, MAX_LOGO_BYTES } from '../src/branding.ts';

const PORT = 55454;
const NOW = '2026-06-01T08:00:00Z';
let pg: EmbeddedPostgres;
let db: Database;
let deps: AppDeps;

/** A data URL of `mime` wrapping exactly these bytes. */
const dataUrl = (mime: string, bytes: number[]) =>
  `data:${mime};base64,${Buffer.from(Uint8Array.from(bytes)).toString('base64')}`;

const PNG_MAGIC = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
const JPEG_MAGIC = [0xff, 0xd8, 0xff];
const pngOf = (n: number) => dataUrl('image/png', [...PNG_MAGIC, ...Array(n).fill(0)]);

// ── the validator, against hostile input ────────────────────────────────────

test('a real PNG is accepted', () => {
  const r = validateLogo(pngOf(64));
  assert.equal(r.ok, true);
});

test('an SVG is refused — it would be script from our own origin', () => {
  const svg = `data:image/svg+xml;base64,${Buffer.from('<svg onload="alert(1)"/>').toString('base64')}`;
  const r = validateLogo(svg);
  assert.equal(r.ok, false);
});

test('bytes that are not the type they claim are refused', () => {
  // A JPEG label on PNG content: the label is what a browser sniffs against.
  const lying = dataUrl('image/jpeg', PNG_MAGIC);
  const r = validateLogo(lying);
  assert.equal(r.ok, false);
  assert.match((r as { reason: string }).reason, /not the kind of image/i);
});

test('a bare RIFF container is not a WebP', () => {
  // RIFF header, but the marker at byte 8 says AVI rather than WEBP.
  const avi = dataUrl('image/webp', [
    0x52, 0x49, 0x46, 0x46, 0, 0, 0, 0, 0x41, 0x56, 0x49, 0x20,
  ]);
  assert.equal(validateLogo(avi).ok, false);

  const webp = dataUrl('image/webp', [
    0x52, 0x49, 0x46, 0x46, 0, 0, 0, 0, 0x57, 0x45, 0x42, 0x50,
  ]);
  assert.equal(validateLogo(webp).ok, true);
});

test('an oversized image is refused, and the reason says what to do', () => {
  const r = validateLogo(pngOf(MAX_LOGO_BYTES + 1));
  assert.equal(r.ok, false);
  assert.match((r as { reason: string }).reason, /smaller/i);
});

test('an image of exactly the limit is accepted', () => {
  const r = validateLogo(pngOf(MAX_LOGO_BYTES - PNG_MAGIC.length));
  assert.equal(r.ok, true);
  assert.equal((r as { bytes: number }).bytes, MAX_LOGO_BYTES);
});

test('junk, empty files and non-data-URLs are refused rather than stored', () => {
  for (const bad of [
    'https://example.com/logo.png',
    'data:image/png;base64,',
    'data:image/png;base64,!!!!',
    'javascript:alert(1)',
    '',
    'data:text/html;base64,' + Buffer.from('<script>').toString('base64'),
  ]) {
    assert.equal(validateLogo(bad).ok, false, `accepted: ${bad.slice(0, 40)}`);
  }
});

// ── the route ───────────────────────────────────────────────────────────────

before(async () => {
  pg = new EmbeddedPostgres({
    databaseDir: '/tmp/pumasi-pg-branding', user: 'pumasi', password: 'pumasi',
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
    set_overrides, contacts, org_branding RESTART IDENTITY CASCADE`);
  await db.query(`DELETE FROM rate_events`);
  deps = {
    sql: db, tx: db,
    config: loadConfig({ BASE_URL: 'https://booking.test' } as NodeJS.ProcessEnv),
    mail: new RetryingMail(new RecordingMail()),
    now: () => NOW,
    ready: () => true,
  };
});

const call = (method: string, path: string, opts: Partial<{ form: Record<string,string>; cookie: string }> = {}) =>
  handle(deps, { method, path, ip: '15.1.1.1', form: opts.form, cookie: opts.cookie });

const cookieOf = (r: { headers: Record<string, string> }) =>
  (r.headers['set-cookie'] ?? '').split(';')[0]!;

async function ownerWithEvent() {
  await db.query(`INSERT INTO invites (code) VALUES ('inv-l')`);
  const r = await call('POST', '/signup', {
    form: { invite: 'inv-l', email: 'host@example.com', display_name: 'Ho', timezone: 'UTC' } });
  const cookie = cookieOf(r as never);
  await call('POST', '/app/schedules', {
    cookie, form: { title: 'Chat', slug: 'chat', duration_minutes: '30' } });
  return cookie;
}

const settings = (cookie: string, over: Record<string, string> = {}) =>
  call('POST', '/app/settings', {
    cookie,
    form: { display_name: 'Ho', timezone: 'UTC', welcome_message: '', brand_color: '',
            link_slug: 'ho', ...over },
  });

test('an uploaded logo reaches the booking page and the owner\'s own page', async () => {
  const cookie = await ownerWithEvent();
  const logo = pngOf(64);
  const saved = await settings(cookie, { logo });
  assert.ok(saved.status < 400, `save failed: ${saved.status}`);

  const booking = await call('GET', '/chat');
  assert.ok(booking.body.includes(logo), 'the logo did not reach the booking page');
  const landing = await call('GET', '/ho');
  assert.ok(landing.body.includes(logo), 'the logo did not reach the owner page');
});

test('a refused image leaves the rest of the form unsaved', async () => {
  const cookie = await ownerWithEvent();
  await settings(cookie, { display_name: 'Original' });

  const bad = await settings(cookie, {
    display_name: 'Changed', logo: 'data:image/svg+xml;base64,' + Buffer.from('<svg/>').toString('base64') });
  assert.equal(bad.status, 400);

  const row = await db.query(`SELECT display_name FROM owners`);
  assert.equal(row.rows[0]!['display_name'], 'Original',
    'a rejected logo still half-saved the form');
});

test('the logo can be removed', async () => {
  const cookie = await ownerWithEvent();
  await settings(cookie, { logo: pngOf(64) });
  await settings(cookie, { remove_logo: 'on' });
  const left = await db.query(`SELECT count(*)::int AS c FROM org_branding`);
  assert.equal(Number(left.rows[0]!['c']), 0);
  const page = await call('GET', '/chat');
  assert.ok(!page.body.includes('data:image/png'), 'the removed logo still renders');
});

test('saving other settings does not disturb the logo', async () => {
  const cookie = await ownerWithEvent();
  const logo = pngOf(64);
  await settings(cookie, { logo });
  await settings(cookie, { welcome_message: 'Hello' }); // no logo field at all
  const row = await db.query(`SELECT logo FROM org_branding`);
  assert.equal(row.rows[0]!['logo'], logo, 'an unrelated save dropped the logo');
});

test('the logo goes when the account goes', async () => {
  const cookie = await ownerWithEvent();
  await settings(cookie, { logo: pngOf(64) });
  const gone = await call('POST', '/app/delete', { cookie, form: { confirm: 'yes' } });
  assert.ok(gone.status < 400);
  const left = await db.query(`SELECT count(*)::int AS c FROM org_branding`);
  assert.equal(Number(left.rows[0]!['c']), 0);
});

test('one owner\'s logo is not another\'s', async () => {
  const cookie = await ownerWithEvent();
  await settings(cookie, { logo: pngOf(64) });

  await db.query(`INSERT INTO invites (code) VALUES ('inv-l2')`);
  const r2 = await call('POST', '/signup', {
    form: { invite: 'inv-l2', email: 'other@example.com', display_name: 'Ot', timezone: 'UTC' } });
  const c2 = cookieOf(r2 as never);
  await call('POST', '/app/schedules', {
    cookie: c2, form: { title: 'Talk', slug: 'talk', duration_minutes: '30' } });

  const page = await call('GET', '/talk');
  assert.ok(!page.body.includes('data:image/png'), 'another owner\'s logo appeared');
});
