/**
 * SPEC-0003 — the Microsoft 365 / Outlook calendar adapter (Graph API).
 *
 * fetch-only, no SDK. The busy question uses calendarView, not getSchedule —
 * calendarView works for personal Microsoft accounts too and returns showAs,
 * which is the honest busy/free signal (cal.diy's production choice, inherited
 * here with its hard-won details: $top=999, naive-UTC times that need a 'Z',
 * showAs free/workingElsewhere dropped, @odata.nextLink followed).
 *
 * A 'conference' event becomes a Teams meeting (isOnlineMeeting), and the join
 * URL is read back from the response — Microsoft's analogue of the Meet link.
 *
 * Nothing outside this file knows Graph's wire format.
 */

import { TokenRevokedError } from './calendars.ts';
import type {
  BookingEvent,
  CalendarProvider,
  CreatedEvent,
  ProviderCalendar,
  ProviderTokens,
  ScopeLevel,
} from './calendars.ts';
import type { Interval } from '@pumasi/booking-core';

const AUTH_URL = 'https://login.microsoftonline.com/common/oauth2/v2.0/authorize';
const TOKEN_URL = 'https://login.microsoftonline.com/common/oauth2/v2.0/token';
const GRAPH = 'https://graph.microsoft.com/v1.0';

const SCOPES: Record<ScopeLevel, string> = {
  freebusy: 'openid email offline_access Calendars.Read',
  events: 'openid email offline_access Calendars.ReadWrite',
};

async function expectOk(res: Response, what: string): Promise<Response> {
  if (res.ok) return res;
  const body = await res.text();
  if (res.status === 401 || (res.status === 400 && body.includes('invalid_grant'))) {
    throw new TokenRevokedError(`microsoft ${what}: grant revoked (${res.status})`);
  }
  throw new Error(`microsoft ${what} failed: ${res.status} ${body.slice(0, 300)}`);
}

/** Graph speaks naive local datetimes with a separate IANA zone. */
const naiveUtc = (iso: string): string => iso.replace(/(\.\d+)?Z$/, '');

/** …and answers with naive UTC strings that need their 'Z' back. */
const withZ = (naive: string): string =>
  `${naive.replace(/(\.\d+)?$/, '')}Z`.replace(/\.\d+Z$/, 'Z');

function emailFromIdToken(idToken: string): string {
  const payload = idToken.split('.')[1] ?? '';
  const claims = JSON.parse(atob(payload.replace(/-/g, '+').replace(/_/g, '/'))) as {
    email?: string;
    preferred_username?: string;
  };
  const email = claims.email ?? claims.preferred_username;
  if (!email || !email.includes('@')) throw new Error('microsoft id_token carries no email');
  return email;
}

export class MicrosoftCalendarProvider implements CalendarProvider {
  readonly id = 'microsoft' as const;

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
      response_mode: 'query',
      scope: SCOPES[opts.scopeLevel],
      // A fresh consent returns a refresh token for the widened scope set.
      prompt: 'consent',
      state: opts.state,
    });
    if (opts.loginHint) p.set('login_hint', opts.loginHint);
    return `${AUTH_URL}?${p}`;
  }

  async #tokenCall(body: URLSearchParams, what: string) {
    const res = await fetch(TOKEN_URL, {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body,
    });
    await expectOk(res, what);
    return (await res.json()) as {
      access_token: string;
      refresh_token?: string;
      expires_in: number;
      id_token?: string;
      scope?: string;
    };
  }

  async exchangeCode(code: string, redirectUri: string): Promise<ProviderTokens> {
    const t = await this.#tokenCall(new URLSearchParams({
      code,
      client_id: this.clientId,
      client_secret: this.clientSecret,
      redirect_uri: redirectUri,
      grant_type: 'authorization_code',
    }), 'code exchange');
    if (!t.refresh_token) throw new Error('microsoft returned no refresh_token');
    if (!t.id_token) throw new Error('microsoft returned no id_token');
    return {
      refreshToken: t.refresh_token,
      accessToken: t.access_token,
      expiresAt: new Date(Date.now() + t.expires_in * 1000).toISOString().replace(/\.\d+Z/, 'Z'),
      accountEmail: emailFromIdToken(t.id_token),
      scopeLevel: (t.scope ?? '').includes('Calendars.ReadWrite') ? 'events' : 'freebusy',
    };
  }

  async refresh(refreshToken: string): Promise<{ accessToken: string; expiresAt: string }> {
    const t = await this.#tokenCall(new URLSearchParams({
      refresh_token: refreshToken,
      client_id: this.clientId,
      client_secret: this.clientSecret,
      grant_type: 'refresh_token',
    }), 'token refresh');
    return {
      accessToken: t.access_token,
      expiresAt: new Date(Date.now() + t.expires_in * 1000).toISOString().replace(/\.\d+Z/, 'Z'),
    };
  }

  async listCalendars(accessToken: string): Promise<ProviderCalendar[]> {
    const res = await fetch(`${GRAPH}/me/calendars?$select=id,name,isDefaultCalendar&$top=50`, {
      headers: { authorization: `Bearer ${accessToken}` },
    });
    await expectOk(res, 'calendar list');
    const body = (await res.json()) as {
      value?: { id: string; name?: string; isDefaultCalendar?: boolean }[];
    };
    return (body.value ?? []).map((c) => ({
      id: c.id,
      name: c.name ?? 'Calendar',
      primary: c.isDefaultCalendar === true,
    }));
  }

  async freeBusy(
    accessToken: string,
    calendarIds: string[],
    from: string,
    to: string,
  ): Promise<Interval[]> {
    const out: Interval[] = [];
    for (const id of calendarIds) {
      let url: string | undefined =
        `${GRAPH}/me/calendars/${encodeURIComponent(id)}/calendarView` +
        `?startDateTime=${encodeURIComponent(from)}&endDateTime=${encodeURIComponent(to)}` +
        `&$select=showAs,start,end&$top=999`;
      // nextLink loops are bounded: a two-week window cannot hold this many pages.
      for (let page = 0; url && page < 10; page++) {
        const res = await fetch(url, {
          headers: {
            authorization: `Bearer ${accessToken}`,
            // Times come back in UTC regardless of the mailbox timezone.
            prefer: 'outlook.timezone="UTC"',
          },
        });
        await expectOk(res, 'calendar view');
        const body = (await res.json()) as {
          value?: { showAs?: string; start?: { dateTime?: string }; end?: { dateTime?: string } }[];
          '@odata.nextLink'?: string;
        };
        for (const ev of body.value ?? []) {
          // free / workingElsewhere do not block a meeting (cal.diy's rule).
          if (ev.showAs === 'free' || ev.showAs === 'workingElsewhere') continue;
          if (!ev.start?.dateTime || !ev.end?.dateTime) continue;
          out.push({ start: withZ(ev.start.dateTime), end: withZ(ev.end.dateTime) });
        }
        url = body['@odata.nextLink'];
      }
    }
    return out;
  }

  async createEvent(
    accessToken: string,
    calendarId: string,
    ev: BookingEvent,
  ): Promise<CreatedEvent> {
    const payload: Record<string, unknown> = {
      subject: ev.title,
      body: { contentType: 'text', content: ev.description },
      start: { dateTime: naiveUtc(ev.start), timeZone: 'UTC' },
      end: { dateTime: naiveUtc(ev.end), timeZone: 'UTC' },
    };
    if (ev.conference) {
      payload['isOnlineMeeting'] = true;
      payload['onlineMeetingProvider'] = 'teamsForBusiness';
    }
    const res = await fetch(`${GRAPH}/me/calendars/${encodeURIComponent(calendarId)}/events`, {
      method: 'POST',
      headers: { authorization: `Bearer ${accessToken}`, 'content-type': 'application/json' },
      body: JSON.stringify(payload),
    });
    await expectOk(res, 'event insert');
    const body = (await res.json()) as {
      id: string;
      onlineMeeting?: { joinUrl?: string };
    };
    return { eventId: body.id, meetUrl: body.onlineMeeting?.joinUrl };
  }

  async moveEvent(
    accessToken: string,
    _calendarId: string,
    eventId: string,
    start: string,
    end: string,
  ): Promise<void> {
    const res = await fetch(`${GRAPH}/me/events/${encodeURIComponent(eventId)}`, {
      method: 'PATCH',
      headers: { authorization: `Bearer ${accessToken}`, 'content-type': 'application/json' },
      body: JSON.stringify({
        start: { dateTime: naiveUtc(start), timeZone: 'UTC' },
        end: { dateTime: naiveUtc(end), timeZone: 'UTC' },
      }),
    });
    await expectOk(res, 'event move');
  }

  async deleteEvent(accessToken: string, _calendarId: string, eventId: string): Promise<void> {
    const res = await fetch(`${GRAPH}/me/events/${encodeURIComponent(eventId)}`, {
      method: 'DELETE',
      headers: { authorization: `Bearer ${accessToken}` },
    });
    // Already gone is done (Graph answers 404; 410 kept for symmetry).
    if (!res.ok && res.status !== 404 && res.status !== 410) await expectOk(res, 'event delete');
  }

  async revoke(_refreshToken: string): Promise<void> {
    // Microsoft offers no simple refresh-token revocation endpoint; local
    // deletion is the guarantee (D3), as everywhere.
  }
}
