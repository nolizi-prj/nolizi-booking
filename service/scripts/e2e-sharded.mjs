#!/usr/bin/env node
/**
 * Sharding E2E — runs the full multi-tenant story against `wrangler dev
 * --local` (real workerd, real Durable Objects, real router):
 *
 *   founder signs up (bootstrap platform invite) → org A
 *   teammate joins via org invite → same org
 *   rival company signs up via platform invite → org B, fully isolated
 *   booking pages, bookings, meetings, API keys, routing forms all route
 *   through tags/cookies/directory lookups.
 *
 * Start the dev server first (scripts in package.json do this), then:
 *   node scripts/e2e-sharded.mjs http://127.0.0.1:8799
 */

const base = process.argv[2] ?? 'http://127.0.0.1:8799';
const realFetch = globalThis.fetch;
globalThis.fetch = (url, init = {}) =>
  realFetch(url, { signal: AbortSignal.timeout(15000), ...init });
let failures = 0;
const ok = (cond, name) => {
  if (cond) console.log(`  ok  ${name}`);
  else { failures++; console.error(`  FAIL ${name}`); }
};

/** A browser-ish session: accumulates cookies, follows nothing. */
function session() {
  const jar = new Map();
  return {
    cookieHeader: () => [...jar.entries()].map(([k, v]) => `${k}=${v}`).join('; '),
    async call(method, path, body) {
      const res = await fetch(base + path, {
        method,
        redirect: 'manual',
        signal: AbortSignal.timeout(15000),
        headers: {
          ...(body !== undefined ? { 'content-type': 'application/x-www-form-urlencoded' } : {}),
          ...(jar.size ? { cookie: this.cookieHeader() } : {}),
        },
        body: body !== undefined ? new URLSearchParams(body).toString() : undefined,
      });
      for (const sc of res.headers.getSetCookie?.() ?? []) {
        const [pair] = sc.split(';');
        const eq = pair.indexOf('=');
        jar.set(pair.slice(0, eq).trim(), pair.slice(eq + 1));
      }
      return res;
    },
  };
}

const text = async (r) => await r.text();
const location = (r) => r.headers.get('location') ?? '';

// ── global surfaces ─────────────────────────────────────────────────────────
{
  const health = await (await fetch(`${base}/healthz`)).json();
  ok(health.sharded === true, 'healthz says sharded');
  const home = await fetch(`${base}/`);
  ok(home.status === 200 && (await text(home)).includes('Pumasi Booking'), 'home page serves');
  const app = await fetch(`${base}/app`, { redirect: 'manual' });
  ok(app.status === 303, 'cookie-less /app bounces to login');
}

// ── org A: founder ──────────────────────────────────────────────────────────
const a = session();
{
  const r = await a.call('POST', '/signup', {
    invite: 'inv-e2e-boot', email: 'founder@corp.test', display_name: 'Founder', timezone: 'UTC',
  });
  ok(r.status === 303 && location(r).endsWith('/app'), 'founder signup 303 → /app');
  ok(a.cookieHeader().includes('pumasi_org='), 'org routing cookie set');
  const dash = await a.call('GET', '/app');
  ok(dash.status === 200 && (await text(dash)).includes('Your schedules'), 'founder dashboard serves');
}

let aTag = '';
{
  const m = a.cookieHeader().match(/pumasi_org=([a-z0-9]+)/);
  aTag = m ? m[1] : '';
  ok(aTag.length >= 8, 'org tag present in cookie');
}

// event type + hours
{
  const created = await a.call('POST', '/app/schedules',
    { title: 'Intro', slug: 'intro', duration_minutes: '30' });
  ok(created.status === 303, 'event type created');
  const dash = await a.call('GET', '/app');
  const set = (await text(dash)).match(/\/app\/availability\/([0-9a-f-]+)/);
  ok(Boolean(set), 'availability set exists');
  const days = Object.fromEntries(
    ['MO', 'TU', 'WE', 'TH', 'FR', 'SA', 'SU'].flatMap((d) => [[`${d}_start`, '09:00'], [`${d}_end`, '17:00']]));
  const hours = await a.call('POST', `/app/availability/${set[1]}/hours`, days);
  ok(hours.status === 303, 'hours saved');
}

// public pages route through the directory
let slot = { start: '', end: '' };
{
  const landing = await fetch(`${base}/founder`);
  ok(landing.status === 200 && (await text(landing)).includes('href="/founder/intro"'),
    'owner landing routes via directory');
  const page = await fetch(`${base}/founder/intro`);
  const body = await text(page);
  ok(page.status === 200 && body.includes('data-start='), 'booking page shows slots');
  ok(body.includes('action="/founder/intro/book"'), 'booking form posts to the parity route');
  const m = body.match(/data-start="([^"]+)" data-end="([^"]+)"/);
  slot = { start: m?.[1] ?? '', end: m?.[2] ?? '' };
}

// a stranger books
{
  const r = await fetch(`${base}/founder/intro/book`, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      start: slot.start, end: slot.end, name: 'Visitor', email: 'v@x.test', booker_tz: 'UTC',
    }).toString(),
  });
  ok(r.status === 200 && (await text(r)).includes('confirmed'), 'booking lands');
  const meetings = await a.call('GET', '/app/meetings');
  ok((await text(meetings)).includes('v@x.test'), "founder's meetings shows it");
}

// ── teammate joins org A via an org invite ──────────────────────────────────
const mate = session();
{
  const minted = await a.call('POST', '/app/invites', { kind: 'org' });
  const code = decodeURIComponent(location(minted).split('invite=')[1] ?? '');
  ok(code.startsWith('inv-'), 'org invite minted');
  const r = await mate.call('POST', '/signup', {
    invite: code, email: 'mate@corp.test', display_name: 'Mate', timezone: 'UTC',
  });
  ok(r.status === 303, 'teammate signup lands');
  const team = await mate.call('GET', '/app/team');
  const teamBody = await text(team);
  ok(teamBody.includes('founder@corp.test') && teamBody.includes('mate@corp.test'),
    'teammate is inside the SAME org (sees both members)');
}

// ── rival org B via a platform invite: isolation ────────────────────────────
const rival = session();
{
  const minted = await a.call('POST', '/app/invites', { kind: 'platform' });
  const code = decodeURIComponent(location(minted).split('invite=')[1] ?? '');
  const r = await rival.call('POST', '/signup', {
    invite: code, email: 'boss@rival.test', display_name: 'Rival', timezone: 'UTC',
  });
  ok(r.status === 303, 'rival org signup lands');
  const bTag = (rival.cookieHeader().match(/pumasi_org=([a-z0-9]+)/) ?? [])[1] ?? '';
  ok(bTag && bTag !== aTag, 'rival lives in a different org tag');
  const meetings = await rival.call('GET', '/app/meetings');
  ok(!(await text(meetings)).includes('v@x.test'), "rival CANNOT see org A's meeting");
  const team = await rival.call('GET', '/app/team');
  ok(!(await text(team)).includes('founder@corp.test'), "rival CANNOT see org A's members");
}

// ── API keys self-route by tag ──────────────────────────────────────────────
{
  const page = await a.call('POST', '/app/api-keys', { name: 'e2e' });
  const key = (await text(page)).match(/pk_[a-z0-9]+_[A-Za-z0-9_-]+/)?.[0] ?? '';
  ok(key.includes(`pk_${aTag}_`), 'API key carries the org tag');
  const types = await fetch(`${base}/api/v1/event-types`, {
    headers: { authorization: `Bearer ${key}` } });
  ok(types.status === 200 && (await text(types)).includes('"intro"'), 'API routes by bearer tag');
  const bad = await fetch(`${base}/api/v1/event-types`, {
    headers: { authorization: 'Bearer pk_nonsense' } });
  ok(bad.status === 401, 'malformed bearer refused at the router');
}

// ── routing forms resolve through the directory ─────────────────────────────
{
  const made = await a.call('POST', '/app/routing',
    { title: 'Talk', slug: 'talk', question: 'What?' });
  ok(made.status === 303, 'routing form created');
  const routing = await a.call('GET', '/app/routing');
  const formId = (await text(routing)).match(/\/app\/routing\/([0-9a-f-]+)\/options/)?.[1] ?? '';
  const evOpt = (await text(await a.call('GET', '/app/routing')))
    .match(/<option value="([0-9a-f-]{36})">/)?.[1] ?? '';
  await a.call('POST', `/app/routing/${formId}/options`,
    { label: 'Book', destination_kind: 'event', destination_value: evOpt });
  const form = await fetch(`${base}/r/talk`);
  ok(form.status === 200 && (await text(form)).includes('What?'), '/r/<slug> routes via directory');
  const optId = (await text(await fetch(`${base}/r/talk`)))
    .match(/value="([0-9a-f-]{36})"/)?.[1] ?? '';
  const routed = await fetch(`${base}/r/talk`, {
    method: 'POST', redirect: 'manual',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ answer: optId }).toString() });
  ok(routed.status === 303 && location(routed) === '/founder/intro', 'routing answer redirects');
}

// ── unknown names 404 at the router ─────────────────────────────────────────
{
  const nope = await fetch(`${base}/nobody-here`);
  ok(nope.status === 404, 'unknown owner link 404s');
  const badToken = await fetch(`${base}/b/untagged-token`);
  ok(badToken.status === 404, 'untagged manage token 404s');
}

// ── I8 through the real worker: created and taken must be byte-identical ──
// A cross-family review caught the bodies matching while Set-Cookie
// distinguished them, so this compares the WHOLE response, headers included.
{
  console.log('\nI8 · public signup is not an account-existence oracle');
  const shape = async (form) => {
    const res = await fetch(`${base}/signup`, {
      method: 'POST',
      redirect: 'manual',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams(form).toString(),
    });
    const headers = [...res.headers.entries()]
      .filter(([k]) => !['date', 'cf-ray', 'server-timing'].includes(k))
      .sort().map(([k, v]) => `${k}: ${v}`).join('\n');
    return { status: res.status, headers, body: await res.text(),
             cookies: res.headers.getSetCookie?.() ?? [] };
  };
  const form = { email: `i8-probe-${Date.now()}@example.com`,
                 display_name: 'I8 Probe', timezone: 'UTC' };
  const created = await shape(form);   // first: creates the account
  const taken   = await shape(form);   // second: address is now taken

  ok(created.status === 200 && taken.status === 200, 'both answers are 200');
  ok(created.body === taken.body, 'bodies are byte-identical');
  ok(created.headers === taken.headers,
     'headers are identical (this is the line that catches the cookie oracle)');
  ok(created.cookies.length === 0 && taken.cookies.length === 0,
     'no Set-Cookie on either — no org tag leaks before the mailbox is proven');
}

console.log(failures === 0 ? '\nE2E: all green' : `\nE2E: ${failures} failure(s)`);
process.exit(failures === 0 ? 0 : 1);
