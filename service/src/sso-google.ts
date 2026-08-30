/**
 * P4 — "Sign in with Google", deliberately tiny.
 *
 * Scope is openid+email and nothing else: sign-in proves an address, it does
 * not read a calendar (that is SPEC-0003's separate, narrower grant). The
 * id_token arrives directly from Google over TLS; decoding without local
 * verification is sound for that hop and only that hop.
 */

const AUTH_URL = 'https://accounts.google.com/o/oauth2/v2/auth';
const TOKEN_URL = 'https://oauth2.googleapis.com/token';

export function googleSsoUrl(opts: {
  clientId: string;
  redirectUri: string;
  state: string;
}): string {
  const p = new URLSearchParams({
    client_id: opts.clientId,
    redirect_uri: opts.redirectUri,
    response_type: 'code',
    scope: 'openid email',
    prompt: 'select_account',
    state: opts.state,
  });
  return `${AUTH_URL}?${p}`;
}

function decodeBase64Url(str: string): string {
  let base64 = str.replace(/-/g, '+').replace(/_/g, '/');
  while (base64.length % 4 !== 0) {
    base64 += '=';
  }
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return new TextDecoder().decode(bytes);
}

export async function googleSsoExchange(opts: {
  clientId: string;
  clientSecret: string;
  code: string;
  redirectUri: string;
}): Promise<{ email: string; emailVerified: boolean }> {
  const res = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      code: opts.code,
      client_id: opts.clientId,
      client_secret: opts.clientSecret,
      redirect_uri: opts.redirectUri,
      grant_type: 'authorization_code',
    }),
  });
  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`google sso exchange failed (${res.status}): ${errText.slice(0, 300)}`);
  }
  const t = (await res.json()) as { id_token?: string };
  if (!t.id_token) throw new Error('google sso: no id_token in response');
  const parts = t.id_token.split('.');
  if (parts.length < 2 || !parts[1]) throw new Error('google sso: invalid id_token structure');

  const payloadJson = decodeBase64Url(parts[1]);
  const claims = JSON.parse(payloadJson) as {
    email?: string;
    email_verified?: boolean | string;
  };
  if (!claims.email) throw new Error('google sso: no email claim');
  const emailVerified = claims.email_verified === true || claims.email_verified === 'true';
  return { email: claims.email.trim().toLowerCase(), emailVerified };
}
