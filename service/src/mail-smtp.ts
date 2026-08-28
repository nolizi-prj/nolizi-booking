/**
 * SPEC-0002 M1, M4 — the SMTP adapter.
 *
 * SMTP rather than a provider SDK, for the same reason GAP-0004 §2 implements
 * enterprise features from their standards: the standard is the safer and the
 * better source. Every provider speaks it, so the choice becomes a URL in
 * configuration and switching costs nothing — no vendor type, field or error
 * enters the tree, which is what M1 requires.
 *
 * Nothing outside this file knows mail exists beyond `MailPort`.
 */

import { randomUUID } from 'node:crypto';
import { createTransport, getTestMessageUrl, type Transporter } from 'nodemailer';
import { Temporal } from '@js-temporal/polyfill';
import type { MailMessage, MailPort } from './mail.ts';

export interface SmtpConfig {
  /** e.g. smtp://user:pass@host:587 — or smtps:// for implicit TLS. */
  url: string;
  from: string;
  /** Absolute base for management links, e.g. https://book.example.com */
  baseUrl: string;
  /** Suppress per-message logging. Tests set this; deployments should not. */
  quiet?: boolean;
}

/**
 * M4 · The meeting time is rendered in the RECIPIENT's timezone, converted at
 * send from the stored UTC value. One conversion, in one place, from the one
 * representation the system keeps.
 */
/** `ada@example.com` -> `a***@example.com`. Traceable, not harvestable. */
export function redactAddress(address: string): string {
  const at = address.indexOf('@');
  if (at <= 0) return '***';
  return `${address[0]}***${address.slice(at)}`;
}

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

  switch (m.kind) {
    case 'confirmed':
      return {
        subject: `Booked: ${when}`,
        text: `Your booking is confirmed.\n\nWhen: ${when}\n${manage}`,
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
    case 'rescheduled':
      return {
        subject: `Moved: ${when}`,
        text: `This booking has moved.\n\nNow: ${when}\n${manage}`,
      };
  }
}

export class SmtpMail implements MailPort {
  readonly #transport: Transporter;

  constructor(private readonly config: SmtpConfig) {
    this.#transport = createTransport(config.url);
  }

  async send(message: MailMessage): Promise<void> {
    // `to: 'owner'` is a placeholder the caller resolves; refusing it here is
    // better than silently mailing a literal address of "owner".
    if (!message.to.includes('@')) {
      throw new Error(`refusing to send to a non-address: ${message.to}`);
    }
    const { subject, text } = renderMessage(message, this.config.baseUrl);
    const info = (await this.#transport.sendMail({
      from: this.config.from,
      to: message.to,
      subject,
      text,
    })) as { messageId?: string; accepted?: unknown[] };

    // Say what was actually accepted, by whom. A mail path that reports nothing
    // is indistinguishable from one that silently drops messages, and the
    // difference only shows up when someone is waiting for a confirmation.
    // D4 · a booker's address never appears in a log line. Enough to trace a
    // message, not enough to harvest one.
    this.#log(`[mail] sent ${message.kind} to ${redactAddress(message.to)} (${info.messageId ?? 'no id'})`);

    // Ethereal captures rather than delivers and exposes a viewable URL. Worth
    // surfacing: it is the difference between "the call returned" and being
    // able to read what the recipient would have got.
    const preview = getTestMessageUrl(info as never);
    if (preview) this.#log(`[mail] preview: ${preview}`);
  }

  #log(line: string): void {
    if (this.config.quiet !== true) console.log(line);
  }

  async close(): Promise<void> {
    this.#transport.close();
  }
}

/**
 * Development: writes each message to a directory as a readable file, so mail
 * can be inspected without a server or an account. Deliberately not a silent
 * no-op — a mail path that appears to work and sends nothing is how "we tested
 * it" becomes untrue.
 */
export class FileMail implements MailPort {
  constructor(
    private readonly dir: string,
    private readonly baseUrl: string,
  ) {}

  async send(message: MailMessage): Promise<void> {
    const { mkdir, writeFile } = await import('node:fs/promises');
    const { resolve } = await import('node:path');
    await mkdir(this.dir, { recursive: true });
    const { subject, text } = renderMessage(message, this.baseUrl);
    // D4 · not in the filename either — a directory listing is a log.
    const name = `${Date.now()}-${message.kind}-${randomUUID().slice(0, 8)}.txt`;
    await writeFile(
      resolve(this.dir, name),
      `To: ${message.to}\nSubject: ${subject}\n\n${text}`,
      'utf8',
    );
  }
}
