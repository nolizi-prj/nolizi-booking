/**
 * SPEC-0006 — the OAuth state: authenticated, opaque, and nobody's provider.
 *
 * The value that travels out to a provider and comes back is what says WHOSE
 * connection is arriving. Whoever can write one can name any owner, so it is
 * sealed (seal.ts) under the deployment's TOKEN_KEY — the same key that seals
 * stored credentials — and there is no unsealed form of it anywhere.
 *
 * It lives in its own file because it is not a calendar concern: it uses no
 * provider, touches no row, and makes no request. Hanging it off CalendarHub
 * cost a deployment that configures Zoom and no Google Calendar both halves of
 * a working flow at once — the callback answered "Calendar integration is not
 * configured" before it ever read the state's purpose, and the authorize step
 * quietly built the state as plain base64url instead (SPEC-0006 §0).
 *
 * CalendarHub.sealState/openState delegate here rather than restating this;
 * two copies of a security-relevant wire format is L-007, and one copy in the
 * wrong place is what this spec exists to fix.
 */

import { importSealKey, open, seal, type SealKey } from './seal.ts';

/**
 * How long a state is good for. Long enough for a consent screen and a
 * password manager, short enough that one left in a browser history is not a
 * standing right to attach a connection.
 */
const STATE_TTL_MS = 15 * 60_000;

export class OAuthState {
  #key: SealKey | undefined;

  /** `tokenKey` is the base64 of the 32-byte TOKEN_KEY secret (seal.ts). */
  constructor(private readonly tokenKey: string) {}

  async #sealKey(): Promise<SealKey> {
    if (!this.#key) this.#key = await importSealKey(this.tokenKey);
    return this.#key;
  }

  /** Opaque, authenticated OAuth state: survives the round trip, nothing else. */
  async seal(payload: Record<string, string>): Promise<string> {
    return (await seal(await this.#sealKey(), JSON.stringify({ ...payload, exp: Date.now() + STATE_TTL_MS })))
      .replace(/\+/g, '-')
      .replace(/\//g, '_');
  }

  /** Undefined on tamper, wrong key, malformed payload, or expiry — never a partial value. */
  async open(state: string): Promise<Record<string, string> | undefined> {
    const raw = await open(await this.#sealKey(), state.replace(/-/g, '+').replace(/_/g, '/'));
    if (!raw) return undefined;
    let parsed: Record<string, string> & { exp?: number };
    try {
      parsed = JSON.parse(raw) as Record<string, string> & { exp?: number };
    } catch {
      return undefined;
    }
    if (typeof parsed.exp !== 'number' || parsed.exp < Date.now()) return undefined;
    return parsed;
  }
}
