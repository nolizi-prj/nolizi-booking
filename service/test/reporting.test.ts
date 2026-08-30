/**
 * SPEC-0004 — reporting path and opt-out. Runner for
 * service/spec/0004/acceptance/cases.json (R-001 … R-010).
 *
 * The transport is a port precisely so egress can be observed rather than
 * inferred: every case about "no network call" asserts against a recording
 * transport, not against a reading of the code.
 */

import { test, before, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { migrate } from '../src/db.ts';
import { createPgliteDriver, type Database } from '../src/driver.ts';
import { handle, type AppDeps } from '../src/app.ts';
import { loadConfig } from '../src/config.ts';
import { RecordingMail, RetryingMail } from '../src/mail.ts';
import { LEGAL_DOCS } from '../src/legal.ts';
import {
  buildHeldReport, buildPublishedReport, readConformance, renderReport,
  reportingNotice, runReportingTick, sendReport, UNSIGNED,
  type ConformanceSummary, type Report, type ReportTransport,
} from '../src/reporting.ts';

const here = dirname(fileURLToPath(import.meta.url));

function recordingTransport(): { calls: { url: string; body: string }[]; transport: ReportTransport } {
  const calls: { url: string; body: string }[] = [];
  const transport: ReportTransport = async (url, init) => {
    calls.push({ url, body: init.body });
    return { ok: true, status: 202 };
  };
  return { calls, transport };
}

const failingTransport: ReportTransport = async () => {
  throw new Error('intake unreachable');
};

const baseConfig = () => loadConfig({} as NodeJS.ProcessEnv);
const offConfig = () => loadConfig({ PUMASI_REPORTING: 'false' } as NodeJS.ProcessEnv);
const facts = { dbKind: 'pglite' as const, uptimeSeconds: 12.6, errorsTotal: 3 };

// ── R-001 · schema exactness ───────────────────────────────────────────────

test('R-001 a held report matches pumasi-report/1 exactly — no key more, none less', () => {
  const r = buildHeldReport(baseConfig(), facts);
  assert.equal(r.schema, 'pumasi-report/1');
  assert.equal(r.tier, 'held');
  assert.equal(r.item, 'pumasi-booking');
  assert.deepEqual(Object.keys(r).sort(),
    ['commit', 'config_shape', 'health', 'item', 'platform', 'produced_at', 'schema', 'tier']);
  assert.deepEqual(Object.keys(r.platform).sort(),
    ['arch', 'db', 'node', 'os', 'runtime', 'tzdata_host', 'tzdata_pinned']);
  assert.deepEqual(Object.keys(r.config_shape).sort(),
    ['calendar_google', 'calendar_microsoft', 'ceilings_raised', 'mail', 'public_signup', 'zoom']);
  assert.deepEqual(Object.keys(r.health).sort(), ['errors_total', 'uptime_seconds']);
  assert.equal(r.health.uptime_seconds, 13, 'seconds are rounded, not fractional');
  assert.equal(r.health.errors_total, 3);
});

// ── R-002 · no value survives, only shape ──────────────────────────────────

test('R-002 no configuration value, secret, or address survives into either tier', () => {
  const sentinel = loadConfig({
    SMTP_URL: 'smtp://sentinelUser:sentinelPass@sentinel-smtp.example:587',
    MAIL_FROM: 'Sentinel <sentinel-from@example.com>',
    MAIL_DIR: '/tmp/sentinel-mail',
    BASE_URL: 'https://sentinel-host.example',
    GOOGLE_OAUTH_CLIENT_ID: 'sentinelGoogleId',
    GOOGLE_OAUTH_CLIENT_SECRET: 'sentinelGoogleSecret',
    MS_OAUTH_CLIENT_ID: 'sentinelMsId',
    MS_OAUTH_CLIENT_SECRET: 'sentinelMsSecret',
    TOKEN_KEY: 'sentinelTokenKey00000000000000000000000000000',
    GITHUB_FEEDBACK_TOKEN: 'sentinelGithubToken',
    ZOOM_ACCOUNT_ID: 'sentinelZoomAccount',
    ZOOM_CLIENT_ID: 'sentinelZoomId',
    ZOOM_CLIENT_SECRET: 'sentinelZoomSecret',
    DATABASE_URL: 'postgres://sentinelDb:sentinelDbPass@sentinel-db.example/x',
    PUMASI_REPORT_SPONSOR: 'a-sponsor',
  } as NodeJS.ProcessEnv);
  const conformance: ConformanceSummary =
    { suite: 's', passed: 1, failed: 0, skipped: 0, run_at: '2026-08-30T00:00:00Z' };
  const both: Report[] = [
    buildHeldReport(sentinel, facts),
    buildPublishedReport(sentinel, conformance, { dbKind: 'postgres' }),
  ];
  for (const r of both) {
    assert.ok(!renderReport(r).toLowerCase().includes('sentinel'),
      `${r.tier}: a configuration value leaked into the payload`);
  }
  const held = both[0]!;
  assert.equal(held.tier, 'held');
  if (held.tier === 'held') {
    for (const [k, v] of Object.entries(held.config_shape)) {
      assert.ok(typeof v === 'boolean' || ['smtp', 'file', 'none'].includes(v as string),
        `config_shape.${k} must be a boolean or a documented enum, got ${JSON.stringify(v)}`);
    }
    assert.equal(held.config_shape.mail, 'smtp');
    assert.equal(held.config_shape.zoom, true);
  }
});

// ── R-003 · opt-out stops egress, observed at the transport ────────────────

test('R-003 with reporting off the tick makes zero network calls; on, exactly one', async () => {
  const off = recordingTransport();
  const offResult = await runReportingTick(offConfig(), facts, off.transport);
  assert.equal(off.calls.length, 0, 'opt-out must stop egress before any transport use');
  assert.equal(offResult.attempted, false);

  const on = recordingTransport();
  const onResult = await runReportingTick(baseConfig(), facts, on.transport);
  assert.equal(on.calls.length, 1);
  assert.equal(on.calls[0]!.url, baseConfig().reportUrl);
  assert.equal(onResult.sent, true);
});

// ── R-005 · printed byte-identical to sent ─────────────────────────────────

test('R-005 the printed payload is byte-identical to the sent body', async () => {
  const config = baseConfig();
  const report = buildHeldReport(config, { ...facts, now: () => '2026-08-30T12:00:00Z' });
  const printed = renderReport(report);
  const { calls, transport } = recordingTransport();
  await sendReport(report, config, transport);
  assert.equal(calls.length, 1);
  assert.equal(calls[0]!.body, printed, 'R3b — byte for byte');
});

// ── R-006 · the notice, both states ────────────────────────────────────────

test('R-006 the start-up notice names the opt-out verbatim, in both states', () => {
  const on = reportingNotice(baseConfig()).join('\n');
  assert.match(on, /\bon\b/);
  assert.ok(on.includes('PUMASI_REPORTING=false'), 'the opt-out is named verbatim');
  const off = reportingNotice(offConfig()).join('\n');
  assert.match(off, /\boff\b/);
  assert.match(off, /nothing is sent/);
});

// ── R-007 · a failed send is dropped, not queued ───────────────────────────

test('R-007 a failed send resolves without throwing and leaves no backlog', async () => {
  const failed = await runReportingTick(baseConfig(), facts, failingTransport);
  assert.equal(failed.sent, false);
  assert.equal(failed.attempted, true);
  assert.match(failed.detail, /dropped/);

  const { calls, transport } = recordingTransport();
  await runReportingTick(baseConfig(), facts, transport);
  assert.equal(calls.length, 1, 'the next tick sends one fresh report, not a backlog');
});

// ── R-008 · published is signed or not sent ────────────────────────────────

test('R-008 an unsigned published report refuses to send; a signed one carries its signature and counts', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'pumasi-conformance-'));
  const file = join(dir, 'conformance.json');
  const summary: ConformanceSummary =
    { suite: 'pumasi-booking service acceptance', passed: 41, failed: 0, skipped: 2, run_at: '2026-08-30T11:00:00Z' };
  writeFileSync(file, JSON.stringify(summary));
  const conformance = readConformance(file);

  const unsigned = baseConfig();
  assert.equal(unsigned.reportSponsor, undefined);
  const u = recordingTransport();
  const refusal = await sendReport(buildPublishedReport(unsigned, conformance), unsigned, u.transport);
  assert.equal(refusal.sent, false);
  assert.equal(refusal.attempted, false, 'refusal, not failure — nothing was transmitted');
  assert.equal(u.calls.length, 0);
  assert.equal(buildPublishedReport(unsigned, conformance).signature.sponsor, UNSIGNED);

  const signed = loadConfig({
    PUMASI_REPORT_SPONSOR: 'example-sponsor', PUMASI_REPORT_AGENT: 'ci', PUMASI_REPORT_MODEL: 'n/a',
  } as NodeJS.ProcessEnv);
  const s = recordingTransport();
  const sent = await sendReport(buildPublishedReport(signed, conformance), signed, s.transport);
  assert.equal(sent.sent, true);
  const body = JSON.parse(s.calls[0]!.body) as { signature: Record<string, string>; conformance: ConformanceSummary };
  assert.deepEqual(body.signature, { agent: 'ci', model: 'n/a', sponsor: 'example-sponsor' });
  assert.deepEqual(body.conformance, summary);
});

test('R-008 a missing conformance summary is a loud instruction, not a guess', () => {
  assert.throws(() => readConformance('/nonexistent/conformance.json'), /npm run conformance/);
});

// ── R-009 · the retention schedule is published, truthfully per path ───────

test('R-009 the privacy page states the schedule and stays truthful per path', () => {
  const privacy = LEGAL_DOCS.find((d) => d.slug === 'privacy')!.body;
  assert.match(privacy, /twelve months/, 'R7 — the held retention period is stated');
  assert.match(privacy, /admin@pumasi\.ai/, 'R7 — the deletion route is stated');
  assert.ok(privacy.includes('PUMASI_REPORTING=false'), 'the one-step opt-out is named');
  assert.match(privacy, /still sends nothing/, 'L-009 — the live deployment claim stays true');
  assert.doesNotMatch(privacy, /does not currently report anything about itself/,
    'the paragraph was required to change when the mechanism shipped');
  assert.doesNotMatch(privacy, /no code here that sends any/);
});

// ── R-010 · the Workers path has no reporting egress ───────────────────────

test('R-010 the worker entry neither imports the sender nor wires the tick', () => {
  let dir = here;
  let source = '';
  for (let i = 0; i < 8; i++) {
    try {
      source = readFileSync(resolve(dir, 'service', 'src', 'worker.ts'), 'utf8');
      break;
    } catch {
      dir = dirname(dir);
    }
  }
  assert.ok(source.length > 0, 'worker.ts is findable from the repository root');
  assert.doesNotMatch(source, /from '\.\/reporting/, 'R8 — the Workers path sends nothing');
  assert.doesNotMatch(source, /startReporting|runReportingTick|sendReport/);
});

// ── R-004 · behaviour parity, on a real database ───────────────────────────

let db: Database;
let deps: AppDeps;

const NOW = '2026-06-01T08:00:00Z';

async function seed(): Promise<void> {
  for (const t of ['rate_events', 'idempotency_keys', 'bookings', 'availability_rules', 'schedules', 'owners']) {
    await db.query(`DELETE FROM ${t}`);
  }
  await db.query(`INSERT INTO owners (owner_id, email, display_name, timezone)
     VALUES ('o1','owner@example.com','Owner','America/New_York')`);
  await db.query(`INSERT INTO schedules (schedule_id, owner_id, slug, title, duration_minutes,
        granularity_minutes, minimum_notice_minutes, maximum_horizon_days)
     VALUES ('s1','o1','intro','Intro call',60,60,0,30)`);
  await db.query(`INSERT INTO availability_rules (schedule_id, weekday, starts_local, ends_local)
     VALUES ('s1','MO','09:00','12:00')`);
}

before(async () => {
  db = await createPgliteDriver();
  await migrate(db);
});

beforeEach(async () => {
  await seed();
});

/** Ids and tokens differ run to run; nothing else may. */
const normalise = (s: string) =>
  s.replace(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi, 'ID')
   .replace(/[A-Za-z0-9_-]{24,}/g, 'TOKEN');

async function runSurfaces(reporting: boolean): Promise<string[]> {
  deps = {
    sql: db, tx: db,
    config: loadConfig({ PUMASI_REPORTING: String(reporting) } as NodeJS.ProcessEnv),
    mail: new RetryingMail(new RecordingMail()),
    now: () => NOW,
    ready: () => true,
  };
  const out: string[] = [];
  for (const [method, path, form] of [
    ['GET', '/', undefined],
    ['GET', '/intro', undefined],
    ['POST', '/intro/book', {
      start: '2026-06-01T13:00:00Z', end: '2026-06-01T14:00:00Z',
      name: 'Ada', email: 'ada@example.com', booker_tz: 'Europe/London',
    }],
  ] as const) {
    const r = await handle(deps, { method, path, ip: '9.9.9.9', ...(form ? { form: { ...form } } : {}) });
    out.push(`${method} ${path} → ${r.status}\n${normalise(r.body)}`);
  }
  return out;
}

test('R-004 representative surfaces behave identically with reporting on and off', async () => {
  const on = await runSurfaces(true);
  await seed();
  const off = await runSurfaces(false);
  assert.deepEqual(on, off, 'R2b — no feature differs with the opt-out set');
  assert.match(on[2]!, /→ 200/, 'the booking surface was actually exercised, not skipped (L-006)');
});
