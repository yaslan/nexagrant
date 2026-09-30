import { readFileSync } from 'node:fs';
import HTMLtoDOCX from './wt88/node_modules/html-to-docx';
import { safeInlineImageSrc } from './wt88/src/lib/docx-safe-html';
const base = readFileSync(`${__dirname}/prog.jpg`); // SOI + JFIF + ... + SOF
(async () => { for (const entryLen of [8, 9, 10, 12]) {
  const tiff = Buffer.concat([Buffer.from('MM\0\x2a\0\0\0\x08', 'latin1'), Buffer.from([0, 1]),
    Buffer.from([0x01, 0x12, 0x00, 0x03, 0, 0, 0, 1, 0, 6, 0, 0]).subarray(0, entryLen)]);
  const payload = Buffer.concat([Buffer.from('Exif\0\0', 'latin1'), tiff]);
  const seg = Buffer.concat([Buffer.from([0xff, 0xe1]), Buffer.from([(payload.length + 2) >> 8, (payload.length + 2) & 255]), payload]);
  const jpg = Buffer.concat([base.subarray(0, 2), seg, base.subarray(2)]);
  const b64 = jpg.toString('base64');
  const kept = safeInlineImageSrc(`data:image/jpeg;base64,${b64}`, { remaining: 1e7 }) !== null;
  let lib = 'ok';
  try { await HTMLtoDOCX(`<img src="data:image/jpeg;base64,${b64}" />`, null, {}); } catch (e) { lib = 'THROWS ' + (e as Error).message; }
  console.log(`entryLen=${entryLen} sanitizer=${kept ? 'KEPT' : 'DROPPED'} real-lib=${lib}`);
} })();
