/**
 * Sharding — the directory: the only global state in a per-org world.
 *
 * One Durable Object per tenant organization holds that company's whole world
 * (owners, schedules, bookings, automations). This directory is the small map
 * that says WHICH world a public identifier belongs to:
 *
 *   email      → org tag   (sign-in, signup uniqueness)
 *   link_slug  → org tag   (/{owner} and /{owner}/{event} pages)
 *   form_slug  → org tag   (/r/{slug} routing forms)
 *   sso domain → org tag   (login steering to a customer IdP)
 *   invites               (platform: founds a new org · org: joins one)
 *   owner count           (the D-105 global ceiling, enforced here)
 *
 * Written as a plain class over SqlClient so the logic runs identically under
 * the directory DO and under the Node/Postgres test suite. The DO serializes
 * calls, which is the concurrency model these sequential statements assume.
 */

import { randomUUID } from 'node:crypto';
import type { SqlClient } from './store.ts';

export const DIRECTORY_SCHEMA = `
CREATE TABLE IF NOT EXISTS dir_orgs (
  tag        TEXT PRIMARY KEY,
  created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS dir_emails (
  email TEXT PRIMARY KEY,
  tag   TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS dir_links (
  link_slug TEXT PRIMARY KEY,
  tag       TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS dir_forms (
  form_slug TEXT PRIMARY KEY,
  tag       TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS dir_domains (
  domain TEXT PRIMARY KEY,
  tag    TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS dir_invites (
  code        TEXT PRIMARY KEY,
  kind        TEXT NOT NULL CHECK (kind IN ('platform', 'org')),
  tag         TEXT,
  consumed_at TEXT
);
`;

export type ClaimResult =
  | { ok: true; tag: string; newOrg: boolean }
  | { ok: false; reason: 'invalid_invite' | 'already_registered' | 'ceiling' };

const nowIso = (): string => new Date().toISOString().replace(/\.\d+Z$/, 'Z');

/** Tags appear in URLs and cookies: short, lowercase, unambiguous. */
const newTag = (): string => randomUUID().replace(/-/g, '').slice(0, 10);

export class Directory {
  constructor(
    private readonly sql: SqlClient,
    private readonly maxOwners: number,
  ) {}

  async ensure(bootstrapCode?: string): Promise<string | undefined> {
    await this.sql.exec(DIRECTORY_SCHEMA);
    // Invite-only needs a first invite, or nobody can ever start: while no
    // owner exists, guarantee one platform invite (the configured code, so a
    // wipe regenerates the same one).
    const owners = await this.ownerCount();
    if (owners === 0) {
      const code = bootstrapCode ?? `inv-${newTag()}`;
      await this.sql.query(
        `INSERT INTO dir_invites (code, kind) VALUES ($1, 'platform')
         ON CONFLICT (code) DO NOTHING`,
        [code],
      );
      const open = await this.sql.query(
        `SELECT consumed_at FROM dir_invites WHERE code = $1`, [code]);
      if (open.rows[0] && open.rows[0]['consumed_at'] === null) return code;
    }
    return undefined;
  }

  async ownerCount(): Promise<number> {
    try {
      const { rows } = await this.sql.query(`SELECT count(*)::int AS c FROM dir_emails`);
      return Number(rows[0]?.['c'] ?? 0);
    } catch {
      return 0; // before ensure() ran
    }
  }

  async lookup(kind: 'email' | 'link' | 'form' | 'domain', key: string): Promise<string | undefined> {
    const table = { email: 'dir_emails', link: 'dir_links', form: 'dir_forms', domain: 'dir_domains' }[kind];
    const column = { email: 'email', link: 'link_slug', form: 'form_slug', domain: 'domain' }[kind];
    const { rows } = await this.sql.query(
      `SELECT tag FROM ${table} WHERE ${column} = $1`, [key.toLowerCase()]);
    return rows[0] ? String(rows[0]['tag']) : undefined;
  }

  /**
   * The one gate into the platform: spend an invite, claim the email, count
   * the owner. A platform invite founds a new org; an org invite joins one.
   * The DO serializes callers, so check-then-write here is race-free.
   */
  async claimSignup(inviteCode: string, email: string): Promise<ClaimResult> {
    const invite = await this.sql.query(
      `SELECT kind, tag FROM dir_invites WHERE code = $1 AND consumed_at IS NULL`,
      [inviteCode],
    );
    if (!invite.rows[0]) return { ok: false, reason: 'invalid_invite' };
    if ((await this.ownerCount()) >= this.maxOwners) return { ok: false, reason: 'ceiling' };
    const existing = await this.sql.query(
      `SELECT 1 FROM dir_emails WHERE email = $1`, [email.toLowerCase()]);
    if (existing.rows[0]) return { ok: false, reason: 'already_registered' };

    const kind = String(invite.rows[0]['kind']);
    let tag = invite.rows[0]['tag'] === null ? undefined : String(invite.rows[0]['tag']);
    const newOrg = kind === 'platform';
    if (newOrg) {
      tag = newTag();
      await this.sql.query(`INSERT INTO dir_orgs (tag, created_at) VALUES ($1, $2)`,
        [tag, nowIso()]);
    }
    if (!tag) return { ok: false, reason: 'invalid_invite' };
    await this.sql.query(`UPDATE dir_invites SET consumed_at = $2 WHERE code = $1`,
      [inviteCode, nowIso()]);
    await this.sql.query(`INSERT INTO dir_emails (email, tag) VALUES ($1, $2)`,
      [email.toLowerCase(), tag]);
    return { ok: true, tag, newOrg };
  }

  /** SSO JIT provisioning claims an email without an invite (ceiling holds). */
  async claimEmailForOrg(email: string, tag: string): Promise<ClaimResult> {
    if ((await this.ownerCount()) >= this.maxOwners) return { ok: false, reason: 'ceiling' };
    const existing = await this.sql.query(
      `SELECT tag FROM dir_emails WHERE email = $1`, [email.toLowerCase()]);
    if (existing.rows[0]) {
      return String(existing.rows[0]['tag']) === tag
        ? { ok: true, tag, newOrg: false }
        : { ok: false, reason: 'already_registered' };
    }
    await this.sql.query(`INSERT INTO dir_emails (email, tag) VALUES ($1, $2)`,
      [email.toLowerCase(), tag]);
    return { ok: true, tag, newOrg: false };
  }

  async mintInvite(kind: 'platform' | 'org', tag?: string): Promise<string> {
    const code = `inv-${newTag()}`;
    await this.sql.query(`INSERT INTO dir_invites (code, kind, tag) VALUES ($1, $2, $3)`,
      [code, kind, kind === 'org' ? (tag ?? null) : null]);
    return code;
  }

  /** Claim-or-move a link slug for an org. False means someone else holds it. */
  async registerLink(tag: string, slug: string, oldSlug?: string): Promise<boolean> {
    const held = await this.lookup('link', slug);
    if (held && held !== tag) return false;
    if (!held) {
      await this.sql.query(`INSERT INTO dir_links (link_slug, tag) VALUES ($1, $2)`,
        [slug.toLowerCase(), tag]);
    }
    if (oldSlug && oldSlug.toLowerCase() !== slug.toLowerCase()) {
      await this.sql.query(`DELETE FROM dir_links WHERE link_slug = $1 AND tag = $2`,
        [oldSlug.toLowerCase(), tag]);
    }
    return true;
  }

  async registerForm(tag: string, slug: string): Promise<boolean> {
    const held = await this.lookup('form', slug);
    if (held && held !== tag) return false;
    if (!held) {
      await this.sql.query(`INSERT INTO dir_forms (form_slug, tag) VALUES ($1, $2)`,
        [slug.toLowerCase(), tag]);
    }
    return true;
  }

  async releaseForm(tag: string, slug: string): Promise<void> {
    await this.sql.query(`DELETE FROM dir_forms WHERE form_slug = $1 AND tag = $2`,
      [slug.toLowerCase(), tag]);
  }

  /** One steered domain per org; null clears it. */
  async registerDomain(tag: string, domain: string | null): Promise<void> {
    await this.sql.query(`DELETE FROM dir_domains WHERE tag = $1`, [tag]);
    if (domain) {
      await this.sql.query(
        `INSERT INTO dir_domains (domain, tag) VALUES ($1, $2)
         ON CONFLICT (domain) DO NOTHING`,
        [domain.toLowerCase(), tag]);
    }
  }

  /** An owner leaves the platform: email freed, link freed, count drops. */
  async releaseOwner(tag: string, email: string, linkSlug?: string): Promise<void> {
    await this.sql.query(`DELETE FROM dir_emails WHERE email = $1 AND tag = $2`,
      [email.toLowerCase(), tag]);
    if (linkSlug) {
      await this.sql.query(`DELETE FROM dir_links WHERE link_slug = $1 AND tag = $2`,
        [linkSlug.toLowerCase(), tag]);
    }
  }
}

/**
 * The wire protocol between an org DO (or the worker) and the directory DO:
 * one POST per call, JSON in, JSON out. Kept dumb on purpose.
 */
export interface DirectoryCall {
  method:
    | 'ensure' | 'lookup' | 'claimSignup' | 'claimEmailForOrg' | 'mintInvite'
    | 'registerLink' | 'registerForm' | 'releaseForm' | 'registerDomain'
    | 'releaseOwner' | 'ownerCount';
  args: unknown[];
}

export async function dispatchDirectoryCall(
  dir: Directory,
  call: DirectoryCall,
): Promise<unknown> {
  const fn = (dir as unknown as Record<string, (...a: unknown[]) => Promise<unknown>>)[call.method];
  if (typeof fn !== 'function') throw new Error(`no such directory method: ${call.method}`);
  return fn.apply(dir, call.args);
}
