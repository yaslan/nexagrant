/**
 * `Content-Disposition: attachment` for a user-written file name (TASK-MUNDTW8O2IV6V,
 * İNCELEME-53 B-3).
 *
 * A header value is a ByteString: `new Headers()` throws on any code point above 0xFF, so an
 * opportunity titled "Kırsal şebeke" (ı = 305) made every DOCX export a 500. RFC 6266 §4.3 /
 * RFC 5987 carry the real name as `filename*=UTF-8''<percent-encoded>`, and an ASCII
 * `filename="…"` goes first for clients that ignore `filename*`.
 */

const TURKISH_ASCII: Record<string, string> = {
  ı: 'i', İ: 'I', ş: 's', Ş: 'S', ğ: 'g', Ğ: 'G', ç: 'c', Ç: 'C', ö: 'o', Ö: 'O', ü: 'u', Ü: 'U',
};
/**
 * Characters a user must not put into a saved file name: controls, bidi overrides (which can
 * make "fatura\u202Excod.exe" read as "faturaexe.docx"), path separators and quotes. The emoji
 * joiner U+200D stays, so "👩‍💻" keeps its shape.
 */
const UNSAFE_IN_NAME = /[\p{Cc}\u200E\u200F\u202A-\u202E\u2066-\u2069\\/:*?"<>|]/gu;
const MAX_NAME_CODE_POINTS = 120;

/** RFC 5987 `value-chars`: `encodeURIComponent` leaves `'()*` bare, which are not attr-chars. */
function encodeRfc5987(value: string): string {
  return encodeURIComponent(value).replace(
    /['()*]/g,
    (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`
  );
}

function asciiFallback(name: string): string {
  return name
    .replace(/[ıİşŞğĞçÇöÖüÜ]/g, (c) => TURKISH_ASCII[c] ?? c)
    .normalize('NFKD')
    .replace(/\p{M}/gu, '')
    .replace(/[^\x20-\x7e]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * `baseName` is user text (any Unicode, emoji included); `extension` is ours (".docx").
 * `fallbackBase` is used when nothing printable is left.
 */
export function attachmentContentDisposition(
  baseName: string,
  extension: string,
  fallbackBase: string
): string {
  const cleaned = Array.from(
    baseName.toWellFormed().replace(UNSAFE_IN_NAME, '_').replace(/\s+/g, ' ').trim()
  )
    .slice(0, MAX_NAME_CODE_POINTS)
    .join('')
    .trim();
  const unicodeName = (cleaned || fallbackBase) + extension;
  const asciiBase = asciiFallback(cleaned);
  const asciiName = (/[A-Za-z0-9]/.test(asciiBase) ? asciiBase : fallbackBase) + extension;
  return `attachment; filename="${asciiName}"; filename*=UTF-8''${encodeRfc5987(unicodeName)}`;
}
