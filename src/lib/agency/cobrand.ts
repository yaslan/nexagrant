/**
 * FB KAMU B4 (TASK-MULRRNIHVZM1Z) — co-branding, option A of
 * docs/kamu/OKA-KANAL-ONERISI.md §3: the organisations an agency brought in see
 * the agency's logo and "<agency> iş birliğiyle" in their app shell. The
 * product's own logo stays where it is; this adds, never replaces.
 *
 * Where: `Tenant.settings.cobrand` of the AGENCY tenant (an existing JSON
 * column; no schema change). It holds the agency's own data only — the object
 * key of the logo and a short name. Nothing about the linked organisations is
 * written here or sent to the agency.
 *
 * The upload rules live here, server-free, so they are unit tested on bytes:
 *   • PNG only. SVG is refused outright (it is a document that can carry
 *     script); so is everything else. The type is read from the bytes — the
 *     browser's file name and MIME type are never consulted.
 *   • ≤ {@link COBRAND_MAX_BYTES} bytes, ≤ {@link COBRAND_MAX_SIDE} px a side.
 *   • The file is walked chunk by chunk (length, type, CRC) up to an IEND that
 *     must be the last byte; anything after it (a PNG/HTML or PNG/ZIP polyglot)
 *     is refused. IHDR must be the first chunk and appear only there (a second
 *     one would carry a size the 1024 px check never saw), and the IDAT chunks
 *     must be one unbroken run, as the PNG spec requires. Only image-bearing
 *     chunks are copied into the stored file, so text, EXIF and other metadata
 *     chunks never reach storage.
 */
import { crc32 } from 'node:zlib';

export const COBRAND_KEY = 'cobrand';
export const COBRAND_MAX_BYTES = 200 * 1024;
export const COBRAND_MAX_SIDE = 1024;
export const COBRAND_NAME_MAX = 40;

export interface CoBrandSettings {
  /** Storage object key of the sanitised PNG; null = no logo. */
  logoKey: string | null;
  /** Short agency name for the "<name> iş birliğiyle" line. */
  name: string;
  /** ISO timestamp; also the logo URL's cache-buster. */
  updatedAt: string;
}

export type LogoRejection = 'tooLarge' | 'notPng' | 'badPng' | 'tooWide';

const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

/**
 * Chunks copied into the stored file. Everything else — tEXt/zTXt/iTXt, eXIf,
 * tIME, iCCP, animation chunks, private chunks — is dropped. Dropping acTL/fcTL/
 * fdAT leaves an animated PNG's default image, a valid still PNG.
 */
const KEPT_CHUNKS = new Set(['IHDR', 'PLTE', 'tRNS', 'gAMA', 'cHRM', 'sRGB', 'pHYs', 'IDAT', 'IEND']);

/**
 * Checks `bytes` against the upload rules and returns the sanitised PNG to
 * store, or why it was refused.
 */
export function sanitizeLogoPng(
  bytes: Uint8Array,
): { ok: true; png: Buffer; width: number; height: number } | { ok: false; error: LogoRejection } {
  if (bytes.byteLength > COBRAND_MAX_BYTES) return { ok: false, error: 'tooLarge' };
  const buf = Buffer.from(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (buf.length < PNG_SIGNATURE.length || !buf.subarray(0, 8).equals(PNG_SIGNATURE)) {
    return { ok: false, error: 'notPng' };
  }

  const kept: Buffer[] = [PNG_SIGNATURE];
  let width = 0;
  let height = 0;
  let sawIdat = false;
  let idatEnded = false;
  let pos = 8;
  let first = true;
  for (;;) {
    if (pos + 12 > buf.length) return { ok: false, error: 'badPng' };
    const length = buf.readUInt32BE(pos);
    const type = buf.toString('latin1', pos + 4, pos + 8);
    const end = pos + 12 + length;
    if (!/^[A-Za-z]{4}$/.test(type) || end > buf.length) return { ok: false, error: 'badPng' };
    const crc = buf.readUInt32BE(end - 4);
    if ((crc32(buf.subarray(pos + 4, end - 4)) >>> 0) !== crc) return { ok: false, error: 'badPng' };

    if (first) {
      if (type !== 'IHDR' || length !== 13) return { ok: false, error: 'badPng' };
      width = buf.readUInt32BE(pos + 8);
      height = buf.readUInt32BE(pos + 12);
      if (width === 0 || height === 0) return { ok: false, error: 'badPng' };
      if (width > COBRAND_MAX_SIDE || height > COBRAND_MAX_SIDE) return { ok: false, error: 'tooWide' };
      first = false;
    } else if (type === 'IHDR') {
      return { ok: false, error: 'badPng' };
    }
    if (type === 'IDAT') {
      if (idatEnded) return { ok: false, error: 'badPng' };
      sawIdat = true;
    } else if (sawIdat) {
      idatEnded = true;
    }
    if (KEPT_CHUNKS.has(type)) kept.push(buf.subarray(pos, end));
    pos = end;
    if (type === 'IEND') break;
  }
  // IEND must be the last byte: trailing data is how a PNG doubles as another file.
  if (pos !== buf.length || !sawIdat) return { ok: false, error: 'badPng' };
  return { ok: true, png: Buffer.concat(kept), width, height };
}

/**
 * The short name as stored: control characters and angle brackets removed,
 * whitespace collapsed, cut to {@link COBRAND_NAME_MAX}. React escapes it on
 * output anyway; this keeps the stored value plain text.
 */
export function normalizeCoBrandName(raw: unknown): string {
  if (typeof raw !== 'string') return '';
  return raw
    .replace(/[\u0000-\u001f\u007f<>]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, COBRAND_NAME_MAX)
    .trim();
}

/** Object keys this feature writes; anything else read back from settings is ignored. */
const LOGO_KEY_PATTERN = /^[A-Za-z0-9_-]+\/agency\/cobrand\/[a-f0-9-]{36}\.png$/;

export function isCoBrandLogoKey(key: unknown): key is string {
  return typeof key === 'string' && LOGO_KEY_PATTERN.test(key);
}

/** `Tenant.settings` in, the co-brand entry out; null when none is stored or it does not decode. */
export function readCoBrand(settings: unknown): CoBrandSettings | null {
  if (!settings || typeof settings !== 'object' || Array.isArray(settings)) return null;
  const entry = (settings as Record<string, unknown>)[COBRAND_KEY];
  if (!entry || typeof entry !== 'object') return null;
  const { logoKey, name, updatedAt } = entry as Record<string, unknown>;
  const cleanName = normalizeCoBrandName(name);
  const key = isCoBrandLogoKey(logoKey) ? logoKey : null;
  if (!key && !cleanName) return null;
  return { logoKey: key, name: cleanName, updatedAt: typeof updatedAt === 'string' ? updatedAt : '' };
}
