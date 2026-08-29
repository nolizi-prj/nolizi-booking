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
  if (!res.ok) throw new Error(`google sso exchange failed: ${res.status}`);
  const t = (await res.json()) as { id_token: string };
  const payload = t.id_token.split('.')[1] ?? '';
  const claims = JSON.parse(atob(payload.replace(/-/g, '+').replace(/_/g, '/'))) as {
    email?: string;
    email_verified?: boolean;
  };
  if (!claims.email) throw new Error('google sso: no email claim');
  return { email: claims.email, emailVerified: claims.email_verified === true };
}
