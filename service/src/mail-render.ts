/**
 * SPEC-0002 M4 — message rendering, shared by every adapter.
 *
 * Pure: no transport, no node:-only import. The Workers adapter (mail-gmail.ts)
 * bundles this file, so it must stay runnable outside Node.
 */

import { Temporal } from '@js-temporal/polyfill';
import type { MailMessage } from './mail.ts';

/** `ada@example.com` -> `a***@example.com`. Traceable, not harvestable. */
export function redactAddress(address: string): string {
  const at = address.indexOf('@');
  if (at <= 0) return '***';
  return `${address[0]}***${address.slice(at)}`;
}

/**
 * M4 · The meeting time is rendered in the RECIPIENT's timezone, converted at
 * send from the stored UTC value. One conversion, in one place, from the one
 * representation the system keeps.
 */
export function renderTime(instantIso: string, timezone: string): string {
  const zoned = Temporal.Instant.from(instantIso).toZonedDateTimeISO(timezone);
  const date = zoned.toPlainDate().toString();
  const time = zoned.toPlainTime().toString().slice(0, 5);
  return `${date} ${time} (${timezone})`;
}

export interface RenderedMail {
  subject: string;
  text: string;
}

/**
 * Message bodies. Plain text only: it renders everywhere, cannot carry a
 * tracking pixel, and there is nothing in a booking confirmation that needs
 * markup.
 */
export function renderMessage(m: MailMessage, baseUrl: string): RenderedMail {
  const tz = m.timezone ?? 'UTC';
  const when = renderTime(m.start, tz);
  const link = m.token ? `${baseUrl.replace(/\/$/, '')}/b/${m.token}` : undefined;

  const manage = link
    ? `\nTo cancel or move it:\n  ${link}\n\nKeep that link — it is the only way back in, and anyone\nholding it can change the booking.\n`
    : '';

  const where = m.location ? `Where: ${m.location}\n` : '';

  switch (m.kind) {
    case 'custom':
      // P7 · a workflow authored this; rendering already happened there.
      return { subject: m.subject ?? '(no subject)', text: m.body ?? '' };
    case 'confirmed':
      return {
        subject: `Booked: ${when}`,
        text: `Your booking is confirmed.\n\nWhen: ${when}\n${where}${manage}`,
      };
    case 'cancelled':
      return {
        subject: `Cancelled: ${when}`,
        text: `This booking has been cancelled.\n\nIt was: ${when}\n\nThat time is now free for someone else.\n`,
      };
    case 'signin':
      return {
        subject: 'Your sign-in link',
        text:
          `Use this link to sign in:\n  ${baseUrl.replace(/\/$/, '')}/auth/${m.token ?? ''}\n\n` +
          `It works once and expires in 20 minutes.\n\n` +
          `If you did not ask for it, nothing has happened and you can ignore this.\n`,
      };
    case 'verify':
      // No meeting exists yet, so this message must not describe one as
      // booked. It states the time it WOULD take, and that nothing has
      // happened until the link is used — otherwise someone whose address was
      // typed by a stranger believes they have an appointment.
      return {
        subject: `Confirm your booking: ${when}`,
        text:
          `Someone asked to book this time with your email address:\n\n` +
          `When: ${when}\n${where}\n` +
          `Nothing is booked yet. To confirm it, use this link:\n` +
          `  ${baseUrl.replace(/\/$/, '')}/v/${m.token ?? ''}\n\n` +
          `It works once and expires in 30 minutes. The time is not held in\n` +
          `the meantime, so someone else may take it first.\n\n` +
          `If this was not you, ignore this message — no booking was made and\n` +
          `none will be.\n`,
      };
    case 'rescheduled':
      return {
        subject: `Moved: ${when}`,
        text: `This booking has moved.\n\nNow: ${when}\n${manage}`,
      };
  }
}
