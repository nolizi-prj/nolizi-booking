/**
 * SPEC-0002 I1–I4 — invites, sessions, and owner-scoped access.
 *
 * Passwordless. There is no password to store, leak, reuse, or reset, and the
 * mail path already exists. A sign-in link is a bearer credential with a short
 * life, which is a smaller thing to protect than a password database.
 */

import { randomBytes, randomUUID, timingSafeEqual } from 'node:crypto';
import { Temporal } from '@js-temporal/polyfill';
import type { SqlClient } from './store.ts';

/** ≥128 bits from a CSPRNG, as L1 requires of every bearer token here. */
export const newSecret = (): string => randomBytes(32).toString('base64url');

/** Constant-time comparison, so a token cannot be recovered a byte at a time. */
export function secretsMatch(a: string, b: string): boolean {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  if (ab.length !== bb.length) return false;
  return timingSafeEqual(ab, bb);
}

export interface Owner {
  owner_id: string;
  email: string;
  display_name: string;
  timezone: string;
}

/** Thrown so a refusal rolls the transaction back rather than committing it. */
class Refused extends Error {
  constructor(readonly reason: 'invalid_invite' | 'already_registered' | 'ceiling') {
    super(reason);
  }
}

export type RedeemResult =
  | { ok: true; owner: Owner }
  | { ok: false; reason: 'invalid_invite' | 'already_registered' | 'ceiling' };

/**
 * I1 · An invite is single-use and consumed ATOMICALLY with account creation.
 *
 * The consumption is a conditional UPDATE — `WHERE consumed_by IS NULL` — so
 * two concurrent redemptions of one code cannot both proceed: the second
 * updates zero rows. Reading the invite first and then deciding would be a
 * time-of-check-to-time-of-use race, which is the same mistake the booking path
 * refuses to make.
 */
/** P4 · reserved first-segment routes an owner's link may never claim. */
export const RESERVED_SLUGS = new Set(['app', 'auth', 'login', 'logout', 'signup', 'oauth', 'b',
  's', 'r', 'p', 'embed.js', 'healthz', 'readyz', 'version', 'assets',
  'privacy', 'terms', 'dpa', 'subprocessors']);

/**
 * P2 · every owner gets a public link slug from their address's local part;
 * on collision (or a reserved word) a numbered variant, so signup never fails
 * over a vanity string.
 */
async function insertOwner(
  t: SqlClient,
  ownerId: string,
  input: { email: string; displayName: string; timezone: string },
): Promise<void> {
  const base = input.email.split('@')[0]!.toLowerCase().replace(/[^a-z0-9-]+/g, '-')
    .replace(/^-+|-+$/g, '') || 'user';
  let linkSlug = RESERVED_SLUGS.has(base) ? `${base}-1` : base;
  for (let i = 2; i < 50; i++) {
    const clash = await t.query(`SELECT 1 FROM owners WHERE link_slug = $1`, [linkSlug]);
    if (!clash.rows[0]) break;
    linkSlug = `${base}-${i}`;
  }
  await t.query(
    `INSERT INTO owners (owner_id, email, display_name, timezone, link_slug)
     VALUES ($1, $2, $3, $4, $5)`,
    [ownerId, input.email, input.displayName, input.timezone, linkSlug],
  );
}

/**
 * P4 — direct account creation, for when public signup is lawful (D-105
 * closed) or an SSO identity arrives with a valid invite consumed elsewhere.
 * Same ceiling, same duplicate check, no invite.
 */
export async function createOwnerDirect(
  tx: { transaction<T>(fn: (tx: SqlClient) => Promise<T>): Promise<T> },
  input: { email: string; displayName: string; timezone: string },
  maxOwnerAccounts: number,
): Promise<RedeemResult> {
  const ownerId = randomUUID();
  try {
    await tx.transaction(async (t) => {
      const count = await t.query(`SELECT count(*)::int AS c FROM owners`);
      if (Number(count.rows[0]?.['c'] ?? 0) >= maxOwnerAccounts) throw new Refused('ceiling');
      const existing = await t.query(`SELECT owner_id FROM owners WHERE lower(email) = lower($1)`, [
        input.email,
      ]);
      if (existing.rows[0]) throw new Refused('already_registered');
      await insertOwner(t, ownerId, input);
    });
  } catch (err) {
    if (err instanceof Refused) return { ok: false, reason: err.reason };
    throw err;
  }
  return {
    ok: true,
    owner: {
      owner_id: ownerId,
      email: input.email,
      display_name: input.displayName,
      timezone: input.timezone,
    },
  };
}

export async function redeemInvite(
  tx: { transaction<T>(fn: (tx: SqlClient) => Promise<T>): Promise<T> },
  input: { code: string; email: string; displayName: string; timezone: string },
  maxOwnerAccounts: number,
): Promise<RedeemResult> {
  const ownerId = randomUUID();
  try {
    await tx.transaction(async (t) => {
      // D1 · the ceiling is enforced inside the transaction, so simultaneous
      // redemptions cannot race past it.
      const count = await t.query(`SELECT count(*)::int AS c FROM owners`);
      if (Number(count.rows[0]?.['c'] ?? 0) >= maxOwnerAccounts) throw new Refused('ceiling');

      // Claim the invite FIRST. Checking the address before proving the caller
      // holds a valid invite let anyone probe which addresses have accounts,
      // one request at a time, without ever spending anything.
      const claimable = await t.query(
        `SELECT code FROM invites WHERE code = $1 AND consumed_at IS NULL`,
        [input.code],
      );
      if (!claimable.rows[0]) throw new Refused('invalid_invite');

      const existing = await t.query(`SELECT owner_id FROM owners WHERE lower(email) = lower($1)`, [
        input.email,
      ]);
      if (existing.rows[0]) throw new Refused('already_registered');

      // The owner must exist before the invite can reference it.
      await insertOwner(t, ownerId, input);

      // Spentness is `consumed_at`, not `consumed_by`. The latter is cleared
      // when an owner deletes their account, and guarding on it would let
      // leaving mint a fresh way in.
      const claimed = await t.query(
        `UPDATE invites SET consumed_by = $1, consumed_at = now()
          WHERE code = $2 AND consumed_at IS NULL
          RETURNING code`,
        [ownerId, input.code],
      );
      if (!claimed.rows[0]) throw new Refused('invalid_invite');
    });
  } catch (err) {
    // Every refusal THROWS, so the transaction rolls back and nothing partial
    // survives. Returning a failure value from inside the callback would commit
    // it -- which is how a refused redemption could leave an account behind, or
    // spend an invite it did not use.
    if (err instanceof Refused) return { ok: false, reason: err.reason };
    throw err;
  }

  return {
    ok: true,
    owner: {
      owner_id: ownerId,
      email: input.email,
      display_name: input.displayName,
      timezone: input.timezone,
    },
  };
}

/** A short-lived sign-in link. Single use, and consumed on first presentation. */
export async function issueSignInToken(
  sql: SqlClient,
  ownerId: string,
  now: string,
  ttlMinutes = 20,
): Promise<string> {
  const token = newSecret();
  await sql.query(
    `INSERT INTO sign_in_tokens (token, owner_id, expires_at) VALUES ($1, $2, $3)`,
    [token, ownerId, Temporal.Instant.from(now).add({ minutes: ttlMinutes }).toString()],
  );
  return token;
}

export async function consumeSignInToken(
  sql: SqlClient,
  token: string,
  now: string,
): Promise<string | undefined> {
  // Consumed atomically, and only while unexpired and unused — presenting the
  // same link twice signs in once.
  const { rows } = await sql.query(
    `UPDATE sign_in_tokens SET used_at = $2
      WHERE token = $1 AND used_at IS NULL AND expires_at > $2
      RETURNING owner_id`,
    [token, now],
  );
  return rows[0] ? String(rows[0]['owner_id']) : undefined;
}

/**
 * I3 · An opaque server-side reference. The cookie carries this identifier and
 * nothing else — no claims a client can read, and not the account id, so a
 * stolen cookie reveals nothing about who it belongs to without the database.
 */
export async function createSession(
  sql: SqlClient,
  ownerId: string,
  now: string,
  ttlHours: number,
): Promise<string> {
  const sessionId = newSecret();
  await sql.query(`INSERT INTO sessions (session_id, owner_id, expires_at) VALUES ($1, $2, $3)`, [
    sessionId,
    ownerId,
    Temporal.Instant.from(now).add({ hours: ttlHours }).toString(),
  ]);
  return sessionId;
}

export async function ownerForSession(
  sql: SqlClient,
  sessionId: string | undefined,
  now: string,
): Promise<Owner | undefined> {
  if (!sessionId) return undefined;
  const { rows } = await sql.query(
    `SELECT o.owner_id, o.email, o.display_name, o.timezone
       FROM sessions s JOIN owners o ON o.owner_id = s.owner_id
      WHERE s.session_id = $1 AND s.expires_at > $2`,
    [sessionId, now],
  );
  const r = rows[0];
  return r
    ? {
        owner_id: String(r['owner_id']),
        email: String(r['email']),
        display_name: String(r['display_name']),
        timezone: String(r['timezone']),
      }
    : undefined;
}

/** I3 · Logout invalidates server-side, not merely by clearing the cookie. */
export async function destroySession(sql: SqlClient, sessionId: string): Promise<void> {
  await sql.query(`DELETE FROM sessions WHERE session_id = $1`, [sessionId]);
}

/** I3 · HttpOnly, SameSite=Lax, and Secure unless plainly running on localhost. */
export function sessionCookie(sessionId: string, secure: boolean, ttlHours: number): string {
  const parts = [
    `pumasi_session=${sessionId}`,
    'Path=/',
    'HttpOnly',
    'SameSite=Lax',
    `Max-Age=${ttlHours * 3600}`,
  ];
  if (secure) parts.push('Secure');
  return parts.join('; ');
}

export const clearedCookie = (secure: boolean): string =>
  `pumasi_session=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0${secure ? '; Secure' : ''}`;

export function readCookie(header: string | undefined, name: string): string | undefined {
  if (!header) return undefined;
  for (const part of header.split(';')) {
    const [k, ...rest] = part.trim().split('=');
    if (k === name) return rest.join('=');
  }
  return undefined;
}
