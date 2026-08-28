/**
 * First-run bootstrap.
 *
 * Invite-only is the right default, but it made the product impossible to start
 * using: creating the first invite needed a SQL prompt, and the default database
 * runs in-process where there is no prompt to reach. An invite-only system with
 * no way to mint the first invite is not secure, it is inert.
 */

import { randomBytes } from 'node:crypto';
import type { SqlClient } from './store.ts';

export interface BootstrapResult {
  code: string;
  created: boolean;
  reason?: 'owners_exist';
}

/**
 * Create a first invite, but ONLY while the service has no owners at all.
 *
 * That condition is what keeps this from being a permanent back door: the
 * moment one account exists it does nothing, whatever the environment says, so
 * it cannot be used to mint invites later or to bypass the ceiling.
 */
export async function bootstrapInvite(
  sql: SqlClient,
  requested?: string,
): Promise<BootstrapResult> {
  const owners = await sql.query(`SELECT count(*)::int AS c FROM owners`);
  if (Number(owners.rows[0]?.['c'] ?? 0) > 0) {
    return { code: '', created: false, reason: 'owners_exist' };
  }

  const existing = await sql.query(`SELECT code FROM invites WHERE consumed_at IS NULL LIMIT 1`);
  if (existing.rows[0]) return { code: String(existing.rows[0]['code']), created: false };

  const code = requested?.trim() || `inv-${randomBytes(9).toString('base64url')}`;
  await sql.query(`INSERT INTO invites (code) VALUES ($1) ON CONFLICT (code) DO NOTHING`, [code]);
  return { code, created: true };
}

/** Mint an invite deliberately, once the service is running. */
export async function createInvite(sql: SqlClient, code?: string): Promise<string> {
  const value = code?.trim() || `inv-${randomBytes(9).toString('base64url')}`;
  await sql.query(`INSERT INTO invites (code) VALUES ($1)`, [value]);
  return value;
}
