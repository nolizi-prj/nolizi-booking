/**
 * SPEC-0002 — Video call integration (Zoom OAuth Login & Dynamic Meeting Creation).
 *
 * Supports:
 * 1. User OAuth Connect ("Connect with Zoom"): User logs in with Zoom and authorizes meeting creation.
 * 2. Automatic dynamic meeting creation per booking.
 * 3. Server-to-Server OAuth.
 * 4. Personal Meeting Room (PMI) fallback.
 */

const ZOOM_AUTH_URL = 'https://zoom.us/oauth/authorize';
const ZOOM_TOKEN_URL = 'https://zoom.us/oauth/token';
const ZOOM_API_URL = 'https://api.zoom.us/v2';

export interface ZoomConfig {
  accountId?: string;
  clientId?: string;
  clientSecret?: string;
}

export interface ZoomMeetingOptions {
  topic: string;
  startTime: string; // ISO RFC 3339 / UTC
  durationMinutes: number;
  timezone: string;
  agenda?: string;
}

export interface ZoomMeetingResult {
  joinUrl: string;
  startUrl?: string;
  meetingId: string;
  password?: string;
}

export interface ZoomTokenResponse {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
  email: string;
  pmi?: string;
  personalMeetingUrl?: string;
  displayName?: string;
}

/**
 * Returns the OAuth authorization URL for connecting a user's Zoom account.
 */
export function zoomAuthUrl(opts: {
  clientId: string;
  redirectUri: string;
  state: string;
}): string {
  const p = new URLSearchParams({
    response_type: 'code',
    client_id: opts.clientId,
    redirect_uri: opts.redirectUri,
    state: opts.state,
  });
  return `${ZOOM_AUTH_URL}?${p}`;
}

/**
 * Exchanges OAuth authorization code with Zoom for access & refresh tokens and user profile.
 */
export async function zoomExchangeCode(opts: {
  clientId: string;
  clientSecret: string;
  code: string;
  redirectUri: string;
}): Promise<ZoomTokenResponse> {
  const authHeader = btoa(`${opts.clientId}:${opts.clientSecret}`);
  const res = await fetch(ZOOM_TOKEN_URL, {
    method: 'POST',
    headers: {
      authorization: `Basic ${authHeader}`,
      'content-type': 'application/x-www-form-urlencoded',
    },
    body: new URLSearchParams({
      grant_type: 'authorization_code',
      code: opts.code,
      redirect_uri: opts.redirectUri,
    }),
  });

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`Zoom OAuth exchange failed (${res.status}): ${errText}`);
  }

  const tokenData = (await res.json()) as {
    access_token: string;
    refresh_token: string;
    expires_in: number;
  };

  // Fetch user profile from Zoom API
  const userRes = await fetch(`${ZOOM_API_URL}/users/me`, {
    headers: { authorization: `Bearer ${tokenData.access_token}` },
  });

  let email = 'unknown@zoom.us';
  let pmi: string | undefined;
  let personalMeetingUrl: string | undefined;
  let displayName: string | undefined;

  if (!userRes.ok) {
    // The silent half of a silent failure: connect "succeeded" while the
    // profile fetch quietly died, so no PMI was ever stamped and the UI said
    // Not Connected with no clue. Log status and body so the tail shows why.
    console.warn(`[zoom] /users/me failed: ${userRes.status} ${(await userRes.text()).slice(0, 300)}`);
  }
  if (userRes.ok) {
    const user = (await userRes.json()) as {
      email?: string;
      pmi?: number | string;
      personal_meeting_url?: string;
      first_name?: string;
      last_name?: string;
    };
    if (user.email) email = user.email;
    if (user.pmi) pmi = String(user.pmi);
    if (user.personal_meeting_url) personalMeetingUrl = user.personal_meeting_url;
    if (user.first_name || user.last_name) {
      displayName = [user.first_name, user.last_name].filter(Boolean).join(' ');
    }
  }

  return {
    accessToken: tokenData.access_token,
    refreshToken: tokenData.refresh_token,
    expiresIn: tokenData.expires_in,
    email,
    pmi,
    personalMeetingUrl,
    displayName,
  };
}

/**
 * SPEC-0005 Z3c — exchanges a stored refresh token for a fresh access token.
 *
 * Zoom **rotates** the refresh token on every use: the response's
 * `refresh_token` replaces the stored one, and the old value is dead the moment
 * this returns. A caller that does not persist the new pair before using the
 * access token has locked the owner out of their own connection on the next
 * booking.
 */
export async function zoomRefreshToken(opts: {
  clientId: string;
  clientSecret: string;
  refreshToken: string;
}): Promise<{ accessToken: string; refreshToken: string; expiresIn: number }> {
  const authHeader = btoa(`${opts.clientId}:${opts.clientSecret}`);
  const res = await fetch(ZOOM_TOKEN_URL, {
    method: 'POST',
    headers: {
      authorization: `Basic ${authHeader}`,
      'content-type': 'application/x-www-form-urlencoded',
    },
    body: new URLSearchParams({
      grant_type: 'refresh_token',
      refresh_token: opts.refreshToken,
    }),
  });
  if (!res.ok) {
    throw new Error(`Zoom refresh failed (${res.status}): ${(await res.text()).slice(0, 300)}`);
  }
  const d = (await res.json()) as {
    access_token: string;
    refresh_token: string;
    expires_in: number;
  };
  return { accessToken: d.access_token, refreshToken: d.refresh_token, expiresIn: d.expires_in };
}

/**
 * Creates a dynamic Zoom meeting on behalf of an authorized Zoom user.
 */
export async function createZoomUserMeeting(
  accessToken: string,
  opts: ZoomMeetingOptions,
): Promise<ZoomMeetingResult | null> {
  try {
    const res = await fetch(`${ZOOM_API_URL}/users/me/meetings`, {
      method: 'POST',
      headers: {
        authorization: `Bearer ${accessToken}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        topic: opts.topic,
        type: 2, // Scheduled meeting
        start_time: opts.startTime,
        duration: opts.durationMinutes,
        timezone: opts.timezone,
        agenda: opts.agenda || 'Scheduled via Pumasi Booking',
        settings: {
          host_video: true,
          participant_video: true,
          join_before_host: true,
          mute_upon_entry: false,
          waiting_room: false,
        },
      }),
    });

    if (!res.ok) {
      console.warn('[zoom] Meeting creation failed:', res.status, await res.text());
      return null;
    }

    const data = (await meetingRes(res));

    return {
      meetingId: String(data.id),
      joinUrl: data.join_url,
      startUrl: data.start_url,
      password: data.password,
    };
  } catch (err) {
    console.warn('[zoom] Meeting creation exception:', err);
    return null;
  }
}

async function meetingRes(res: Response): Promise<{
  id: number;
  join_url: string;
  start_url?: string;
  password?: string;
}> {
  return (await res.json()) as {
    id: number;
    join_url: string;
    start_url?: string;
    password?: string;
  };
}

/**
 * Creates a dynamic Zoom meeting via Zoom API if credentials are configured.
 */
export async function createZoomMeeting(
  opts: ZoomMeetingOptions,
  config: ZoomConfig,
): Promise<ZoomMeetingResult | null> {
  if (!config.accountId || !config.clientId || !config.clientSecret) {
    return null;
  }

  try {
    const authHeader = btoa(`${config.clientId}:${config.clientSecret}`);
    const tokenRes = await fetch(
      `https://zoom.us/oauth/token?grant_type=account_credentials&account_id=${encodeURIComponent(config.accountId)}`,
      {
        method: 'POST',
        headers: {
          authorization: `Basic ${authHeader}`,
          'content-type': 'application/x-www-form-urlencoded',
        },
      },
    );

    if (!tokenRes.ok) {
      console.warn('[zoom] Token request failed:', tokenRes.status, await tokenRes.text());
      return null;
    }

    const tokenData = (await tokenRes.json()) as { access_token: string };
    return await createZoomUserMeeting(tokenData.access_token, opts);
  } catch (err) {
    console.warn('[zoom] Exception creating Zoom meeting:', err);
    return null;
  }
}
