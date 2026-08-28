/**
 * SPEC-0002 D6 — the subprocessor allow-list, enforced.
 *
 * A published list that nothing checks is a description of intentions. This is
 * the same list as SUBPROCESSORS.md in machine-readable form, and the service
 * refuses to start if configured to send through a host absent from it.
 *
 * The two must be edited together. That is deliberate friction: adding a party
 * who will see people's names, addresses and meeting times should require
 * saying so in a document anyone can read.
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
