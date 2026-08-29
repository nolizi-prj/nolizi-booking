/**
 * An owner's logo.
 *
 * The image arrives as a data URL the browser produced by drawing the chosen
 * file onto a canvas and re-encoding it. That re-encode is a convenience for
 * the owner, NOT a security control: whatever the page does, the request is
 * just a form post and anything at all can be in that field. So everything
 * that matters is checked here, on what actually arrived.
 *
 * What is checked, and why each one:
 *   * the media type is one of three raster formats — an SVG logo would be a
 *     script-execution vector rendered from our own origin, which is why the
 *     list is closed rather than "anything image/*";
 *   * the base64 decodes, and the decoded bytes BEGIN with the signature of
 *     the type claimed — a PNG header on a declared JPEG means the label is
 *     not describing the content, and the label is what a browser sniffs
 *     against;
 *   * the decoded size is capped, because this string is inlined into every
 *     page render.
 */

/** Decoded bytes an owner's logo may occupy. */
export const MAX_LOGO_BYTES = 32 * 1024;

const SIGNATURES: Record<string, number[][]> = {
  'image/png': [[0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]],
  'image/jpeg': [[0xff, 0xd8, 0xff]],
  // RIFF....WEBP — the four bytes between are the length, so the check is
  // split either side of them.
  'image/webp': [[0x52, 0x49, 0x46, 0x46]],
};

export interface LogoRejected { ok: false; reason: string }
export interface LogoAccepted { ok: true; dataUrl: string; bytes: number; mime: string }

/**
 * Validate a submitted data URL. Returns the value to store, or the reason to
 * show the owner — reasons here are for the person who chose the file, so they
 * say what to do about it.
 */
export function validateLogo(raw: string): LogoAccepted | LogoRejected {
  const value = raw.trim();
  const m = /^data:([a-z/+-]+);base64,([A-Za-z0-9+/=]+)$/.exec(value);
  if (!m) return { ok: false, reason: 'That did not arrive as an image. Try choosing the file again.' };

  const mime = m[1]!;
  const signatures = SIGNATURES[mime];
  if (!signatures) {
    return { ok: false, reason: 'Use a PNG, JPEG or WebP image.' };
  }

  let bytes: Uint8Array;
  try {
    const binary = atob(m[2]!);
    bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  } catch {
    return { ok: false, reason: 'That image could not be read. Try choosing the file again.' };
  }

  if (bytes.length === 0) {
    return { ok: false, reason: 'That file is empty.' };
  }
  if (bytes.length > MAX_LOGO_BYTES) {
    return {
      ok: false,
      reason: `That image is ${Math.round(bytes.length / 1024)} KB. The limit is ${MAX_LOGO_BYTES / 1024} KB — try a smaller one.`,
    };
  }
  const matches = signatures.some((sig) =>
    sig.every((b, i) => bytes[i] === b));
  if (!matches) {
    return { ok: false, reason: 'That file is not the kind of image it claims to be.' };
  }
  // WebP carries its real marker after the 4-byte length; checking it stops a
  // bare RIFF container (an AVI, say) passing as an image.
  if (mime === 'image/webp') {
    const webp = [0x57, 0x45, 0x42, 0x50];
    if (!webp.every((b, i) => bytes[8 + i] === b)) {
      return { ok: false, reason: 'That file is not the kind of image it claims to be.' };
    }
  }

  return { ok: true, dataUrl: value, bytes: bytes.length, mime };
}
