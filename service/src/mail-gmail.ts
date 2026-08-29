/**
 * SPEC-0002 M1 — the Gmail API adapter, for Cloudflare Workers.
 *
 * Workers cannot open SMTP connections, so the SMTP adapter (mail-smtp.ts)
 * cannot run there. pumasi.ai mail is Google Workspace-hosted, and a service
 * account with domain-wide delegation may send as the domain's users — so the
 * transport is the Gmail REST API over fetch, with the OAuth JWT signed by
 * WebCrypto. No node:-only import, no SDK: this file must stay bundleable by
 * wrangler and is the only place Gmail exists.
 *
 * Nothing outside this file knows mail exists beyond `MailPort`.
 */

import { redactAddress, renderMessage } from './mail-render.ts';
import type { MailMessage, MailPort } from './mail.ts';

export interface GmailConfig {
  /** The service-account key JSON, verbatim (client_email + private_key). */
  saKeyJson: string;
  /** The Workspace user the delegation impersonates, e.g. admin@example.com. */
  impersonate: string;
  /** RFC 5322 From. Must be that user's address or a registered send-as alias. */
  from: string;
  /** Absolute base for management links, e.g. https://book.example.com */
  baseUrl: string;
}

// tsconfig's lib is ES2022 (no DOM), so the WebCrypto key type is derived from
// the global rather than named — `CryptoKey` does not exist there.
type SigningKey = Awaited<ReturnType<typeof crypto.subtle.importKey>>;

const TOKEN_URL = 'https://oauth2.googleapis.com/token';
const SEND_URL = 'https://gmail.googleapis.com/gmail/v1/users/me/messages/send';
const SCOPE = 'https://www.googleapis.com/auth/gmail.send';

const b64 = (bytes: Uint8Array): string => {
  let s = '';
  for (const c of bytes) s += String.fromCharCode(c);
  return btoa(s);
};
const b64url = (bytes: Uint8Array): string =>
  b64(bytes).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const utf8 = (s: string): Uint8Array => new TextEncoder().encode(s);

/** RFC 2047, only when needed — these subjects are normally plain ASCII. */
const encodeSubject = (s: string): string =>
  /^[\x20-\x7e]*$/.test(s) ? s : `=?utf-8?B?${b64(utf8(s))}?=`;

function pemToPkcs8(pem: string): ArrayBuffer {
  const body = pem.replace(/-----[A-Z ]+-----/g, '').replace(/\s+/g, '');
  const raw = atob(body);
  const bytes = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) bytes[i] = raw.charCodeAt(i);
  return bytes.buffer;
}

export class GmailMail implements MailPort {
  #key: SigningKey | undefined;
  #token: { value: string; expiresAt: number } | undefined;

  constructor(private readonly config: GmailConfig) {}

  #creds(): { client_email: string; private_key: string } {
    const parsed = JSON.parse(this.config.saKeyJson) as {
      client_email?: string;
      private_key?: string;
    };
    if (!parsed.client_email || !parsed.private_key) {
      throw new Error('GMAIL_SA_KEY is not a service-account key (client_email/private_key missing)');
    }
    return { client_email: parsed.client_email, private_key: parsed.private_key };
  }

  async #signingKey(): Promise<SigningKey> {
    if (this.#key) return this.#key;
    this.#key = await crypto.subtle.importKey(
      'pkcs8',
      pemToPkcs8(this.#creds().private_key),
      { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
      false,
      ['sign'],
    );
    return this.#key;
  }

  /** A short-lived access token, cached until a minute before it expires. */
  async #accessToken(): Promise<string> {
    const now = Math.floor(Date.now() / 1000);
    if (this.#token && this.#token.expiresAt - 60 > now) return this.#token.value;

    const claims = {
      iss: this.#creds().client_email,
      sub: this.config.impersonate,
      scope: SCOPE,
      aud: TOKEN_URL,
      iat: now,
      exp: now + 3600,
    };
    const unsigned =
      `${b64url(utf8(JSON.stringify({ alg: 'RS256', typ: 'JWT' })))}.` +
      `${b64url(utf8(JSON.stringify(claims)))}`;
    const signature = await crypto.subtle.sign(
      'RSASSA-PKCS1-v1_5',
      await this.#signingKey(),
      utf8(unsigned),
    );
    const jwt = `${unsigned}.${b64url(new Uint8Array(signature))}`;

    const res = await fetch(TOKEN_URL, {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
        assertion: jwt,
      }),
    });
    if (!res.ok) {
      throw new Error(`gmail token exchange failed: ${res.status} ${await res.text()}`);
    }
    const body = (await res.json()) as { access_token: string; expires_in: number };
    this.#token = { value: body.access_token, expiresAt: now + body.expires_in };
    return this.#token.value;
  }

  async send(message: MailMessage): Promise<void> {
    // `to: 'owner'` is a placeholder the caller resolves; refusing it here is
    // better than silently mailing a literal address of "owner".
    if (!message.to.includes('@')) {
      throw new Error(`refusing to send to a non-address: ${message.to}`);
    }
    const { subject, text } = renderMessage(message, this.config.baseUrl);

    // Body as base64 so the message is 7-bit clean whatever the text holds.
    const bodyB64 = b64(utf8(text)).replace(/(.{76})/g, '$1\r\n');
    const headers = [
      `From: ${this.config.from}`,
      `To: ${message.to}`,
      `Subject: ${encodeSubject(subject)}`,
      'MIME-Version: 1.0',
    ];
    let rfc822: string;
    if (message.ics) {
      // P3 · multipart/mixed: the text part plus an .ics the recipient's
      // calendar can import.
      const boundary = `=_pumasi_${Date.now().toString(36)}`;
      const icsB64 = b64(utf8(message.ics)).replace(/(.{76})/g, '$1\r\n');
      rfc822 = [
        ...headers,
        `Content-Type: multipart/mixed; boundary="${boundary}"`,
        '',
        `--${boundary}`,
        'Content-Type: text/plain; charset=utf-8',
        'Content-Transfer-Encoding: base64',
        '',
        bodyB64,
        `--${boundary}`,
        'Content-Type: text/calendar; charset=utf-8; method=PUBLISH',
        'Content-Transfer-Encoding: base64',
        'Content-Disposition: attachment; filename="invite.ics"',
        '',
        icsB64,
        `--${boundary}--`,
      ].join('\r\n');
    } else {
      rfc822 = [
        ...headers,
        'Content-Type: text/plain; charset=utf-8',
        'Content-Transfer-Encoding: base64',
        '',
        bodyB64,
      ].join('\r\n');
    }

    const res = await fetch(SEND_URL, {
      method: 'POST',
      headers: {
        authorization: `Bearer ${await this.#accessToken()}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify({ raw: b64url(utf8(rfc822)) }),
    });
    if (!res.ok) {
      // The body names the failure; the address stays out of it (D4).
      throw new Error(`gmail send failed: ${res.status} ${await res.text()}`);
    }
    const info = (await res.json()) as { id?: string };

    // Say what was actually accepted, by whom (D4: redacted, traceable).
    console.log(`[mail] sent ${message.kind} to ${redactAddress(message.to)} (${info.id ?? 'no id'})`);
  }
}
