/**
 * SPEC-0002 I2, D1 — configuration that fails closed.
 *
 * Every switch that could expose someone defaults to the safe side, and an
 * unparseable value is treated as absent rather than as an accident in the
 * dangerous direction.
 */

/**
 * DEBT.md D-105 is open at DEGRADING: the lawful basis is stated and in force
 * (see legal.ts); what remains is the entity name, governing law, transfer
 * mechanism and a review by counsel. It no longer gates configuration. The
 * ceilings below are defaults an operator may raise, and public signup is an
 * operator decision rather than a permanent block.
 */

export interface Config {
  databaseUrl: string | undefined;
  port: number;
  /** I2 — disabled unless explicitly and correctly enabled. */
  publicSignup: boolean;
  /** D1 — deployment ceilings. Defaults, deliberately raisable. */
  maxOwnerAccounts: number;
  maxBookingsRetained: number;
  /** Part 5.1 — reporting is on by default and off in one step. */
  reportingEnabled: boolean;
  sessionTtlHours: number;
  commit: string;
  /** M1 · SMTP, not a provider SDK. Absent means mail is not sent. */
  smtpUrl: string | undefined;
  mailFrom: string;
  /** Where management links point. Absent in development means localhost. */
  baseUrl: string;
  /** Development: write messages here instead of sending them. */
  mailDir: string | undefined;
  /** SPEC-0003 · calendar OAuth. All three absent means no integration. */
  googleClientId: string | undefined;
  googleClientSecret: string | undefined;
  msClientId: string | undefined;
  msClientSecret: string | undefined;
  /** 32 random bytes, base64 — seals calendar credentials at rest (seal.ts). */
  tokenKey: string | undefined;
  /** In-app feedback: GitHub personal access token for creating issues. */
  githubFeedbackToken: string | undefined;
  githubFeedbackRepo: string;
}

export const CEILING_DEFAULTS = { owners: 5, bookings: 200 } as const;

function bool(raw: string | undefined, fallback: boolean): boolean {
  if (raw === undefined) return fallback;
  const v = raw.trim().toLowerCase();
  if (v === 'true' || v === '1' || v === 'yes') return true;
  if (v === 'false' || v === '0' || v === 'no') return false;
  return fallback; // unparseable is not a licence to guess
}

function int(raw: string | undefined, fallback: number): number {
  if (raw === undefined) return fallback;
  const n = Number(raw);
  return Number.isInteger(n) && n >= 0 ? n : fallback;
}

/**
 * D1 · A ceiling defaults low so that a fresh deployment does not quietly grow
 * into a service holding thousands of strangers' details before anyone chose
 * that. An operator may raise it; the default keeps the choice visible.
 */
function ceiling(raw: string | undefined, fallback: number): number {
  return int(raw, fallback);
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  return {
    databaseUrl: env['DATABASE_URL'],
    port: int(env['PORT'], 8080),
    // I2 · off unless explicitly and correctly enabled; an explicit `true` is honoured.
    publicSignup: bool(env['PUBLIC_SIGNUP'], false),
    maxOwnerAccounts: ceiling(env['MAX_OWNER_ACCOUNTS'], CEILING_DEFAULTS.owners),
    maxBookingsRetained: ceiling(env['MAX_BOOKINGS'], CEILING_DEFAULTS.bookings),
    reportingEnabled: bool(env['PUMASI_REPORTING'], true),
    sessionTtlHours: int(env['SESSION_TTL_HOURS'], 24 * 14),
    commit: env['RAILWAY_GIT_COMMIT_SHA'] ?? env['GIT_COMMIT'] ?? 'unknown',
    smtpUrl: env['SMTP_URL'],
    mailFrom: env['MAIL_FROM'] ?? 'Pumasi <no-reply@localhost>',
    baseUrl: (env['BASE_URL'] ?? `http://localhost:${int(env['PORT'], 8080)}`).replace(/\/$/, ''),
    mailDir: env['MAIL_DIR'],
    googleClientId: env['GOOGLE_OAUTH_CLIENT_ID'],
    googleClientSecret: env['GOOGLE_OAUTH_CLIENT_SECRET'],
    msClientId: env['MS_OAUTH_CLIENT_ID'],
    msClientSecret: env['MS_OAUTH_CLIENT_SECRET'],
    tokenKey: env['TOKEN_KEY'],
    githubFeedbackToken: env['GITHUB_FEEDBACK_TOKEN'] ?? env['GH_TOKEN'] ?? env['GITHUB_TOKEN'],
    githubFeedbackRepo: env['GITHUB_FEEDBACK_REPO'] ?? 'pumasi-ai/pumasi-booking',
  };
}

/** I6 · Rate limits, with the numbers stated rather than intended. */
export const RATE_LIMITS = {
  page_views_per_ip_per_minute: 60,
  booking_attempts_per_ip_per_minute: 5,
  bookings_per_schedule_per_hour: 20,
  management_lookups_per_ip_per_minute: 10,
  /**
   * I7 · Public signup creates rows and sends mail to an address the caller
   * chose. Per hour, not per minute: a real person signs up once.
   */
  signups_per_ip_per_hour: 5,
} as const;

export interface ConfigRefusal {
  setting: string;
  reason: string;
}

/**
 * Explain what was refused and why, so a refusal is visible rather than a
 * value that silently did not take effect (D-001 requires it be logged).
 */
export function refusals(env: NodeJS.ProcessEnv = process.env): ConfigRefusal[] {
  const out: ConfigRefusal[] = [];
  // A value that did not parse silently became the fallback; say so rather than
  // let an operator believe a setting took effect (D-001).
  for (const [key, kind] of [
    ['PUBLIC_SIGNUP', 'boolean'],
    ['MAX_OWNER_ACCOUNTS', 'integer'],
    ['MAX_BOOKINGS', 'integer'],
  ] as const) {
    const raw = env[key];
    if (raw === undefined) continue;
    const parsed = kind === 'boolean'
      ? ['true', '1', 'yes', 'false', '0', 'no'].includes(raw.trim().toLowerCase())
      : Number.isInteger(Number(raw)) && Number(raw) >= 0;
    if (!parsed) {
      out.push({ setting: key, reason: `not a valid ${kind}; the default was used instead.` });
    }
  }
  return out;
}
