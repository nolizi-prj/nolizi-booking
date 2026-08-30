/**
 * Issue #5 — "Sign in with Microsoft" (Entra ID / Microsoft 365 / Outlook).
 *
 * OpenID Connect authorization-code flow against Microsoft identity platform v2.0.
 * Scope is openid email profile offline_access.
 * The id_token arrives directly from Microsoft over TLS; email/preferred_username/upn
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
  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`microsoft sso exchange failed (${res.status}): ${errText.slice(0, 300)}`);
  }
  const t = (await res.json()) as { id_token?: string };
  if (!t.id_token) throw new Error('microsoft sso: no id_token in response');
  const parts = t.id_token.split('.');
  if (parts.length < 2 || !parts[1]) throw new Error('microsoft sso: invalid id_token structure');

  const payloadJson = decodeBase64Url(parts[1]);
  const claims = JSON.parse(payloadJson) as {
    email?: string;
    preferred_username?: string;
    upn?: string;
    unique_name?: string;
  };
  const email = (claims.email ?? claims.preferred_username ?? claims.upn ?? claims.unique_name)?.trim().toLowerCase();
  if (!email || !email.includes('@')) {
    throw new Error(`microsoft sso: no valid email in claims: ${JSON.stringify(claims)}`);
  }
  return { email, emailVerified: true };
}
