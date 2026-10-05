import { readFileSync } from 'node:fs';
import HTMLtoDOCX from './wt88/node_modules/html-to-docx';
import { safeInlineImageSrc, MAX_IMAGE_BYTES } from './wt88/src/lib/docx-safe-html';
const S = __dirname;
const seeds: Record<string, Buffer> = {
  gif12: readFileSync(`${S}/wt88/tests/fixtures/docx-images/12x8.gif`),
  exifBE: readFileSync(`${S}/wt88/tests/fixtures/docx-images/exif-12x8.jpg`),
  exifLE: readFileSync(`${S}/le-exif.jpg`), prog: readFileSync(`${S}/prog.jpg`),
  png: readFileSync(`${S}/a.png`), ipng: readFileSync(`${S}/interlaced.png`), pgif: readFileSync(`${S}/p.gif`),
  bigjpg: readFileSync(`${S}/big.jpg`), bigpng: readFileSync(`${S}/big.png`),
};
let seed = 0x88;
const rnd = () => ((seed = (seed * 1103515245 + 12345) >>> 0) / 2 ** 32);
const opts = { table: { row: { cantSplit: true } }, footer: true, pageNumber: true };
let kept = 0, dropped = 0, threw = 0, slow = 0; const fails: string[] = [];
async function probe(label: string, bytes: Buffer, mime = 'image/png') {
  const src = safeInlineImageSrc(`data:${mime};base64,${bytes.toString('base64')}`, { remaining: 8 * 1024 * 1024 });
  if (!src) { dropped++; return; }
  kept++;
  const t = Date.now();
  try { await HTMLtoDOCX(`<p>x</p><img src="${src}" />`, null, opts); }
  catch (e) { threw++; if (fails.length < 15) fails.push(`${label}: ${(e as Error).message}`); }
  const ms = Date.now() - t; if (ms > 3000) { slow++; fails.push(`${label}: SLOW ${ms}ms`); }
}
(async () => {
  for (const [name, buf] of Object.entries(seeds)) {
    for (let n = 1; n <= Math.min(buf.length, 700); n++) await probe(`${name} prefix ${n}`, buf.subarray(0, n));
    for (let k = 0; k < 400; k++) {
      const b = Buffer.from(buf); const flips = 1 + Math.floor(rnd() * 6);
      for (let j = 0; j < flips; j++) {
        const pos = rnd() < 0.7 ? Math.floor(rnd() * Math.min(b.length, 120)) : Math.floor(rnd() * b.length);
        b[pos] = rnd() < 0.3 ? [0x00, 0xff, 0xc0, 0xe1, 0x01][Math.floor(rnd() * 5)] : Math.floor(rnd() * 256);
      }
      await probe(`${name} mut ${k}`, b);
    }
  }
  // targeted: zero / huge dimensions
  const png0 = Buffer.from(seeds.png); png0.writeUInt32BE(0, 16); png0.writeUInt32BE(0, 20); await probe('png 0x0', png0);
  const pngH = Buffer.from(seeds.png); pngH.writeUInt32BE(0x7fffffff, 16); pngH.writeUInt32BE(0x7fffffff, 20); await probe('png 2^31x2^31', pngH);
  const gif0 = Buffer.from(seeds.gif12); gif0.writeUInt16LE(0, 6); gif0.writeUInt16LE(0, 8); await probe('gif 0x0', gif0);
  const gifH = Buffer.from(seeds.gif12); gifH.writeUInt16LE(65535, 6); gifH.writeUInt16LE(65535, 8); await probe('gif 65535^2', gifH);
  // oversize: exactly limit and one over
  const big = Buffer.alloc(MAX_IMAGE_BYTES); seeds.png.copy(big); await probe('png padded to 2MiB', big);
  const big1 = Buffer.alloc(MAX_IMAGE_BYTES + 1); seeds.png.copy(big1); await probe('png 2MiB+1', big1);
  // fake extension / SVG
  await probe('svg as png', Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"><image href="http://127.0.0.1:9/x"/></svg>'));
  await probe('jpeg bytes labelled gif', seeds.exifBE, 'image/gif');
  await probe('webp bytes', Buffer.from('RIFF\x24\x00\x00\x00WEBPVP8 ', 'latin1'));
  await probe('heif bytes', Buffer.from('\x00\x00\x00\x18ftypheic\x00\x00\x00\x00', 'latin1'));
  console.log(JSON.stringify({ kept, dropped, threw, slow }));
  for (const f of fails) console.log(' ', f);
})();
