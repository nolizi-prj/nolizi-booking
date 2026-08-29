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
import { redactAddress, renderMessage } from './mail-render.ts';
import type { MailMessage, MailPort } from './mail.ts';

// Rendering lives in mail-render.ts (Workers-safe); re-exported here because
// this file was its original home and the tests import it from here.
export { redactAddress, renderMessage, renderTime, type RenderedMail } from './mail-render.ts';

export interface SmtpConfig {
  /** e.g. smtp://user:pass@host:587 — or smtps:// for implicit TLS. */
  url: string;
  from: string;
  /** Absolute base for management links, e.g. https://book.example.com */
  baseUrl: string;
  /** Suppress per-message logging. Tests set this; deployments should not. */
  quiet?: boolean;
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
      // P3 · calendar attachment on confirmations.
      attachments: message.ics
        ? [{ filename: 'invite.ics', content: message.ics, contentType: 'text/calendar; method=PUBLISH' }]
        : undefined,
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
