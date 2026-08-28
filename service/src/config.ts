/**
 * SPEC-0002 I2, D1 — configuration that fails closed.
 *
 * Every switch that could expose someone defaults to the safe side, and an
 * unparseable value is treated as absent rather than as an accident in the
 * dangerous direction.
 */

/** DEBT.md D-105. While this is open, the ceilings below cannot be raised. */
export const D105_OPEN = true;

export interface Config {
  databaseUrl: string | undefined;
  port: number;
  /** I2 — disabled unless explicitly and correctly enabled, and D1 blocks it. */
  publicSignup: boolean;
  /** D1 — enforced ceilings. "Small and known" expires silently otherwise. */
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
 * D1 · A ceiling may be lowered, never raised, while D-105 is open. The
 * justification for operating without a settled privacy basis is that the
 * circle is small and known; a number that can be raised without answering the
 * question is not a ceiling, it is a suggestion.
 */
function ceiling(raw: string | undefined, max: number): number {
  const requested = int(raw, max);
  return Math.min(requested, D105_OPEN ? max : requested);
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  return {
    databaseUrl: env['DATABASE_URL'],
    port: int(env['PORT'], 8080),
    // I2 + D1: even an explicit `true` is refused while D-105 is open.
    publicSignup: D105_OPEN ? false : bool(env['PUBLIC_SIGNUP'], false),
    maxOwnerAccounts: ceiling(env['MAX_OWNER_ACCOUNTS'], CEILING_DEFAULTS.owners),
    maxBookingsRetained: ceiling(env['MAX_BOOKINGS'], CEILING_DEFAULTS.bookings),
    reportingEnabled: bool(env['PUMASI_REPORTING'], true),
    sessionTtlHours: int(env['SESSION_TTL_HOURS'], 24 * 14),
    commit: env['RAILWAY_GIT_COMMIT_SHA'] ?? env['GIT_COMMIT'] ?? 'unknown',
    smtpUrl: env['SMTP_URL'],
    mailFrom: env['MAIL_FROM'] ?? 'Pumasi <no-reply@localhost>',
    baseUrl: (env['BASE_URL'] ?? `http://localhost:${int(env['PORT'], 8080)}`).replace(/\/$/, ''),
    mailDir: env['MAIL_DIR'],
  };
}

/** I6 · Rate limits, with the numbers stated rather than intended. */
export const RATE_LIMITS = {
  page_views_per_ip_per_minute: 60,
  booking_attempts_per_ip_per_minute: 5,
  bookings_per_schedule_per_hour: 20,
  management_lookups_per_ip_per_minute: 10,
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
  if (!D105_OPEN) return out;
  if (bool(env['PUBLIC_SIGNUP'], false)) {
    out.push({
      setting: 'PUBLIC_SIGNUP',
      reason: 'DEBT.md D-105 is open: no lawful basis has been established for holding third-party personal data. Public signup stays blocked.',
    });
  }
  if (int(env['MAX_OWNER_ACCOUNTS'], 0) > CEILING_DEFAULTS.owners) {
    out.push({
      setting: 'MAX_OWNER_ACCOUNTS',
      reason: `DEBT.md D-105 is open: the ceiling of ${CEILING_DEFAULTS.owners} may be lowered but not raised.`,
    });
  }
  if (int(env['MAX_BOOKINGS'], 0) > CEILING_DEFAULTS.bookings) {
    out.push({
      setting: 'MAX_BOOKINGS',
      reason: `DEBT.md D-105 is open: the ceiling of ${CEILING_DEFAULTS.bookings} may be lowered but not raised.`,
    });
  }
  return out;
}
