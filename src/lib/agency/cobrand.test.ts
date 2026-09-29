/**
 * FB KAMU B4 (TASK-MULRRNIHVZM1Z) — the upload rules, on bytes.
 */
import { describe, expect, it } from 'vitest';
import { crc32, deflateSync } from 'node:zlib';
import {
  COBRAND_MAX_BYTES,
  isCoBrandLogoKey,
  normalizeCoBrandName,
  readCoBrand,
  sanitizeLogoPng,
} from './cobrand';

function chunk(type: string, data: Buffer): Buffer {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, 'latin1'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body) >>> 0);
  return Buffer.concat([len, body, crc]);
}

/** A real, decodable w×h RGBA PNG, plus any extra chunks before IDAT. */
function png(w: number, h: number, extra: Buffer[] = []): Buffer {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0);
  ihdr.writeUInt32BE(h, 4);
  ihdr.set([8, 6, 0, 0, 0], 8);
  const raw = Buffer.alloc((w * 4 + 1) * h);
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    ...extra,
    chunk('IDAT', deflateSync(raw)),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

describe('sanitizeLogoPng', () => {
  it('accepts a PNG and returns it with its size', () => {
    const r = sanitizeLogoPng(png(120, 40));
    expect(r).toMatchObject({ ok: true, width: 120, height: 40 });
  });

  it('drops text and EXIF chunks, keeps the image', () => {
    const withMeta = png(10, 10, [
      chunk('tEXt', Buffer.from('Comment\0<script>alert(1)</script>', 'latin1')),
      chunk('eXIf', Buffer.from('MM\0*GPS', 'latin1')),
    ]);
    const r = sanitizeLogoPng(withMeta);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.png.equals(png(10, 10))).toBe(true);
    expect(r.png.toString('latin1')).not.toContain('script');
  });

  it('refuses SVG, whatever it is called', () => {
    const svg = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" onload="alert(1)"/>');
    expect(sanitizeLogoPng(svg)).toEqual({ ok: false, error: 'notPng' });
  });

  it('refuses JPEG and HTML (the type is read from the bytes)', () => {
    expect(sanitizeLogoPng(Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0, 0, 0, 0, 0, 0]))).toEqual({ ok: false, error: 'notPng' });
    expect(sanitizeLogoPng(Buffer.from('<!doctype html><script>1</script>'))).toEqual({ ok: false, error: 'notPng' });
  });

  it('refuses data after IEND (polyglot)', () => {
    const poly = Buffer.concat([png(4, 4), Buffer.from('<html><script>alert(1)</script>')]);
    expect(sanitizeLogoPng(poly)).toEqual({ ok: false, error: 'badPng' });
  });

  it('refuses a truncated file and a bad CRC', () => {
    const good = png(4, 4);
    expect(sanitizeLogoPng(good.subarray(0, good.length - 6))).toEqual({ ok: false, error: 'badPng' });
    const bad = Buffer.from(good);
    bad[bad.length - 20] ^= 0xff;
    expect(sanitizeLogoPng(bad)).toEqual({ ok: false, error: 'badPng' });
  });

  it('refuses an oversized file before parsing it', () => {
    const big = Buffer.concat([png(4, 4), Buffer.alloc(COBRAND_MAX_BYTES)]);
    expect(sanitizeLogoPng(big)).toEqual({ ok: false, error: 'tooLarge' });
  });

  it('refuses a side over 1024 px', () => {
    expect(sanitizeLogoPng(png(1025, 1))).toEqual({ ok: false, error: 'tooWide' });
    expect(sanitizeLogoPng(png(1024, 1)).ok).toBe(true);
  });
});

describe('co-brand settings', () => {
  it('normalises the short name to plain text', () => {
    expect(normalizeCoBrandName('  O<b>KA\n\t ')).toBe('O b KA');
    expect(normalizeCoBrandName('x'.repeat(100))).toHaveLength(40);
    expect(normalizeCoBrandName(42)).toBe('');
  });

  it('only accepts object keys this feature writes', () => {
    expect(isCoBrandLogoKey('t1/agency/cobrand/0f8fad5b-d9cb-469f-a165-70867728950e.png')).toBe(true);
    expect(isCoBrandLogoKey('../../etc/passwd')).toBe(false);
    expect(isCoBrandLogoKey('t1/other/0f8fad5b-d9cb-469f-a165-70867728950e.png')).toBe(false);
  });

  it('reads an entry back, and nothing from an empty or foreign one', () => {
    const key = 't1/agency/cobrand/0f8fad5b-d9cb-469f-a165-70867728950e.png';
    expect(readCoBrand({ cobrand: { logoKey: key, name: 'OKA', updatedAt: 'x' } })).toEqual({
      logoKey: key,
      name: 'OKA',
      updatedAt: 'x',
    });
    expect(readCoBrand({ cobrand: { logoKey: 'http://evil/x.svg', name: '' } })).toBeNull();
    expect(readCoBrand({})).toBeNull();
    expect(readCoBrand(null)).toBeNull();
  });
});
