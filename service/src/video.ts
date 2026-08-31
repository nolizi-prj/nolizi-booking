/**
 * SPEC-0005 — stored video-conferencing connections.
 *
 * Before this file existed, "Connect with Zoom" threw the tokens away and
 * stamped the owner's *personal meeting room* onto every zoom event type
 * instead (§0 D-b1/D-c2). The public booking page then printed that room to
 * anyone who loaded it, and the presence of the stamp suppressed the
 * per-booking meeting creation the integrations card had promised.
 *
 * The rule this file exists to hold: **the credential is what gets stored, and
 * a schedule is never where it goes.** Tokens are sealed (seal.ts) before they
 * touch a row and opened only here, exactly as `calendars.ts` does for the
 * calendar grants — a copy of the database alone reveals no Zoom credential.
 */

import { randomUUID } from 'node:crypto';
import type { SqlClient } from './store.ts';
import { importSealKey, open, seal, type SealKey } from './seal.ts';
import { zoomRefreshToken, type ZoomTokenResponse } from './video-zoom.ts';

const s = (v: unknown) => String(v);
const opt = (v: unknown): string | undefined => (v === null || v === undefined ? undefined : String(v));

export type VideoProvider = 'zoom';

/** What callers outside this file may see. Never the sealed columns. */
export interface VideoConnection {
  connectionId: string;
  ownerId: string;
  provider: VideoProvider;
  accountEmail: string;
  /** Z3d step 5 · the account's personal meeting room. Never a public rendering. */
  fallbackUrl?: string;
  displayName?: string;
  status: 'active' | 'error';
  errorReason?: string;
}

const nowIso = () => new Date().toISOString().replace(/\.\d+Z/, 'Z');

export class VideoConnections {
  #key: SealKey | undefined;

  constructor(
    private readonly tokenKey: string,
    private readonly now: () => string = nowIso,
  ) {}

  async #sealKey(): Promise<SealKey> {
    if (!this.#key) this.#key = await importSealKey(this.tokenKey);
    return this.#key;
  }

  /**
   * Z1a/Z1d · store (or re-store) a connection after an OAuth exchange.
   * Reconnecting the same account updates the row in place: a second row for
   * one account would leave a live credential behind every disconnect.
   */
  async save(sql: SqlClient, ownerId: string, tokens: ZoomTokenResponse): Promise<string> {
    const key = await this.#sealKey();
    const sealedRefresh = await seal(key, tokens.refreshToken);
    const sealedAccess = await seal(key, tokens.accessToken);
    const expiresAt = this.#expiry(tokens.expiresIn);
    // Z1e · a connection with no personal room is still a connection. The
    // credential is the point; the fallback is not.
    const fallback = tokens.personalMeetingUrl ?? (tokens.pmi ? `https://zoom.us/j/${tokens.pmi}` : null);

    const existing = await sql.query(
      `SELECT connection_id FROM video_connections
        WHERE owner_id = $1 AND provider = 'zoom' AND account_email = $2`,
      [ownerId, tokens.email],
    );
    if (existing.rows[0]) {
      const connectionId = s(existing.rows[0]['connection_id']);
      await sql.query(
        `UPDATE video_connections
            SET refresh_token = $2, access_token = $3, access_expires_at = $4,
                fallback_url = $5, display_name = $6, status = 'active', error_reason = NULL
          WHERE connection_id = $1`,
        [connectionId, sealedRefresh, sealedAccess, expiresAt, fallback, tokens.displayName ?? null],
      );
      return connectionId;
    }
    const connectionId = randomUUID();
    await sql.query(
      `INSERT INTO video_connections
         (connection_id, owner_id, provider, account_email, refresh_token, access_token,
          access_expires_at, fallback_url, display_name, status, created_at)
       VALUES ($1, $2, 'zoom', $3, $4, $5, $6, $7, $8, 'active', $9)`,
      [connectionId, ownerId, tokens.email, sealedRefresh, sealedAccess, expiresAt,
       fallback, tokens.displayName ?? null, this.now()],
    );
    return connectionId;
  }

  /** Z4b · the one source of truth for "is this owner connected". */
  async find(sql: SqlClient, ownerId: string, provider: VideoProvider = 'zoom'):
    Promise<VideoConnection | undefined> {
    const q = await sql.query(
      `SELECT connection_id, owner_id, provider, account_email, fallback_url,
              display_name, status, error_reason
         FROM video_connections WHERE owner_id = $1 AND provider = $2 LIMIT 1`,
      [ownerId, provider],
    );
    const r = q.rows[0];
    if (!r) return undefined;
    return {
      connectionId: s(r['connection_id']),
      ownerId: s(r['owner_id']),
      provider: s(r['provider']) as VideoProvider,
      accountEmail: s(r['account_email']),
      fallbackUrl: opt(r['fallback_url']),
      displayName: opt(r['display_name']),
      status: (opt(r['status']) ?? 'active') as 'active' | 'error',
      errorReason: opt(r['error_reason']),
    };
  }

  /**
   * Z3b/Z3c · a usable access token, refreshing when the stored one has expired.
   *
   * Zoom rotates the refresh token on every use, so the new pair is written
   * back **before** the token is handed out. Returns undefined rather than
   * throwing: no failure here may reach the booking path (Z3e).
   */
  async accessToken(
    sql: SqlClient,
    connectionId: string,
    creds: { clientId?: string; clientSecret?: string },
  ): Promise<string | undefined> {
    const key = await this.#sealKey();
    const q = await sql.query(
      `SELECT refresh_token, access_token, access_expires_at
         FROM video_connections WHERE connection_id = $1`,
      [connectionId],
    );
    const r = q.rows[0];
    if (!r) return undefined;

    const expiresAt = opt(r['access_expires_at']);
    const sealedAccess = opt(r['access_token']);
    // A minute of slack: a token that expires mid-request is a token that
    // expired, and the retry costs one extra round trip at most.
    if (sealedAccess && expiresAt && expiresAt > this.#plus(60)) {
      const live = await open(key, sealedAccess);
      if (live) return live;
    }

    if (!creds.clientId || !creds.clientSecret) return undefined;
    const refresh = await open(key, s(r['refresh_token']));
    if (!refresh) return undefined;

    try {
      const rotated = await zoomRefreshToken({
        clientId: creds.clientId,
        clientSecret: creds.clientSecret,
        refreshToken: refresh,
      });
      await sql.query(
        `UPDATE video_connections
            SET refresh_token = $2, access_token = $3, access_expires_at = $4,
                status = 'active', error_reason = NULL
          WHERE connection_id = $1`,
        [connectionId, await seal(key, rotated.refreshToken), await seal(key, rotated.accessToken),
         this.#expiry(rotated.expiresIn)],
      );
      return rotated.accessToken;
    } catch (err) {
      await this.markError(sql, connectionId, (err as Error).message.slice(0, 300));
      return undefined;
    }
  }

  /** The grant is gone or the provider refused. Recorded so the card can say so. */
  async markError(sql: SqlClient, connectionId: string, reason: string): Promise<void> {
    await sql.query(
      `UPDATE video_connections SET status = 'error', error_reason = $2 WHERE connection_id = $1`,
      [connectionId, reason],
    );
  }

  /** Z5a/Z5c · local deletion is the guarantee. Verified by absence. */
  async remove(sql: SqlClient, ownerId: string, provider: VideoProvider = 'zoom'): Promise<void> {
    await sql.query(`DELETE FROM video_connections WHERE owner_id = $1 AND provider = $2`,
      [ownerId, provider]);
  }

  #expiry(expiresIn: number): string {
    const base = Date.parse(this.now());
    const secs = Number.isFinite(expiresIn) && expiresIn > 0 ? expiresIn : 0;
    return new Date(base + secs * 1000).toISOString().replace(/\.\d+Z/, 'Z');
  }

  #plus(seconds: number): string {
    return new Date(Date.parse(this.now()) + seconds * 1000).toISOString().replace(/\.\d+Z/, 'Z');
  }
}
