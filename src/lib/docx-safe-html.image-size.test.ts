import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import HTMLtoDOCX from 'html-to-docx';
import { safeInlineImageSrc } from './docx-safe-html';

/**
 * TASK-MUNDTW8O2IV6V (İNCELEME-53 B-2): whatever `safeInlineImageSrc` keeps must be sizeable
 * by the image-size copy BUNDLED in html-to-docx — otherwise the export throws and answers 500.
 * The bundle does not export that parser, so the check is against the real library: every
 * prefix of three real images, plus seeded byte flips, goes through the sanitizer, and each
 * kept one through HTMLtoDOCX. "Kept" counts are asserted too, so the pass is not vacuous.
 */

const fixture = (name: string) => readFileSync(join(process.cwd(), 'tests/fixtures/docx-images', name));
const IMAGES: Record<string, Buffer> = {
  png: Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
    'base64'
  ),
  gif: fixture('12x8.gif'),
  jpeg: fixture('exif-12x8.jpg'),
};

/** Small deterministic PRNG (mulberry32) — same variants on every run. */
function rng(seed: number) {
  return () => {
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function variants(image: Buffer): Buffer[] {
  const out: Buffer[] = [];
  // Every prefix inside the header region, where the parsers read.
  for (let n = 1; n <= Math.min(image.length, 260); n++) out.push(image.subarray(0, n));
  const random = rng(image.length);
  for (let k = 0; k < 150; k++) {
    const copy = Buffer.from(image);
    const flips = 1 + Math.floor(random() * 3);
    for (let f = 0; f < flips; f++) {
      copy[4 + Math.floor(random() * Math.min(copy.length - 4, 200))] = Math.floor(random() * 256);
    }
    out.push(copy);
  }
  return out;
}

describe('kept images always survive the real html-to-docx (TASK-MUNDTW8O2IV6V B-2)', () => {
  it.each(Object.keys(IMAGES))('%s: truncations and byte flips', async (type) => {
    let kept = 0;
    let dropped = 0;
    const failures: string[] = [];
    for (const bytes of variants(IMAGES[type]!)) {
      const src = safeInlineImageSrc(`data:image/${type};base64,${bytes.toString('base64')}`, {
        remaining: Number.MAX_SAFE_INTEGER,
      });
      if (!src) {
        dropped++;
        continue;
      }
      kept++;
      try {
        await HTMLtoDOCX(`<p>x</p><img src="${src}" />`, null, {});
      } catch (error) {
        failures.push(`${bytes.length}B ${bytes.subarray(0, 24).toString('hex')}: ${String(error)}`);
      }
    }
    expect(failures).toEqual([]);
    expect(kept).toBeGreaterThan(20);
    expect(dropped).toBeGreaterThan(5);
  }, 60_000);
});

describe('the Exif orientation entry: kept exactly when the bundled image-size can read it (İNCELEME-88 O-1 D19)', () => {
  /**
   * A JPEG whose first segment is a big-endian Exif block with one IFD entry — the orientation
   * tag (274), type SHORT, count 1 — cut to `entryLen` of its 12 bytes. image-size reads the
   * value at 8..9 of the entry: at 8 or 9 bytes it throws, at 10 it does not. The byte where
   * the sanitizer starts keeping must be the byte where the library stops throwing, or a kept
   * image turns the export into the image-less retry (or, without it, a 500).
   */
  const withOrientationEntry = (entryLen: number) => {
    const entry = Buffer.from([0x01, 0x12, 0x00, 0x03, 0, 0, 0, 1, 0, 6, 0, 0]).subarray(0, entryLen);
    const tiff = Buffer.concat([Buffer.from('MM\0\x2a\0\0\0\x08', 'latin1'), Buffer.from([0, 1]), entry]);
    const payload = Buffer.concat([Buffer.from('Exif\0\0', 'latin1'), tiff]);
    const segment = Buffer.concat([Buffer.from([0xff, 0xe1, (payload.length + 2) >> 8, (payload.length + 2) & 0xff]), payload]);
    return Buffer.concat([IMAGES.jpeg!.subarray(0, 2), segment, IMAGES.jpeg!.subarray(2)]);
  };

  it.each([2, 4, 6, 8, 9, 10, 11, 12])('entry cut at %i bytes (big-endian, count=1)', async (entryLen) => {
    const bytes = withOrientationEntry(entryLen);
    const kept = safeInlineImageSrc(`data:image/jpeg;base64,${bytes.toString('base64')}`, { remaining: Number.MAX_SAFE_INTEGER }) !== null;
    const libraryReads = await HTMLtoDOCX(`<img src="data:image/jpeg;base64,${bytes.toString('base64')}" />`, null, {}).then(
      () => true,
      () => false
    );
    expect({ kept }).toEqual({ kept: libraryReads });
    // Pinned both ways, so neither side can drift and still agree by accident.
    expect(kept).toBe(entryLen >= 10);
  });

  const withOrientationEntryLe = (entryLen: number) => {
    const entry = Buffer.from([0x12, 0x01, 0x03, 0x00, 0x01, 0x00, 0x00, 0x00, 0x06, 0x00, 0x00, 0x00]).subarray(0, entryLen);
    const ifdCount = Buffer.from([0x01, 0x00]); // 1 entry, little-endian
    const tiff = Buffer.concat([Buffer.from('II\x2a\0\x08\0\0\0', 'latin1'), ifdCount, entry]);
    const payload = Buffer.concat([Buffer.from('Exif\0\0', 'latin1'), tiff]);
    const segment = Buffer.concat([Buffer.from([0xff, 0xe1, (payload.length + 2) >> 8, (payload.length + 2) & 0xff]), payload]);
    return Buffer.concat([IMAGES.jpeg!.subarray(0, 2), segment, IMAGES.jpeg!.subarray(2)]);
  };

  it.each([6, 7, 8, 10, 11, 12])('entry cut at %i bytes (little-endian, count=1, Ö-4)', async (entryLen) => {
    const bytes = withOrientationEntryLe(entryLen);
    const kept = safeInlineImageSrc(`data:image/jpeg;base64,${bytes.toString('base64')}`, { remaining: Number.MAX_SAFE_INTEGER }) !== null;
    const libraryReads = await HTMLtoDOCX(`<img src="data:image/jpeg;base64,${bytes.toString('base64')}" />`, null, {}).then(
      () => true,
      () => false
    );
    expect({ kept }).toEqual({ kept: libraryReads });
    expect(kept).toBe(entryLen >= 10);
  });

  const withOrientationEntryCountNe1 = (count: number) => {
    const countBytes = Buffer.alloc(4);
    countBytes.writeUInt32BE(count);
    const entry = Buffer.concat([Buffer.from([0x01, 0x12, 0x00, 0x03]), countBytes, Buffer.from([0, 6, 0, 0])]);
    const tiff = Buffer.concat([Buffer.from('MM\0\x2a\0\0\0\x08', 'latin1'), Buffer.from([0, 1]), entry]);
    const payload = Buffer.concat([Buffer.from('Exif\0\0', 'latin1'), tiff]);
    const segment = Buffer.concat([Buffer.from([0xff, 0xe1, (payload.length + 2) >> 8, (payload.length + 2) & 0xff]), payload]);
    return Buffer.concat([IMAGES.jpeg!.subarray(0, 2), segment, IMAGES.jpeg!.subarray(2)]);
  };

  // İNCELEME-113: with the whole 12-byte entry, `count ≠ 1 → keep` and `→ entry.length >= 10` agree,
  // so the count check was unpinned. Cut the entry after the count (8, 9 bytes): the library does not
  // read a value it does not use, so the image must be kept, and only the count check keeps it.
  const withShortEntryCount = (bigEndian: boolean, count: number, entryLen: number) => {
    const entry = Buffer.alloc(12);
    if (bigEndian) {
      entry.writeUInt16BE(274, 0);
      entry.writeUInt16BE(3, 2);
      entry.writeUInt32BE(count, 4);
      entry.writeUInt16BE(6, 8);
    } else {
      entry.writeUInt16LE(274, 0);
      entry.writeUInt16LE(3, 2);
      entry.writeUInt32LE(count, 4);
      entry.writeUInt16LE(6, 8);
    }
    const header = bigEndian ? Buffer.from('MM\0\x2a\0\0\0\x08\0\x01', 'latin1') : Buffer.from('II\x2a\0\x08\0\0\0\x01\0', 'latin1');
    const payload = Buffer.concat([Buffer.from('Exif\0\0', 'latin1'), header, entry.subarray(0, entryLen)]);
    const segment = Buffer.concat([Buffer.from([0xff, 0xe1, (payload.length + 2) >> 8, (payload.length + 2) & 0xff]), payload]);
    return Buffer.concat([IMAGES.jpeg!.subarray(0, 2), segment, IMAGES.jpeg!.subarray(2)]);
  };

  it.each([
    [true, 0, 8], [true, 2, 8], [true, 2, 9],
    [false, 0, 8], [false, 2, 8], [false, 2, 9],
  ])('bigEndian=%s, count=%i, entry cut at %i bytes: kept, as the library reads it (İNCELEME-113)', async (bigEndian, count, entryLen) => {
    const bytes = withShortEntryCount(bigEndian, count, entryLen);
    const kept = safeInlineImageSrc(`data:image/jpeg;base64,${bytes.toString('base64')}`, { remaining: Number.MAX_SAFE_INTEGER }) !== null;
    const libraryReads = await HTMLtoDOCX(`<img src="data:image/jpeg;base64,${bytes.toString('base64')}" />`, null, {}).then(
      () => true,
      () => false
    );
    expect({ kept }).toEqual({ kept: libraryReads });
    expect(kept).toBe(true);
  });

  it.each([2, 3, 5])('count ≠ 1: count=%i (Ö-4)', async (count) => {
    const bytes = withOrientationEntryCountNe1(count);
    const kept = safeInlineImageSrc(`data:image/jpeg;base64,${bytes.toString('base64')}`, { remaining: Number.MAX_SAFE_INTEGER }) !== null;
    const libraryReads = await HTMLtoDOCX(`<img src="data:image/jpeg;base64,${bytes.toString('base64')}" />`, null, {}).then(
      () => true,
      () => false
    );
    expect({ kept }).toEqual({ kept: libraryReads });
  });
});
