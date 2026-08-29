/**
 * SPEC-0003 — sealing for calendar credentials.
 *
 * A connection token is the most protected datum in the system (INTENT.md).
 * Rows holding one are sealed with AES-256-GCM under a key that lives only in
 * deployment secrets, so a copy of the database alone reveals no credential.
 * WebCrypto only: this file runs on Workers and Node alike.
 */

const b64 = (bytes: Uint8Array): string => {
  let s = '';
  for (const c of bytes) s += String.fromCharCode(c);
  return btoa(s);
};
const unb64 = (s: string): Uint8Array => {
  const raw = atob(s);
  const out = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out;
};

export type SealKey = Awaited<ReturnType<typeof crypto.subtle.importKey>>;

/** `raw` is the base64 of 32 random bytes (the TOKEN_KEY secret). */
export async function importSealKey(raw: string): Promise<SealKey> {
  const bytes = unb64(raw.trim());
  if (bytes.length !== 32) throw new Error('TOKEN_KEY must be 32 bytes, base64-encoded');
  return crypto.subtle.importKey('raw', bytes.buffer as ArrayBuffer, { name: 'AES-GCM' }, false, [
    'encrypt',
    'decrypt',
  ]);
}

export async function seal(key: SealKey, plaintext: string): Promise<string> {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ct = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv },
    key,
    new TextEncoder().encode(plaintext),
  );
  return `${b64(iv)}.${b64(new Uint8Array(ct))}`;
}

/** Returns undefined on any tamper or key mismatch — never a partial value. */
export async function open(key: SealKey, sealed: string): Promise<string | undefined> {
  const dot = sealed.indexOf('.');
  if (dot < 0) return undefined;
  try {
    const iv = unb64(sealed.slice(0, dot));
    const ct = unb64(sealed.slice(dot + 1));
    const pt = await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv: iv.buffer as ArrayBuffer },
      key,
      ct.buffer as ArrayBuffer,
    );
    return new TextDecoder().decode(pt);
  } catch {
    return undefined;
  }
}
