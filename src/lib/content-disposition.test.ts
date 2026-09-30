import { describe, it, expect } from 'vitest';
import { attachmentContentDisposition } from './content-disposition';

/** What a client that reads `filename*` gets, decoded as RFC 5987 says. */
function decodedStar(header: string): string {
  const match = /; filename\*=UTF-8''([^;\s]+)$/.exec(header);
  if (!match) throw new Error(`no filename* in ${header}`);
  expect(match[1]).toMatch(/^[A-Za-z0-9!#$&+.^_`|~%-]+$/); // RFC 5987 attr-char / pct-encoded only
  return decodeURIComponent(match[1]!);
}
const asciiPart = (header: string) => /^attachment; filename="([^"]*)"/.exec(header)?.[1];

describe('attachmentContentDisposition (TASK-MUNDTW8O2IV6V, İNCELEME-53 B-3)', () => {
  const title = 'Çağrı: Kırsal İklim Öncüleri — şebeke/güneş “pilot” 🚀 👩‍💻';

  it('is a valid ByteString header: new Headers() accepts it (the old one threw at ı = 305)', () => {
    expect(() => new Headers({ 'Content-Disposition': `attachment; filename="${title}.docx"` })).toThrow(
      /ByteString/
    );
    const header = attachmentContentDisposition(title, '.docx', 'ConceptNote');
    expect(new Headers({ 'Content-Disposition': header }).get('Content-Disposition')).toBe(header);
    expect(header).toMatch(/^[\x20-\x7e]+$/);
  });

  it('filename* round-trips Turkish letters and emoji; only path separators and quotes change', () => {
    const header = attachmentContentDisposition(title, '.docx', 'ConceptNote');
    expect(decodedStar(header)).toBe('Çağrı_ Kırsal İklim Öncüleri — şebeke_güneş “pilot” 🚀 👩‍💻.docx');
  });

  it('the ASCII fallback transliterates Turkish letters and drops what ASCII cannot carry', () => {
    const header = attachmentContentDisposition(title, '.docx', 'ConceptNote');
    expect(asciiPart(header)).toBe('Cagri_ Kirsal Iklim Onculeri sebeke_gunes pilot.docx');
    expect(asciiPart(attachmentContentDisposition('çğıİöşüÇĞÖŞÜ', '.docx', 'X'))).toBe('cgiIosuCGOSU.docx');
  });

  it('plain ASCII titles keep today’s filename="…" unchanged', () => {
    expect(attachmentContentDisposition('Smart Grids for Rural Regions', '.docx', 'ConceptNote')).toBe(
      `attachment; filename="Smart Grids for Rural Regions.docx"; filename*=UTF-8''Smart%20Grids%20for%20Rural%20Regions.docx`
    );
  });

  it('no header or path injection: quotes, backslash, CR/LF, ; and path parts are neutralised', () => {
    const header = attachmentContentDisposition('a"; filename=evil.exe\r\nX-Injected: 1\\..\\..//etc', '.docx', 'N');
    expect(header).not.toMatch(/[\r\n]/);
    expect(asciiPart(header)).toBe('a_; filename=evil.exe__X-Injected_ 1_.._..__etc.docx');
    expect(decodedStar(header)).toBe('a_; filename=evil.exe__X-Injected_ 1_.._..__etc.docx');
    // RFC 5987: ' ( ) are not attr-chars and must be percent-encoded (* never gets here).
    expect(attachmentContentDisposition("it's (a)", '.docx', 'N')).toContain(
      "filename*=UTF-8''it%27s%20%28a%29.docx"
    );
  });

  it('bidi overrides are removed so the shown extension cannot be spoofed', () => {
    expect(decodedStar(attachmentContentDisposition('fatura‮xcod.exe', '.docx', 'N'))).toBe(
      'fatura_xcod.exe.docx'
    );
  });

  it('falls back when nothing printable is left, and never throws on a lone surrogate', () => {
    expect(attachmentContentDisposition('', '.docx', 'ConceptNote')).toBe(
      `attachment; filename="ConceptNote.docx"; filename*=UTF-8''ConceptNote.docx`
    );
    const emojiOnly = attachmentContentDisposition('🚀🚀', '.docx', 'ConceptNote');
    expect(asciiPart(emojiOnly)).toBe('ConceptNote.docx');
    expect(decodedStar(emojiOnly)).toBe('🚀🚀.docx');
    // Punctuation alone is not a name: the ASCII part falls back rather than ".!.docx" (İNCELEME-88 O-1 D14).
    const punctuation = attachmentContentDisposition('—.!', '.docx', 'ConceptNote');
    expect(asciiPart(punctuation)).toBe('ConceptNote.docx');
    expect(decodedStar(punctuation)).toBe('—.!.docx');
    expect(() => attachmentContentDisposition('kırık \uD83D başlık', '.docx', 'N')).not.toThrow();
    expect(decodedStar(attachmentContentDisposition('kırık \uD83D başlık', '.docx', 'N'))).toBe('kırık � başlık.docx');
  });

  it('caps the name at 120 code points without splitting an emoji', () => {
    const header = attachmentContentDisposition('ş'.repeat(119) + '🚀🚀🚀', '.docx', 'N');
    expect(decodedStar(header)).toBe('ş'.repeat(119) + '🚀.docx');
  });
});
