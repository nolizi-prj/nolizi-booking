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

test('the notice says who controls what custom questions collect', () => {
  // Custom questions are the first feature that stores personal data whose
  // shape the service did not choose, so "name and email and nothing else"
  // stopped being the whole truth. If this ever fails, the notice has drifted
  // behind the product, which is the one thing this pack must never do.
  const privacy = LEGAL_DOCS.find((d) => d.slug === 'privacy')!.body;
  assert.match(privacy, /organiser is the controller/i,
    'the notice must say the organiser controls what their own questions collect');
  assert.match(privacy, /answers/i, 'and must name the answers among what is collected');

  const dpa = LEGAL_DOCS.find((d) => d.slug === 'dpa')!.body;
  assert.match(dpa, /whatever those questions collect/i,
    'the DPA must put the organiser-chosen categories in scope');
});

/**
 * The notice claims "There is no other field on the form, and no hidden one."
 * The test above asserts what the notice SAYS; this one asserts the claim is
 * still TRUE, which is a different thing and the one that rots.
 *
 * A peer session found the live form does carry a hidden input, `booker_tz`,
 * and checked by hand that the notice covers it as "the timezone your browser
 * reported". It does. This is that check, made automatic — because the next
 * hidden field will be added by someone who never read this conversation.
 *
 * Every field is mapped to the words in the notice that disclose it. A new
 * field fails here until someone adds a mapping, and adding a mapping means
 * opening the notice and looking. That is the entire point: the guard is not
 * the assertion, it is being forced to look.
 */
const FIELD_DISCLOSED_AS: Record<string, string> = {
  start: 'the **time you chose**',
  end: 'its **end**',
  name: 'your **name**',
  email: '**email address**',
  booker_tz: 'the **timezone your browser reported**',
  repeat: 'the **time you chose**', // books the same details as a series
};

test('every field the booking form actually posts is disclosed in the notice', async () => {
  await ownerWithPage();
  const page = await call('GET', '/intro');
  const form = page.body.slice(page.body.indexOf('<form'), page.body.indexOf('</form>'));
  assert.ok(form.length > 0, 'the booking page still renders a form');

  const fields = [...form.matchAll(/name="([a-zA-Z_0-9-]+)"/g)].map((m) => m[1]!);
  assert.ok(fields.includes('booker_tz'), 'the hidden timezone field is still the one to watch');

  const privacy = LEGAL_DOCS.find((d) => d.slug === 'privacy')!.body;
  for (const field of new Set(fields)) {
    // Organiser-written questions are dynamic and are disclosed as a category,
    // not one by one -- that is what the custom-questions paragraph is for.
    if (field.startsWith('q_')) continue;
    const disclosedAs = FIELD_DISCLOSED_AS[field];
    assert.ok(
      disclosedAs,
      `the booking form posts "${field}" and the notice does not account for it. ` +
      'Add it to the notice and map it here -- or if it is genuinely not personal ' +
      'data, map it and say why. Do not delete this assertion.',
    );
    assert.ok(
      privacy.includes(disclosedAs),
      `the notice no longer contains ${disclosedAs}, which is how "${field}" was disclosed`,
    );
  }
});
