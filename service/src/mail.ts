/**
 * SPEC-0002 M1 — mail as a port with one adapter behind it.
 *
 * No provider type, field, or error appears outside an adapter. The provider is
 * unchosen (INTENT.md question 3) and this is what makes deferring it safe: the
 * choice becomes configuration, not a rewrite.
 */

export interface MailMessage {
  kind: 'confirmed' | 'cancelled' | 'rescheduled' | 'signin' | 'verify' | 'custom';
  /** An address, or the literal 'owner' meaning the schedule's owner. */
  to: string;
  bookingId: string;
  start: string;
  token?: string;
  timezone?: string;
  /** P2 · where the meeting happens — an address, a phone note, a Meet link. */
  location?: string;
  /** P3 · an iCalendar attachment (ics.ts), sent with confirmations. */
  ics?: string;
  /** P7 · kind 'custom' only: the workflow's own rendered subject and body. */
  subject?: string;
  body?: string;
}

export interface MailPort {
  send(message: MailMessage): Promise<void>;
}

/**
 * M3 · A provider outage must never invalidate a booking. Failures are recorded
 * for retry and swallowed here deliberately: the booking is already committed
 * and the page has said so.
 */
export class RetryingMail implements MailPort {
  readonly failed: MailMessage[] = [];
  constructor(private readonly inner: MailPort) {}
  async send(message: MailMessage): Promise<void> {
    try {
      await this.inner.send(message);
    } catch {
      this.failed.push(message);
    }
  }
}

/** Development and tests. Records rather than sends. */
/**
 * D6 · The mail host is not a named subprocessor, so nothing is sent through it.
 *
 * This replaces an earlier refusal to *start*. The duty D6 creates is that
 * nobody's name, address or meeting time reaches an undisclosed party; refusing
 * the send discharges that exactly. Refusing to boot additionally took down the
 * booking pages, which protects no one and is an outage the operator did not
 * choose. Failures here are collected by RetryingMail, so the booking still
 * commits and the message is queued rather than lost.
 */
export class RefusingMail implements MailPort {
  constructor(private readonly host: string) {}
  async send(_message: MailMessage): Promise<void> {
    throw new Error(
      `refusing to send: mail host "${this.host}" is not named in SUBPROCESSORS.md`,
    );
  }
}

export class RecordingMail implements MailPort {
  readonly sent: MailMessage[] = [];
  async send(message: MailMessage): Promise<void> {
    this.sent.push(message);
  }
}

/** Used to prove M3: every send fails, and bookings must survive it. */
export class AlwaysFailingMail implements MailPort {
  async send(): Promise<void> {
    throw new Error('mail provider unavailable');
  }
}
