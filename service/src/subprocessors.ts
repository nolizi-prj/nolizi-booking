/**
 * SPEC-0002 D6 — the mail-host allow-list, enforced on one build of two.
 *
 * A published list that nothing checks is a description of intentions. This is
 * the "Permitted mail host" table of SUBPROCESSORS.md in machine-readable form,
 * and the two must say the same thing.
 *
 * **Which build enforces it.** `server.ts` — the self-hosted Node build — is the
 * only caller of `isPermittedMailHost`. There, a host absent from this list gets
 * a loud startup refusal and a `RefusingMail` that will not SEND, while the
 * service keeps serving: the duty is that nobody's details reach an undisclosed
 * party, and stopping the mail discharges that without an outage.
 *
 * **`worker.ts` — the Cloudflare Workers build that serves booking.pumasi.ai —
 * does not import this file at all**, and no runtime check on that path can
 * exist: Workers cannot open SMTP connections, so that build sends through the
 * Gmail API (`mail-gmail.ts`) and never constructs the SMTP transport this guard
 * wraps. What controls that path is which transport `worker.ts` constructs — a
 * code change, visible in review — plus the disclosure in the served register.
 * That is a weaker control, and it is named as weaker rather than left to be
 * read as if this list covered both (lessons/L-009).
 *
 * **Adding a host means editing this list and SUBPROCESSORS.md together**, and
 * the published register at `/subprocessors` (`legal.ts`) if a new *party* is
 * involved. That is deliberate friction: a provider who will see people's names,
 * addresses and meeting times should require saying so in a document anyone can
 * read. No production mail host is on this list, and `smtp.gmail.com` is
 * deliberately not on it — the Gmail *API* is not an SMTP host and is not what
 * this checks.
 */

export interface Subprocessor {
  host: string;
  sees: string;
  why: string;
}

export const PERMITTED_MAIL_HOSTS: readonly Subprocessor[] = [
  { host: 'localhost', sees: 'message contents', why: 'development only, on your own machine' },
  { host: '127.0.0.1', sees: 'message contents', why: 'development only, on your own machine' },
  {
    host: 'smtp.ethereal.email',
    sees: 'message contents and recipient addresses',
    why: 'testing; Ethereal captures and never delivers',
  },
];

export function mailHostOf(smtpUrl: string): string {
  try {
    return new URL(smtpUrl).hostname;
  } catch {
    return '';
  }
}

export function isPermittedMailHost(host: string): boolean {
  return PERMITTED_MAIL_HOSTS.some((p) => p.host === host);
}
