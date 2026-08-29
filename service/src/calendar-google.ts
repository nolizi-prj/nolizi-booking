/**
 * SPEC-0003 — the Google Calendar adapter.
 *
 * fetch + WebCrypto only, no SDK, so it runs on Workers and Node identically.
 * Scopes are the narrowest that do each job (INTENT.md): `freebusy` +
 * `calendarlist.readonly` to answer "when are you busy", and `calendar.events`
 * only when the owner separately grants write-back. Nothing here reads event
 * titles, attendees or locations — the freebusy endpoint cannot return them.
 *
 * Nothing outside this file knows Google's wire format.
 */

import type {
  BookingEvent,
  CalendarProvider,
  ProviderCalendar,
  ProviderTokens,
  ScopeLevel,
} from './calendars.ts';
import type { Interval } from '@pumasi/booking-core';

const AUTH_URL = 'https://accounts.google.com/o/oauth2/v2/auth';
const TOKEN_URL = 'https://oauth2.googleapis.com/token';
const REVOKE_URL = 'https://oauth2.googleapis.com/revoke';
const API = 'https://www.googleapis.com/calendar/v3';

const SCOPES: Record<ScopeLevel, string> = {
  freebusy:
    'openid email https://www.googleapis.com/auth/calendar.freebusy https://www.googleapis.com/auth/calendar.calendarlist.readonly',
  events:
    'openid email https://www.googleapis.com/auth/calendar.freebusy https://www.googleapis.com/auth/calendar.calendarlist.readonly https://www.googleapis.com/auth/calendar.events',
};

/** 401/403-invalid_grant/410 mean the grant is gone, not that Google is down. */
export class TokenRevokedError extends Error {}

async function expectOk(res: Response, what: string): Promise<Response> {
  if (res.ok) return res;
  const body = await res.text();
  if (res.status === 401 || (res.status === 400 && body.includes('invalid_grant'))) {
    throw new TokenRevokedError(`google ${what}: grant revoked (${res.status})`);
  }
  throw new Error(`google ${what} failed: ${res.status} ${body.slice(0, 300)}`);
}

/** The id_token arrives directly from Google over TLS; decoding, not verifying. */
function emailFromIdToken(idToken: string): string {
  const payload = idToken.split('.')[1] ?? '';
  const json = atob(payload.replace(/-/g, '+').replace(/_/g, '/'));
  const claims = JSON.parse(json) as { email?: string };
  if (!claims.email) throw new Error('google id_token carries no email');
  return claims.email;
}

export class GoogleCalendarProvider implements CalendarProvider {
  readonly id = 'google' as const;

  constructor(
    private readonly clientId: string,
    private readonly clientSecret: string,
  ) {}

  authUrl(opts: {
    state: string;
    redirectUri: string;
    scopeLevel: ScopeLevel;
    loginHint?: string;
  }): string {
    const p = new URLSearchParams({
      client_id: this.clientId,
      redirect_uri: opts.redirectUri,
      response_type: 'code',
      scope: SCOPES[opts.scopeLevel],
      // offline + consent: a refresh token every time, or upgrades silently
      // return none and the connection dies at the first access-token expiry.
      access_type: 'offline',
      prompt: 'consent',
      include_granted_scopes: 'true',
      state: opts.state,
    });
    if (opts.loginHint) p.set('login_hint', opts.loginHint);
    return `${AUTH_URL}?${p}`;
  }

  async exchangeCode(code: string, redirectUri: string): Promise<ProviderTokens> {
    const res = await fetch(TOKEN_URL, {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        code,
        client_id: this.clientId,
        client_secret: this.clientSecret,
        redirect_uri: redirectUri,
        grant_type: 'authorization_code',
      }),
    });
    await expectOk(res, 'code exchange');
    const t = (await res.json()) as {
      access_token: string;
      refresh_token?: string;
      expires_in: number;
      id_token: string;
      scope: string;
    };
    if (!t.refresh_token) throw new Error('google returned no refresh_token');
    return {
      refreshToken: t.refresh_token,
      accessToken: t.access_token,
      expiresAt: new Date(Date.now() + t.expires_in * 1000).toISOString().replace(/\.\d+Z/, 'Z'),
      accountEmail: emailFromIdToken(t.id_token),
      scopeLevel: t.scope.includes('calendar.events') ? 'events' : 'freebusy',
    };
  }

  async refresh(refreshToken: string): Promise<{ accessToken: string; expiresAt: string }> {
    const res = await fetch(TOKEN_URL, {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        refresh_token: refreshToken,
        client_id: this.clientId,
        client_secret: this.clientSecret,
        grant_type: 'refresh_token',
      }),
    });
    await expectOk(res, 'token refresh');
    const t = (await res.json()) as { access_token: string; expires_in: number };
    return {
      accessToken: t.access_token,
      expiresAt: new Date(Date.now() + t.expires_in * 1000).toISOString().replace(/\.\d+Z/, 'Z'),
    };
  }

  async listCalendars(accessToken: string): Promise<ProviderCalendar[]> {
    const res = await fetch(`${API}/users/me/calendarList?minAccessRole=freeBusyReader`, {
      headers: { authorization: `Bearer ${accessToken}` },
    });
    await expectOk(res, 'calendar list');
    const body = (await res.json()) as {
      items?: { id: string; summary?: string; primary?: boolean }[];
    };
    return (body.items ?? []).map((c) => ({
      id: c.id,
      name: c.summary ?? c.id,
      primary: c.primary === true,
    }));
  }

  async freeBusy(
    accessToken: string,
    calendarIds: string[],
    from: string,
    to: string,
  ): Promise<Interval[]> {
    const res = await fetch(`${API}/freeBusy`, {
      method: 'POST',
      headers: { authorization: `Bearer ${accessToken}`, 'content-type': 'application/json' },
      body: JSON.stringify({
        timeMin: from,
        timeMax: to,
        items: calendarIds.map((id) => ({ id })),
      }),
    });
    await expectOk(res, 'freebusy');
    const body = (await res.json()) as {
      calendars?: Record<string, { busy?: { start: string; end: string }[]; errors?: unknown[] }>;
    };
    const out: Interval[] = [];
    for (const id of calendarIds) {
      const cal = body.calendars?.[id];
      // A calendar the API cannot answer for is a blind spot, and a blind spot
      // fails closed (INTENT: never offer times while unable to see).
      if (!cal || cal.errors?.length) {
        throw new Error(`google freebusy: no answer for calendar ${id}`);
      }
      for (const b of cal.busy ?? []) out.push({ start: b.start, end: b.end });
    }
    return out;
  }

  async createEvent(
    accessToken: string,
    calendarId: string,
    ev: BookingEvent,
  ): Promise<string> {
    // sendUpdates=none: this service already mails both parties (M5); Google
    // must not mail them again.
    const res = await fetch(
      `${API}/calendars/${encodeURIComponent(calendarId)}/events?sendUpdates=none`,
      {
        method: 'POST',
        headers: { authorization: `Bearer ${accessToken}`, 'content-type': 'application/json' },
        body: JSON.stringify({
          summary: ev.title,
          description: ev.description,
          start: { dateTime: ev.start, timeZone: 'UTC' },
          end: { dateTime: ev.end, timeZone: 'UTC' },
        }),
      },
    );
    await expectOk(res, 'event insert');
    const body = (await res.json()) as { id: string };
    return body.id;
  }

  async moveEvent(
    accessToken: string,
    calendarId: string,
    eventId: string,
    start: string,
    end: string,
  ): Promise<void> {
    const res = await fetch(
      `${API}/calendars/${encodeURIComponent(calendarId)}/events/${encodeURIComponent(eventId)}?sendUpdates=none`,
      {
        method: 'PATCH',
        headers: { authorization: `Bearer ${accessToken}`, 'content-type': 'application/json' },
        body: JSON.stringify({
          start: { dateTime: start, timeZone: 'UTC' },
          end: { dateTime: end, timeZone: 'UTC' },
        }),
      },
    );
    await expectOk(res, 'event move');
  }

  async deleteEvent(accessToken: string, calendarId: string, eventId: string): Promise<void> {
    const res = await fetch(
      `${API}/calendars/${encodeURIComponent(calendarId)}/events/${encodeURIComponent(eventId)}?sendUpdates=none`,
      { method: 'DELETE', headers: { authorization: `Bearer ${accessToken}` } },
    );
    // 404/410: already gone — deletion is idempotent from our side.
    if (!res.ok && res.status !== 404 && res.status !== 410) await expectOk(res, 'event delete');
  }

  async revoke(refreshToken: string): Promise<void> {
    // Best effort: the local deletion is the guarantee; Google's side is
    // courtesy. A failure here must not keep tokens alive locally.
    await fetch(`${REVOKE_URL}?token=${encodeURIComponent(refreshToken)}`, {
      method: 'POST',
    }).catch(() => {});
  }
}
