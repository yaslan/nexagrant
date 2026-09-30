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
