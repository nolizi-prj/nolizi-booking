/**
 * SPEC-0003 — calendar connections: storage, refresh, busy answers, write-back.
 *
 * The one rule that shapes this file (INTENT.md): a service that cannot see the
 * owner's calendar STOPS OFFERING TIMES rather than guessing. busyFor() returns
 * either intervals or a refusal; there is no "empty because it broke" state.
 *
 * Tokens are sealed (seal.ts) before they touch a row and opened only here.
 * Providers speak wire formats; this file speaks rows and intervals.
 */

import { randomUUID } from 'node:crypto';
import type { Interval } from '@pumasi/booking-core';
import type { SqlClient } from './store.ts';
import { importSealKey, open, seal, type SealKey } from './seal.ts';
import { TokenRevokedError } from './calendar-google.ts';

export type ScopeLevel = 'freebusy' | 'events';

export interface ProviderTokens {
  refreshToken: string;
  accessToken: string;
  expiresAt: string;
  accountEmail: string;
  scopeLevel: ScopeLevel;
}

export interface ProviderCalendar {
  id: string;
  name: string;
  primary: boolean;
}

export interface BookingEvent {
  title: string;
  description: string;
  start: string;
  end: string;
  /** P2 · mint a Google Meet conference on the event. */
  conference?: boolean;
}

export interface CreatedEvent {
  eventId: string;
  meetUrl?: string;
}

export interface CalendarProvider {
  readonly id: 'google' | 'microsoft';
  authUrl(opts: {
    state: string;
    redirectUri: string;
    scopeLevel: ScopeLevel;
    loginHint?: string;
  }): string;
  exchangeCode(code: string, redirectUri: string): Promise<ProviderTokens>;
  refresh(refreshToken: string): Promise<{ accessToken: string; expiresAt: string }>;
  listCalendars(accessToken: string): Promise<ProviderCalendar[]>;
  freeBusy(
    accessToken: string,
    calendarIds: string[],
    from: string,
    to: string,
  ): Promise<Interval[]>;
  createEvent(accessToken: string, calendarId: string, ev: BookingEvent): Promise<CreatedEvent>;
  moveEvent(
    accessToken: string,
    calendarId: string,
    eventId: string,
    start: string,
    end: string,
  ): Promise<void>;
  deleteEvent(accessToken: string, calendarId: string, eventId: string): Promise<void>;
  revoke(refreshToken: string): Promise<void>;
}

/** What the slot path receives: an answer, or a refusal that must fail closed. */
export type BusyAnswer =
  | { ok: true; intervals: Interval[] }
  | { ok: false; reason: string };

export interface ConnectionSummary {
  connection_id: string;
  provider: string;
  account_email: string;
  scope_level: ScopeLevel;
  status: 'active' | 'error';
  error_reason?: string;
  calendars: { calendar_id: string; name: string; check_conflicts: boolean; is_destination: boolean }[];
}

const s = (v: unknown) => String(v);

/**
 * Google's system calendars (#holiday@, #contacts@) do not return proper
 * free/busy answers — cal.com learned this in production; we inherit the lesson
 * instead of the incident.
 */
const isSystemCalendar = (id: string): boolean => id.includes('#');

export class CalendarHub {
  #key: SealKey | undefined;

  constructor(
    private readonly providers: Partial<Record<'google' | 'microsoft', CalendarProvider>>,
    private readonly tokenKey: string,
    private readonly now: () => string = () => new Date().toISOString().replace(/\.\d+Z/, 'Z'),
  ) {}

  provider(id: string): CalendarProvider | undefined {
    return id === 'google' || id === 'microsoft' ? this.providers[id] : undefined;
  }

  async #sealKey(): Promise<SealKey> {
    if (!this.#key) this.#key = await importSealKey(this.tokenKey);
    return this.#key;
  }

  /** Opaque, authenticated OAuth state: survives the round trip, nothing else. */
  async sealState(payload: Record<string, string>): Promise<string> {
    return (await seal(await this.#sealKey(), JSON.stringify({ ...payload, exp: Date.now() + 15 * 60_000 })))
      .replace(/\+/g, '-')
      .replace(/\//g, '_');
  }

  async openState(state: string): Promise<Record<string, string> | undefined> {
    const raw = await open(await this.#sealKey(), state.replace(/-/g, '+').replace(/_/g, '/'));
    if (!raw) return undefined;
    const parsed = JSON.parse(raw) as Record<string, string> & { exp?: number };
    if (typeof parsed.exp !== 'number' || parsed.exp < Date.now()) return undefined;
    return parsed;
  }

  /** Store (or re-store) a connection after an OAuth exchange. */
  async saveConnection(
    sql: SqlClient,
    ownerId: string,
    provider: CalendarProvider,
    tokens: ProviderTokens,
  ): Promise<string> {
    const key = await this.#sealKey();
    const sealedRefresh = await seal(key, tokens.refreshToken);
    const sealedAccess = await seal(key, tokens.accessToken);

    const existing = await sql.query(
      `SELECT connection_id, scope_level FROM calendar_connections
        WHERE owner_id = $1 AND provider = $2 AND account_email = $3`,
      [ownerId, provider.id, tokens.accountEmail],
    );
    let connectionId: string;
    if (existing.rows[0]) {
      connectionId = s(existing.rows[0]['connection_id']);
      // An upgrade must never downgrade: keep 'events' once granted.
      const level =
        existing.rows[0]['scope_level'] === 'events' ? 'events' : tokens.scopeLevel;
      await sql.query(
        `UPDATE calendar_connections
            SET refresh_token = $2, access_token = $3, access_expires_at = $4,
                scope_level = $5, status = 'active', error_reason = NULL
          WHERE connection_id = $1`,
        [connectionId, sealedRefresh, sealedAccess, tokens.expiresAt, level],
      );
    } else {
      connectionId = randomUUID();
      await sql.query(
        `INSERT INTO calendar_connections
           (connection_id, owner_id, provider, account_email, refresh_token,
            access_token, access_expires_at, scope_level)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
        [connectionId, ownerId, provider.id, tokens.accountEmail, sealedRefresh,
         sealedAccess, tokens.expiresAt, tokens.scopeLevel],
      );
    }

    // Refresh the calendar list; keep existing selections where ids survive.
    const cals = (await provider.listCalendars(tokens.accessToken)).filter(
      (c) => !isSystemCalendar(c.id),
    );
    const prior = await sql.query(
      `SELECT calendar_id, check_conflicts, is_destination FROM connection_calendars
        WHERE connection_id = $1`,
      [connectionId],
    );
    const priorById = new Map(prior.rows.map((r) => [s(r['calendar_id']), r]));
    await sql.query(`DELETE FROM connection_calendars WHERE connection_id = $1`, [connectionId]);
    for (const c of cals) {
      const old = priorById.get(c.id);
      await sql.query(
        `INSERT INTO connection_calendars
           (connection_id, calendar_id, name, check_conflicts, is_destination)
         VALUES ($1, $2, $3, $4, $5)`,
        [connectionId, c.id, c.name,
         old ? Number(old['check_conflicts']) : (c.primary ? 1 : 0),
         old ? Number(old['is_destination']) : (c.primary ? 1 : 0)],
      );
    }
    return connectionId;
  }

  async listConnections(sql: SqlClient, ownerId: string): Promise<ConnectionSummary[]> {
    const { rows } = await sql.query(
      `SELECT connection_id, provider, account_email, scope_level, status, error_reason
         FROM calendar_connections WHERE owner_id = $1 ORDER BY created_at`,
      [ownerId],
    );
    const out: ConnectionSummary[] = [];
    for (const r of rows) {
      const cals = await sql.query(
        `SELECT calendar_id, name, check_conflicts, is_destination
           FROM connection_calendars WHERE connection_id = $1 ORDER BY name`,
        [s(r['connection_id'])],
      );
      out.push({
        connection_id: s(r['connection_id']),
        provider: s(r['provider']),
        account_email: s(r['account_email']),
        scope_level: s(r['scope_level']) as ScopeLevel,
        status: s(r['status']) as 'active' | 'error',
        error_reason: r['error_reason'] === null ? undefined : s(r['error_reason']),
        calendars: cals.rows.map((c) => ({
          calendar_id: s(c['calendar_id']),
          name: s(c['name']),
          check_conflicts: Number(c['check_conflicts']) === 1,
          is_destination: Number(c['is_destination']) === 1,
        })),
      });
    }
    return out;
  }

  /** Owner-scoped: the WHERE carries the owner, not a prior read (I4). */
  async deleteConnection(sql: SqlClient, ownerId: string, connectionId: string): Promise<boolean> {
    const { rows } = await sql.query(
      `SELECT provider, refresh_token FROM calendar_connections
        WHERE connection_id = $1 AND owner_id = $2`,
      [connectionId, ownerId],
    );
    if (!rows[0]) return false;
    const provider = this.provider(s(rows[0]['provider']));
    const refresh = await open(await this.#sealKey(), s(rows[0]['refresh_token']));
    // Local deletion is the guarantee (D3); remote revocation is courtesy.
    await sql.query(`DELETE FROM connection_calendars WHERE connection_id = $1`, [connectionId]);
    await sql.query(`DELETE FROM calendar_connections WHERE connection_id = $1`, [connectionId]);
    if (provider && refresh) await provider.revoke(refresh);
    return true;
  }

  /** A working access token for a connection, refreshed and re-sealed as needed. */
  async #accessToken(
    sql: SqlClient,
    row: Record<string, unknown>,
  ): Promise<string> {
    const key = await this.#sealKey();
    const nowIso = this.now();
    const cached = row['access_token'] === null ? undefined : s(row['access_token']);
    const expires = row['access_expires_at'] === null ? '' : s(row['access_expires_at']);
    if (cached && expires > nowIso) {
      const opened = await open(key, cached);
      if (opened) return opened;
    }
    const provider = this.provider(s(row['provider']));
    if (!provider) throw new Error(`no provider configured: ${s(row['provider'])}`);
    const refresh = await open(key, s(row['refresh_token']));
    if (!refresh) throw new Error('refresh token unreadable (key changed?)');
    const fresh = await provider.refresh(refresh);
    // Refresh a minute early so a token never expires mid-request.
    const guarded = new Date(new Date(fresh.expiresAt).getTime() - 60_000)
      .toISOString().replace(/\.\d+Z/, 'Z');
    await sql.query(
      `UPDATE calendar_connections SET access_token = $2, access_expires_at = $3
        WHERE connection_id = $1`,
      [s(row['connection_id']), await seal(key, fresh.accessToken), guarded],
    );
    return fresh.accessToken;
  }

  async #markError(sql: SqlClient, connectionId: string, reason: string): Promise<void> {
    await sql.query(
      `UPDATE calendar_connections SET status = 'error', error_reason = $2
        WHERE connection_id = $1`,
      [connectionId, reason.slice(0, 200)],
    );
  }

  /**
   * Every busy interval the owner's connected calendars report, or a refusal.
   * A connection in status 'error' still refuses: a broken connection is a
   * blind spot until the owner reconnects or removes it — silently ignoring it
   * would offer times we cannot see.
   */
  async busyFor(sql: SqlClient, ownerId: string, from: string, to: string): Promise<BusyAnswer> {
    const { rows } = await sql.query(
      `SELECT connection_id, provider, refresh_token, access_token, access_expires_at, status
         FROM calendar_connections WHERE owner_id = $1`,
      [ownerId],
    );
    const intervals: Interval[] = [];
    for (const row of rows) {
      const connectionId = s(row['connection_id']);
      if (s(row['status']) !== 'active') {
        return { ok: false, reason: 'a calendar connection needs attention' };
      }
      const cals = await sql.query(
        `SELECT calendar_id FROM connection_calendars
          WHERE connection_id = $1 AND check_conflicts = 1`,
        [connectionId],
      );
      const ids = cals.rows.map((c) => s(c['calendar_id']));
      // Selecting no calendars is a deliberate owner choice, not a blind spot.
      if (ids.length === 0) continue;
      const provider = this.provider(s(row['provider']));
      if (!provider) return { ok: false, reason: 'calendar provider not configured' };
      try {
        const access = await this.#accessToken(sql, row);
        intervals.push(...(await provider.freeBusy(access, ids, from, to)));
      } catch (err) {
        if (err instanceof TokenRevokedError) {
          await this.#markError(sql, connectionId, 'access was revoked — reconnect the calendar');
        }
        return { ok: false, reason: 'calendar unreachable' };
      }
    }
    return { ok: true, intervals };
  }

  /**
   * Write a booking into the destination calendar, if one exists with the
   * events grant. M3 shape: never throws — a calendar outage must not
   * invalidate a booking the page has already confirmed.
   */
  async writeBack(
    sql: SqlClient,
    ownerId: string,
    bookingId: string,
    ev: BookingEvent,
  ): Promise<{ meetUrl?: string }> {
    try {
      const dest = await this.#destination(sql, ownerId);
      if (!dest) return {};
      const access = await this.#accessToken(sql, dest.row);
      const created = await dest.provider.createEvent(access, dest.calendarId, ev);
      await sql.query(
        `UPDATE bookings SET calendar_event_id = $2, calendar_connection_id = $3, meet_url = $4
          WHERE booking_id = $1`,
        [bookingId, created.eventId, dest.connectionId, created.meetUrl ?? null],
      );
      return { meetUrl: created.meetUrl };
    } catch (err) {
      console.warn(`[calendar] write-back failed for booking: ${(err as Error).message}`);
      return {};
    }
  }

  /** Mirror a cancel/move onto the stored calendar event. Never throws. */
  async onCancelled(sql: SqlClient, bookingId: string): Promise<void> {
    try {
      const found = await this.#eventFor(sql, bookingId);
      if (!found) return;
      const access = await this.#accessToken(sql, found.row);
      await found.provider.deleteEvent(access, found.calendarId, found.eventId);
      await sql.query(
        `UPDATE bookings SET calendar_event_id = NULL WHERE booking_id = $1`,
        [bookingId],
      );
    } catch (err) {
      console.warn(`[calendar] cancel mirror failed: ${(err as Error).message}`);
    }
  }

  async onMoved(sql: SqlClient, bookingId: string, start: string, end: string): Promise<void> {
    try {
      const found = await this.#eventFor(sql, bookingId);
      if (!found) return;
      const access = await this.#accessToken(sql, found.row);
      await found.provider.moveEvent(access, found.calendarId, found.eventId, start, end);
    } catch (err) {
      console.warn(`[calendar] move mirror failed: ${(err as Error).message}`);
    }
  }

  async #destination(sql: SqlClient, ownerId: string) {
    const { rows } = await sql.query(
      `SELECT c.connection_id, c.provider, c.refresh_token, c.access_token,
              c.access_expires_at, cc.calendar_id
         FROM calendar_connections c
         JOIN connection_calendars cc ON cc.connection_id = c.connection_id
        WHERE c.owner_id = $1 AND c.status = 'active' AND c.scope_level = 'events'
          AND cc.is_destination = 1
        LIMIT 1`,
      [ownerId],
    );
    const row = rows[0];
    if (!row) return undefined;
    const provider = this.provider(s(row['provider']));
    if (!provider) return undefined;
    return {
      row,
      provider,
      connectionId: s(row['connection_id']),
      calendarId: s(row['calendar_id']),
    };
  }

  async #eventFor(sql: SqlClient, bookingId: string) {
    const { rows } = await sql.query(
      `SELECT b.calendar_event_id, c.connection_id, c.provider, c.refresh_token,
              c.access_token, c.access_expires_at,
              (SELECT cc.calendar_id FROM connection_calendars cc
                WHERE cc.connection_id = c.connection_id AND cc.is_destination = 1
                LIMIT 1) AS calendar_id
         FROM bookings b
         JOIN calendar_connections c ON c.connection_id = b.calendar_connection_id
        WHERE b.booking_id = $1 AND b.calendar_event_id IS NOT NULL
        ORDER BY b.id DESC LIMIT 1`,
      [bookingId],
    );
    const row = rows[0];
    if (!row || row['calendar_id'] === null) return undefined;
    const provider = this.provider(s(row['provider']));
    if (!provider) return undefined;
    return {
      row,
      provider,
      eventId: s(row['calendar_event_id']),
      calendarId: s(row['calendar_id']),
    };
  }
}
