import { deflateSync } from 'node:zlib';

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
export function flatePdf(opts: { content: Buffer; pages?: number; shared?: boolean; layers?: 1 | 2 }): Buffer {
  const pages = opts.pages ?? 1;
  let data = deflateSync(opts.content);
  if (opts.layers === 2) data = deflateSync(data);
  const filter = opts.layers === 2 ? '[/FlateDecode /FlateDecode]' : '/FlateDecode';
  const stream = Buffer.concat([
    Buffer.from(`<< /Length ${data.length} /Filter ${filter} >>\nstream\n`, 'latin1'),
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

/** `lines` copies of one text operator drawn at the same point — İNCELEME-52's `inplace` shape. */
export function inPlaceTextContent(lines: number): Buffer {
  return Buffer.from(['BT', '/F1 9 Tf', ...Array.from({ length: lines }, () => '1 0 0 1 40 400 Tm (A) Tj'), 'ET'].join('\n'), 'latin1');
}
