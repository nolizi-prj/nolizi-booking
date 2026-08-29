/**
 * P8 — generic OIDC sign-in for customer identity providers (Okta, Entra,
 * Google Workspace, Keycloak…), implemented from the standard: discovery,
 * authorization-code flow with client secret, email from the id_token.
 *
 * The id_token is decoded, not locally verified: it arrives directly from the
 * IdP's token endpoint over TLS in exchange for our client secret, which is
 * the same trust base the Google sign-in uses. SAML is deliberately absent —
 * XML signature verification is not something to hand-roll (recorded as debt).
 */

export interface OidcEndpoints {
  authorization_endpoint: string;
  token_endpoint: string;
}

export async function discoverOidc(issuer: string): Promise<OidcEndpoints> {
  const url = `${issuer.replace(/\/$/, '')}/.well-known/openid-configuration`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`oidc discovery failed: ${res.status}`);
  const doc = (await res.json()) as Partial<OidcEndpoints>;
  if (!doc.authorization_endpoint || !doc.token_endpoint) {
    throw new Error('oidc discovery: endpoints missing');
  }
  return { authorization_endpoint: doc.authorization_endpoint, token_endpoint: doc.token_endpoint };
}

export function oidcAuthUrl(opts: {
  authorizationEndpoint: string;
  clientId: string;
  redirectUri: string;
  state: string;
}): string {
  const p = new URLSearchParams({
    client_id: opts.clientId,
    redirect_uri: opts.redirectUri,
    response_type: 'code',
    scope: 'openid email',
    state: opts.state,
  });
  return `${opts.authorizationEndpoint}?${p}`;
}

export async function oidcExchange(opts: {
  tokenEndpoint: string;
  clientId: string;
  clientSecret: string;
  code: string;
  redirectUri: string;
}): Promise<{ email: string }> {
  const res = await fetch(opts.tokenEndpoint, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'authorization_code',
      code: opts.code,
      client_id: opts.clientId,
      client_secret: opts.clientSecret,
      redirect_uri: opts.redirectUri,
    }),
  });
  if (!res.ok) throw new Error(`oidc exchange failed: ${res.status}`);
  const t = (await res.json()) as { id_token?: string };
  if (!t.id_token) throw new Error('oidc exchange: no id_token');
  const payload = t.id_token.split('.')[1] ?? '';
  const claims = JSON.parse(
    atob(payload.replace(/-/g, '+').replace(/_/g, '/')),
  ) as { email?: string; preferred_username?: string };
  const email = claims.email ?? claims.preferred_username;
  if (!email || !email.includes('@')) throw new Error('oidc id_token carries no email');
  return { email };
}
