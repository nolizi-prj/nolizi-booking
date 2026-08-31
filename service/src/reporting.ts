/**
 * SPEC-0004 — the CHARTER §5.1 reporting path and opt-out.
 *
 * Two payloads, one switch, one transport. Everything either tier may carry
 * is the schema here — a field not in these interfaces is a field a report
 * may not carry (R1b: adding one means a new schema version and a fresh
 * cross-family spec review). The reports are about the software, never its
 * users: no owner or booker datum, and no count derived from them (R1a,
 * SPEC-0002 D5 and frozen case D-005).
 *
 * Path scope (R8, lessons/L-009): the Node path sends the held tier
 * automatically and serves the CLI; the Workers path sends nothing and must
 * not import this module's sender.
 */

import { readFileSync } from 'node:fs';
import { checkTzdata } from '@pumasi/booking-core';
import { CEILING_DEFAULTS, type Config } from './config.ts';

export const REPORT_SCHEMA = 'pumasi-report/1';
export const REPORT_ITEM = 'pumasi-booking';
/**
 * PR-1 asks that the diagnostics state the version, and this payload does not.
 * Adding `version` here is deliberately NOT done in the change that added it
 * everywhere else, because by this module's own rule above it is a schema
 * change: a field not in these interfaces is a field a report may not carry,
 * and adding one means `pumasi-report/2` and a fresh cross-family spec review
 * (R1b). A silent field on a schema a receiver validates is worse than a
 * missing one. The gap is real and stays named here until that review happens;
 * `commit` continues to answer "which build" in the meantime.
 */
/** R5b — one held report per day, sent by the Node path only. */
export const HELD_REPORT_INTERVAL_MS = 24 * 60 * 60 * 1000;
/** R5b — "shortly after start", late enough to never delay serving. */
export const FIRST_HELD_REPORT_DELAY_MS = 60 * 1000;

export type DbKind = 'postgres' | 'sqlite' | 'pglite';

/**
 * The driver also knows 'do-sqlite' (the Workers Durable Object). That path
 * never reports (R8), but the type boundary maps it honestly to 'sqlite'
 * rather than widening the approved schema enum for a value nothing emits.
 */
export function asDbKind(kind: DbKind | 'do-sqlite'): DbKind {
  return kind === 'do-sqlite' ? 'sqlite' : kind;
}

export interface ReportPlatform {
  runtime: 'node';
  node: string;
  os: string;
  arch: string;
  tzdata_pinned: string;
  tzdata_host: string | null;
  db: DbKind;
}

/** R1 · held tier — configuration SHAPE (booleans and closed enums), never a value. */
export interface HeldReport {
  schema: typeof REPORT_SCHEMA;
  tier: 'held';
  item: typeof REPORT_ITEM;
  commit: string;
  produced_at: string;
  platform: ReportPlatform;
  config_shape: {
    public_signup: boolean;
    mail: 'smtp' | 'file' | 'none';
    calendar_google: boolean;
    calendar_microsoft: boolean;
    zoom: boolean;
    ceilings_raised: boolean;
  };
  health: {
    uptime_seconds: number;
    errors_total: number;
  };
}

export interface PublishedReport {
  schema: typeof REPORT_SCHEMA;
  tier: 'published';
  item: typeof REPORT_ITEM;
  commit: string;
  produced_at: string;
  platform: ReportPlatform;
  conformance: ConformanceSummary;
  signature: { agent: string; model: string; sponsor: string };
}

export interface ConformanceSummary {
  suite: string;
  passed: number;
  failed: number;
  skipped: number;
  run_at: string;
}

export type Report = HeldReport | PublishedReport;

/** R6 · shown in a printed unsigned report; sending refuses on it. */
export const UNSIGNED = '(unsigned — set PUMASI_REPORT_SPONSOR to send)';

export function platformFacts(dbKind: DbKind): ReportPlatform {
  const tz = checkTzdata();
  return {
    runtime: 'node',
    node: process.version,
    os: process.platform,
    arch: process.arch,
    tzdata_pinned: tz.pinned,
    tzdata_host: tz.runtime ?? null,
    db: dbKind,
  };
}

export interface HeldFacts {
  dbKind: DbKind;
  uptimeSeconds: number;
  errorsTotal: number;
  now?: () => string;
}

export function buildHeldReport(config: Config, facts: HeldFacts): HeldReport {
  return {
    schema: REPORT_SCHEMA,
    tier: 'held',
    item: REPORT_ITEM,
    commit: config.commit,
    produced_at: (facts.now ?? isoNow)(),
    platform: platformFacts(facts.dbKind),
    config_shape: {
      public_signup: config.publicSignup,
      mail: config.smtpUrl ? 'smtp' : config.mailDir ? 'file' : 'none',
      calendar_google: Boolean(config.googleClientId && config.googleClientSecret && config.tokenKey),
      calendar_microsoft: Boolean(config.msClientId && config.msClientSecret && config.tokenKey),
      zoom: Boolean(config.zoomClientId && config.zoomClientSecret),
      ceilings_raised:
        config.maxOwnerAccounts !== CEILING_DEFAULTS.owners ||
        config.maxBookingsRetained !== CEILING_DEFAULTS.bookings,
    },
    health: {
      uptime_seconds: Math.round(facts.uptimeSeconds),
      errors_total: facts.errorsTotal,
    },
  };
}

export function buildPublishedReport(
  config: Config,
  conformance: ConformanceSummary,
  opts: { dbKind: DbKind; now?: () => string } = { dbKind: 'pglite' },
): PublishedReport {
  return {
    schema: REPORT_SCHEMA,
    tier: 'published',
    item: REPORT_ITEM,
    commit: config.commit,
    produced_at: (opts.now ?? isoNow)(),
    platform: platformFacts(opts.dbKind),
    conformance,
    signature: {
      agent: config.reportAgent,
      model: config.reportModel,
      sponsor: config.reportSponsor ?? UNSIGNED,
    },
  };
}

/** R5c/R6 · conformance counts come from `npm run conformance` in service/. */
export function readConformance(path: string): ConformanceSummary {
  let raw: string;
  try {
    raw = readFileSync(path, 'utf8');
  } catch {
    throw new Error(
      `no conformance summary at ${path} — run \`npm run conformance\` in service/ first`,
    );
  }
  const parsed = JSON.parse(raw) as ConformanceSummary;
  for (const k of ['suite', 'passed', 'failed', 'skipped', 'run_at'] as const) {
    if (parsed[k] === undefined) throw new Error(`conformance summary is missing "${k}"`);
  }
  return parsed;
}

/**
 * R3 · the canonical form. What this returns is what is printed, and the
 * sent HTTP body is this exact string (R3b — byte-identical).
 */
export function renderReport(report: Report): string {
  return JSON.stringify(report, null, 2);
}

export type ReportTransport = (url: string, init: {
  method: string; headers: Record<string, string>; body: string;
}) => Promise<{ ok: boolean; status: number }>;

const realTransport: ReportTransport = async (url, init) => {
  const res = await fetch(url, init);
  return { ok: res.ok, status: res.status };
};

export interface SendResult {
  sent: boolean;
  /** true when a network attempt was made (R5a distinguishes refusal from failure). */
  attempted: boolean;
  detail: string;
}

/**
 * R5a · one POST, and a failure is logged by the caller and dropped — no
 * spool, no queue, no retry beyond the next scheduled attempt. Never throws.
 */
export async function sendReport(
  report: Report,
  config: Config,
  transport: ReportTransport = realTransport,
): Promise<SendResult> {
  if (!config.reportingEnabled) {
    return { sent: false, attempted: false, detail: 'reporting is off (PUMASI_REPORTING=false)' };
  }
  if (report.tier === 'published' && !config.reportSponsor) {
    return { sent: false, attempted: false, detail: 'published reports are signed or not sent — set PUMASI_REPORT_SPONSOR' };
  }
  try {
    const res = await transport(config.reportUrl, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: renderReport(report),
    });
    return res.ok
      ? { sent: true, attempted: true, detail: `accepted (${res.status})` }
      : { sent: false, attempted: true, detail: `intake answered ${res.status} — report dropped` };
  } catch (e) {
    return { sent: false, attempted: true, detail: `send failed (${(e as Error).message}) — report dropped` };
  }
}

/**
 * R2a/R5b · the automatic held-tier tick. With reporting off it performs no
 * network call at all — the opt-out is checked before any transport use.
 */
export async function runReportingTick(
  config: Config,
  facts: HeldFacts,
  transport: ReportTransport = realTransport,
): Promise<SendResult> {
  if (!config.reportingEnabled) {
    return { sent: false, attempted: false, detail: 'reporting is off (PUMASI_REPORTING=false)' };
  }
  return sendReport(buildHeldReport(config, facts), config, transport);
}

/** R4 · printed on every start, before serving. Names the opt-out verbatim. */
export function reportingNotice(config: Config): string[] {
  if (!config.reportingEnabled) {
    return ['[reporting] off — nothing is sent (PUMASI_REPORTING is false)'];
  }
  return [
    '[reporting] on — this deployment sends an operating report about the software',
    '[reporting] (platform, configuration shape, uptime, error count — never a name,',
    '[reporting] an email address, a meeting time, or anything a person typed).',
    `[reporting] Inspect it: node dist/cli.js report held · intake: ${config.reportUrl}`,
    '[reporting] Turn it off in one step: PUMASI_REPORTING=false. Nothing else changes.',
  ];
}

/** Errors counted for health.errors_total — a count, carrying nothing else. */
let errors = 0;
export function recordError(): void {
  errors += 1;
}
export function errorsTotal(): number {
  return errors;
}

export interface ReportingHandle {
  stop: () => void;
}

/**
 * R5b · Node-path wiring: one held report shortly after start, then one per
 * 24 hours. Both timers are unref'd — reporting never keeps a process alive,
 * and a failed send is logged once and dropped (R5a).
 */
export function startReporting(
  config: Config,
  dbKind: DbKind,
  transport: ReportTransport = realTransport,
): ReportingHandle {
  if (!config.reportingEnabled) return { stop: () => {} };
  const tick = async () => {
    const facts: HeldFacts = { dbKind, uptimeSeconds: process.uptime(), errorsTotal: errorsTotal() };
    const result = await runReportingTick(config, facts, transport);
    if (!result.sent) console.warn(`[reporting] ${result.detail}`);
  };
  const first = setTimeout(() => { void tick(); }, FIRST_HELD_REPORT_DELAY_MS);
  first.unref?.();
  const daily = setInterval(() => { void tick(); }, HELD_REPORT_INTERVAL_MS);
  daily.unref?.();
  return {
    stop: () => {
      clearTimeout(first);
      clearInterval(daily);
    },
  };
}

function isoNow(): string {
  return new Date().toISOString().replace(/\.\d{3}Z$/, 'Z');
}
