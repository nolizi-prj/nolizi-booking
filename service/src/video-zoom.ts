/**
 * SPEC-0002 — Video call integration (Zoom, Google Meet, Microsoft Teams, Google Chat).
 *
 * Provides dynamic Zoom meeting creation via Zoom REST API (Server-to-Server OAuth),
 * alongside Google Meet and Microsoft Teams calendar integration.
 */

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

    const meetingRes = await fetch('https://api.zoom.us/v2/users/me/meetings', {
      method: 'POST',
      headers: {
        authorization: `Bearer ${tokenData.access_token}`,
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

    if (!meetingRes.ok) {
      console.warn('[zoom] Meeting creation failed:', meetingRes.status, await meetingRes.text());
      return null;
    }

    const data = (await meetingRes.json()) as {
      id: number;
      join_url: string;
      start_url?: string;
      password?: string;
    };

    return {
      meetingId: String(data.id),
      joinUrl: data.join_url,
      startUrl: data.start_url,
      password: data.password,
    };
  } catch (err) {
    console.warn('[zoom] Exception creating Zoom meeting:', err);
    return null;
  }
}
