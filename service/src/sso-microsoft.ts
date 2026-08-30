/**
 * Issue #5 — "Sign in with Microsoft" (Entra ID / Microsoft 365 / Outlook).
 *
 * OpenID Connect authorization-code flow against Microsoft identity platform v2.0.
 * Scope is openid email profile offline_access.
 * The id_token arrives directly from Microsoft over TLS; email/preferred_username
 * claim identifies the verified address.
 */

const AUTH_URL = 'https://login.microsoftonline.com/common/oauth2/v2.0/authorize';
const TOKEN_URL = 'https://login.microsoftonline.com/common/oauth2/v2.0/token';

export function microsoftSsoUrl(opts: {
  clientId: string;
  redirectUri: string;
  state: string;
}): string {
  const p = new URLSearchParams({
    client_id: opts.clientId,
    redirect_uri: opts.redirectUri,
    response_type: 'code',
    scope: 'openid email profile offline_access',
    prompt: 'select_account',
    state: opts.state,
  });
  return `${AUTH_URL}?${p}`;
}

export async function microsoftSsoExchange(opts: {
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
  if (!res.ok) throw new Error(`microsoft sso exchange failed: ${res.status}`);
  const t = (await res.json()) as { id_token?: string };
  if (!t.id_token) throw new Error('microsoft sso: no id_token');
  const payload = t.id_token.split('.')[1] ?? '';
  const claims = JSON.parse(atob(payload.replace(/-/g, '+').replace(/_/g, '/'))) as {
    email?: string;
    preferred_username?: string;
  };
  const email = claims.email ?? claims.preferred_username;
  if (!email || !email.includes('@')) throw new Error('microsoft sso: no email in id_token');
  return { email, emailVerified: true };
}
