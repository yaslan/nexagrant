import { deflateRawSync, deflateSync } from 'node:zlib';

/**
 * A real, parseable PDF built in memory — for tests that must run the actual
 * pdf-parse rather than a mock of it (TASK-MULQL8QB679LQ, İNCELEME-45 B-2: a
 * mocked `getText` hid that pdf-parse appends `-- N of M --` to every page, so
 * a PDF with no text layer never reached `no_text`).
 *
 * Every page shares one content stream, so `pageCount` scales the page count
 * at ~150 bytes per extra page — the shape İNCELEME-45 B-1 used to show that a
 * small file can hold tens of thousands of pages. `lines: []` gives pages with
 * no text at all, which is what a scanned (image-only) PDF extracts to.
 */
export function syntheticPdf(lines: string[], pageCount = 1): Buffer {
  const esc = (s: string) => s.replace(/[\\()]/g, (c) => `\\${c}`);
  const stream =
    lines.length === 0
      ? '0 0 m 595 842 l S'
      : ['BT', '/F1 9 Tf', '40 800 Td', '11 TL', ...lines.map((l) => `(${esc(l)}) '`), 'ET'].join('\n');

  // 1 catalog, 2 pages, 3 content, 4 font, 5.. page objects.
  const pageIds = Array.from({ length: pageCount }, (_, i) => i + 5);
  const objects = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    `<< /Type /Pages /Kids [${pageIds.map((id) => `${id} 0 R`).join(' ')}] /Count ${pageCount} >>`,
    `<< /Length ${Buffer.byteLength(stream, 'latin1')} >>\nstream\n${stream}\nendstream`,
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
    ...pageIds.map(
      () =>
        '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 4 0 R >> >> /Contents 3 0 R >>'
    ),
  ];
  const parts: string[] = ['%PDF-1.4\n'];
  let length = parts[0]!.length;
  const offsets: number[] = [];
  objects.forEach((o, i) => {
    offsets.push(length);
    const part = `${i + 1} 0 obj\n${o}\nendobj\n`;
    parts.push(part);
    length += Buffer.byteLength(part, 'latin1');
  });
  const xref = length;
  parts.push(`xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`);
  parts.push(offsets.map((o) => `${String(o).padStart(10, '0')} 00000 n \n`).join(''));
  parts.push(`trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`);
  return Buffer.from(parts.join(''), 'latin1');
}

/** ~6 400 characters of plain Latin text: one dense page, as İNCELEME-45 measured. */
export function densePageLines(): string[] {
  const line = 'Horizon Europe work programme text for the K6 shared corpus, cluster five.';
  return Array.from({ length: 85 }, (_, i) => `${i + 1} ${line}`);
}

/**
 * A PDF whose content streams are Flate-compressed — the shapes İNCELEME-52
 * B-1' used. `content` is one page's raw content stream; `layers: 2` gives
 * `[/FlateDecode /FlateDecode]`. With `shared` every page points at the same
 * stream object (one small file, `pages` × the work); otherwise each page
 * carries its own copy.
 */
export function flatePdf(opts: { content: Buffer; pages?: number; shared?: boolean; layers?: number }): Buffer {
  const layers = opts.layers ?? 1;
  let data = opts.content;
  for (let i = 0; i < layers; i++) data = deflateSync(data);
  const filter = layers === 1 ? '/FlateDecode' : `[${Array.from({ length: layers }, () => '/FlateDecode').join(' ')}]`;
  return streamPdf({ data, filter, pages: opts.pages, shared: opts.shared });
}

/**
 * A PDF whose page content is `data`, already encoded for `filter` (a PDF
 * name or array, written as is into the stream dictionary; omitted = raw).
 * `dict` adds entries to that dictionary as written (e.g. `/Width 10`).
 * `/Length` is `data.length`, so pdf.js reads exactly `data` even when it
 * contains the bytes `endstream`. `pages`/`shared` as for `flatePdf`.
 */
export function streamPdf(opts: { data: Buffer; filter?: string; dict?: string; pages?: number; shared?: boolean }): Buffer {
  const pages = opts.pages ?? 1;
  const data = opts.data;
  const filter = (opts.filter ? ` /Filter ${opts.filter}` : '') + (opts.dict ? ` ${opts.dict}` : '');
  const stream = Buffer.concat([
    Buffer.from(`<< /Length ${data.length}${filter} >>\nstream\n`, 'latin1'),
    data,
    Buffer.from('\nendstream', 'latin1'),
  ]);

  // 1 catalog, 2 pages, 3 font, then per page: the page (and its own stream unless shared).
  const objects: Buffer[] = [];
  const add = (o: Buffer | string) => {
    objects.push(typeof o === 'string' ? Buffer.from(o, 'latin1') : o);
  };
  add('<< /Type /Catalog /Pages 2 0 R >>');
  add(''); // the page tree, filled in below
  add('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>');
  let sharedId = 0;
  if (opts.shared) {
    add(stream);
    sharedId = objects.length;
  }
  const pageIds: number[] = [];
  for (let i = 0; i < pages; i++) {
    let contentId = sharedId;
    if (!opts.shared) {
      add(stream);
      contentId = objects.length;
    }
    add(
      `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 3 0 R >> >> /Contents ${contentId} 0 R >>`
    );
    pageIds.push(objects.length);
  }
  objects[1] = Buffer.from(
    `<< /Type /Pages /Kids [${pageIds.map((id) => `${id} 0 R`).join(' ')}] /Count ${pages} >>`,
    'latin1'
  );

  const parts: Buffer[] = [Buffer.from('%PDF-1.5\n', 'latin1')];
  let length = parts[0]!.length;
  const offsets: number[] = [];
  objects.forEach((o, i) => {
    offsets.push(length);
    const part = Buffer.concat([Buffer.from(`${i + 1} 0 obj\n`, 'latin1'), o, Buffer.from('\nendobj\n', 'latin1')]);
    parts.push(part);
    length += part.length;
  });
  const xref =
    `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n` +
    offsets.map((o) => `${String(o).padStart(10, '0')} 00000 n \n`).join('') +
    `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${length}\n%%EOF\n`;
  parts.push(Buffer.from(xref, 'latin1'));
  return Buffer.concat(parts);
}

/**
 * One page of text whose font's program (`/FontFile2`) is `data`, encoded for
 * `filter` with `dict` added to its stream dictionary. pdf.js reads a font
 * program whole as soon as the text uses the font — so any decoder, the image
 * decoders included, runs during text extraction this way.
 */
export function fontFilePdf(opts: { data: Buffer; filter: string; dict?: string }): Buffer {
  const content = 'BT /F1 9 Tf 40 800 Td (Font file) Tj ET';
  const objects: Buffer[] = [
    Buffer.from('<< /Type /Catalog /Pages 2 0 R >>', 'latin1'),
    Buffer.from('<< /Type /Pages /Kids [3 0 R] /Count 1 >>', 'latin1'),
    Buffer.from(
      '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 5 0 R >> >> /Contents 4 0 R >>',
      'latin1'
    ),
    Buffer.from(`<< /Length ${content.length} >>\nstream\n${content}\nendstream`, 'latin1'),
    Buffer.from(
      '<< /Type /Font /Subtype /TrueType /BaseFont /Embedded /FirstChar 32 /LastChar 126 /FontDescriptor 6 0 R >>',
      'latin1'
    ),
    Buffer.from(
      '<< /Type /FontDescriptor /FontName /Embedded /Flags 32 /FontBBox [0 0 1000 1000] /ItalicAngle 0 /Ascent 800 /Descent -200 /CapHeight 700 /StemV 80 /FontFile2 7 0 R >>',
      'latin1'
    ),
    Buffer.concat([
      Buffer.from(`<< /Length ${opts.data.length} /Filter ${opts.filter}${opts.dict ? ` ${opts.dict}` : ''} >>\nstream\n`, 'latin1'),
      opts.data,
      Buffer.from('\nendstream', 'latin1'),
    ]),
  ];
  const parts: Buffer[] = [Buffer.from('%PDF-1.5\n', 'latin1')];
  let length = parts[0]!.length;
  const offsets: number[] = [];
  objects.forEach((o, i) => {
    offsets.push(length);
    const part = Buffer.concat([Buffer.from(`${i + 1} 0 obj\n`, 'latin1'), o, Buffer.from('\nendobj\n', 'latin1')]);
    parts.push(part);
    length += part.length;
  });
  parts.push(
    Buffer.from(
      `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n` +
        offsets.map((o) => `${String(o).padStart(10, '0')} 00000 n \n`).join('') +
        `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${length}\n%%EOF\n`,
      'latin1'
    )
  );
  return Buffer.concat(parts);
}

/*
 * Encoders for the filters other than Flate — TASK-MUNRAWJ0N84T6 (İNCELEME-60
 * Y-1): the inflate cap measured only streams whose first layer was zlib, so
 * each of these carried a decompression bomb past it.
 */

/** `/ASCIIHexDecode` (PDF 32000-1 §7.4.2). */
export function asciiHexEncode(data: Buffer): Buffer {
  return Buffer.from(`${data.toString('hex')}>`, 'latin1');
}

/** `/ASCII85Decode` (§7.4.3), `z` for all-zero groups, ending in `~>`. */
export function ascii85Encode(data: Buffer): Buffer {
  let out = '';
  for (let i = 0; i < data.length; i += 4) {
    const n = Math.min(4, data.length - i);
    const group = Buffer.alloc(4);
    data.copy(group, 0, i, i + n);
    let v = group.readUInt32BE(0);
    if (n === 4 && v === 0) {
      out += 'z';
      continue;
    }
    const digits: string[] = [];
    for (let d = 0; d < 5; d++) {
      digits.unshift(String.fromCharCode(33 + (v % 85)));
      v = Math.floor(v / 85);
    }
    out += digits.slice(0, n + 1).join('');
  }
  return Buffer.from(`${out}~>`, 'latin1');
}

/** `/RunLengthDecode` (§7.4.5): runs of up to 128 equal bytes, then EOD. */
export function runLengthEncode(data: Buffer): Buffer {
  const out: number[] = [];
  let i = 0;
  while (i < data.length) {
    let run = 1;
    while (run < 128 && i + run < data.length && data[i + run] === data[i]) run++;
    if (run > 1) {
      out.push(257 - run, data[i]!);
      i += run;
    } else {
      out.push(0, data[i]!);
      i++;
    }
  }
  out.push(128);
  return Buffer.from(out);
}

/**
 * `/LZWDecode` (§7.4.4, EarlyChange 1) from a list of codes, packed at the
 * width pdf.js's decoder expects at each point. `lzwLiteral` and `lzwRun`
 * give the lists.
 */
function lzwPack(codes: number[]): Buffer {
  const bytes: number[] = [];
  let acc = 0;
  let bits = 0;
  let codeLength = 9;
  let nextCode = 258;
  let hasPrev = false;
  for (const code of codes) {
    acc = (acc << codeLength) | code;
    bits += codeLength;
    while (bits >= 8) {
      bits -= 8;
      bytes.push((acc >>> bits) & 0xff);
    }
    acc &= (1 << bits) - 1;
    if (code === 256) {
      codeLength = 9;
      nextCode = 258;
      hasPrev = false;
      continue;
    }
    if (hasPrev) {
      nextCode++;
      const n = nextCode + 1;
      if ((n & (n - 1)) === 0) codeLength = Math.min(Math.log2(n) + 1, 12);
    }
    hasPrev = true;
  }
  if (bits > 0) bytes.push((acc << (8 - bits)) & 0xff);
  return Buffer.from(bytes);
}

/** LZW with every byte as a literal code — decodes back to `data`. */
export function lzwLiteral(data: Buffer): Buffer {
  return lzwPack([...data, 257]);
}

/**
 * LZW that decodes to `rounds` × ~7.4 MB of spaces from ~5.8 KB each: every
 * code is the one just added, one byte longer than the last (1, 2, … 3 838).
 */
export function lzwRun(rounds: number): Buffer {
  const codes: number[] = [];
  for (let r = 0; r < rounds; r++) {
    codes.push(0x20);
    for (let c = 258; c < 4096; c++) codes.push(c);
    codes.push(256);
  }
  codes.push(257);
  return lzwPack(codes);
}

/** What `lzwRun(rounds)` decodes to, in bytes. */
export function lzwRunSize(rounds: number): number {
  // 1 + (2 + 3 + … + 3839) per round.
  return rounds * (1 + ((2 + 3839) * 3838) / 2);
}

/**
 * `/JBIG2Decode` (embedded, §7.4.7): a page information segment and an end of
 * page, nothing drawn. The decoder allocates the page bitmap from the declared
 * size alone — `width × height / 8` bytes from a ~40-byte stream.
 */
export function jbig2BlankPage(width: number, height: number): Buffer {
  const segment = (number: number, type: number, data: Buffer) => {
    const header = Buffer.alloc(11);
    header.writeUInt32BE(number, 0);
    header[4] = type; // page association in 1 byte
    header[5] = 0; // no referred-to segments
    header[6] = 1; // page 1
    header.writeUInt32BE(data.length, 7);
    return Buffer.concat([header, data]);
  };
  const info = Buffer.alloc(19);
  info.writeUInt32BE(width, 0);
  info.writeUInt32BE(height, 4);
  return Buffer.concat([segment(0, 48, info), segment(1, 49, Buffer.alloc(0))]);
}

/**
 * One zlib stream whose first block is stored (uncompressed) and holds
 * `endstream`, then `rest` deflated. A scanner that ends a stream at the first
 * `endstream` bytes sees ~20 bytes; pdf.js reads `/Length` and inflates all.
 */
export function zlibWithStoredEndstream(rest: Buffer): Buffer {
  const lead = Buffer.from('\nendstream\n', 'latin1');
  const stored = Buffer.alloc(5);
  stored[0] = 0; // BFINAL 0, BTYPE 00, padded to the byte
  stored.writeUInt16LE(lead.length, 1);
  stored.writeUInt16LE(~lead.length & 0xffff, 3);
  const whole = Buffer.concat([lead, rest]);
  let a = 1;
  let b = 0;
  for (const byte of whole) {
    a = (a + byte) % 65521;
    b = (b + a) % 65521;
  }
  const adler = Buffer.alloc(4);
  adler.writeUInt32BE(((b << 16) | a) >>> 0);
  return Buffer.concat([Buffer.from([0x78, 0x01]), stored, lead, deflateRawSync(rest), adler]);
}

/** `lines` copies of one text operator drawn at the same point — İNCELEME-52's `inplace` shape. */
export function inPlaceTextContent(lines: number): Buffer {
  return Buffer.from(['BT', '/F1 9 Tf', ...Array.from({ length: lines }, () => '1 0 0 1 40 400 Tm (A) Tj'), 'ET'].join('\n'), 'latin1');
}
