import { describe, test, expect } from 'vitest';
import unzipper from 'unzipper';
import { generateDocxBuffer, generatePdfHtml } from '../src/lib/document-exporter';

/**
 * Every export used to be headed `EUROPEAN COMMISSION - HORIZON EUROPE` (or, for one document
 * kind, `TÜBİTAK EŞİK ÜSTÜ ÖDÜLÜ PAKETİ`) — a badge bound to no record, so a tenant's own
 * half-written draft downloaded looking like Commission paperwork. These tests pin the
 * replacement: the letterhead is the organisation the document belongs to, and both formats
 * state that no funding body issued the file.
 */
describe('document provenance', () => {
  const draft = {
    kind: 'NDA',
    title: 'Kendi taslağım',
    tenantName: 'Küçük Danışmanlık Ltd.',
  };

  test('heads the page with the tenant organisation, not a funding body', () => {
    const html = generatePdfHtml(draft);

    expect(html).toContain('<div class="logo-badge">Küçük Danışmanlık Ltd.</div>');
    expect(html).not.toContain('EUROPEAN COMMISSION');
    expect(html).not.toContain('HORIZON EUROPE');
  });

  test('no document kind gets a funding-body badge', () => {
    for (const kind of ['NDA', 'AWARD_PACK', 'PART_B', 'LOI', 'ESR_DEBRIEF']) {
      const html = generatePdfHtml({ ...draft, kind });

      expect(html).not.toContain('EUROPEAN COMMISSION');
      expect(html).not.toContain('TÜBİTAK EŞİK ÜSTÜ ÖDÜLÜ PAKETİ');
    }
  });

  test('states that no funding body issued the document, in both languages', () => {
    expect(generatePdfHtml(draft)).toContain(
      "Bu belge Küçük Danışmanlık Ltd. tarafından Fabrika'da hazırlanmıştır."
    );
    expect(generatePdfHtml({ ...draft, locale: 'en' })).toContain(
      'This document was prepared by Küçük Danışmanlık Ltd. in Fabrika. It is NOT an official document'
    );
  });
});

/**
 * The header reference used to be `doc-export-${Date.now()}`, minted by the route per
 * download: the same document exported twice carried two different registration-number-looking
 * references, and the header date was labelled plain "Tarih" although it was only "now".
 */
describe('document reference and date', () => {
  const draft = { kind: 'NDA', title: 'Kendi taslağım', tenantName: 'Küçük Danışmanlık Ltd.' };

  test('the same document reference renders the same on every export', () => {
    const first = generatePdfHtml({ ...draft, documentRef: 'part_abc123' });
    const second = generatePdfHtml({ ...draft, documentRef: 'part_abc123' });
    const ref = (html: string) => html.match(/Doküman Ref: [^ <|]+/)?.[0];

    expect(ref(first)).toBe('Doküman Ref: part_abc123');
    expect(ref(second)).toBe(ref(first));
  });

  test('a document with no stored record gets no invented reference', () => {
    const html = generatePdfHtml(draft);

    expect(html).toContain('Kayıtlı bir doküman referansı yok');
    expect(html).not.toContain('Doküman Ref:');
    expect(html).not.toContain('doc-export-');
  });

  test('the header date is labelled as the export date, not as a document date', () => {
    expect(generatePdfHtml(draft)).toContain('Dışa aktarma tarihi:');
    expect(generatePdfHtml({ ...draft, locale: 'en' })).toContain('Exported on:');
  });
});

describe('Boşluk 2: Native DOCX & PDF Document Exporter Engine', () => {
  test('generatePdfHtml creates the print template for a draft and an award pack', () => {
    const ndaHtml = generatePdfHtml({
      documentRef: 'part_nda_1',
      kind: 'NDA',
      title: 'Mutual Non-Disclosure Agreement',
      opportunityTitle: 'HORIZON-CL5-2026-D3-01',
      tenantName: 'Fabrika Teknoloji A.Ş.',
      version: 1,
      signedAt: new Date(),
      contentText: 'Strict confidentiality terms between consortium partners.',
    });

    expect(ndaHtml).toContain('Mutual Non-Disclosure Agreement');
    expect(ndaHtml).toContain('Fabrika Teknoloji A.Ş.');

    const tubitakHtml = generatePdfHtml({
      documentRef: 'part_award_1',
      kind: 'AWARD_PACK',
      title: 'TÜBİTAK Eşik Üstü Ödül Paketi Formu',
      opportunityTitle: 'HORIZON-CL4-2026-TWIN-01',
      tenantName: 'İTÜ Ar-Ge A.Ş.',
      version: 1,
      contentText: 'Eşik üstü puan alan proje ödül başvurusu.',
    });

    // The title the tenant typed is still theirs to keep; the LETTERHEAD is what may not
    // claim a funding body.
    expect(tubitakHtml).toContain('TÜBİTAK Eşik Üstü Ödül Paketi Formu');
    expect(tubitakHtml).toContain('<div class="logo-badge">İTÜ Ar-Ge A.Ş.</div>');
  });

  test('generateDocxBuffer produces a real OOXML package that zip tools can open', async () => {
    const buffer = await generateDocxBuffer({
      documentRef: 'part_partb_1',
      kind: 'PART_B',
      title: 'Part B Technical Proposal Structure',
      opportunityTitle: 'HORIZON-CL5-2026-D3-01',
      tenantName: 'Fabrika Teknoloji A.Ş.',
      version: 2,
      contentText: '1. Excellence 2. Impact 3. Quality and efficiency of implementation',
    });

    // A .docx is a ZIP container. The old implementation returned bare `word/document.xml`
    // bytes, so the download started with `<?xml` and `unzip -t` failed on it.
    expect(buffer.subarray(0, 4)).toEqual(Buffer.from([0x50, 0x4b, 0x03, 0x04]));

    const archive = await unzipper.Open.buffer(buffer);
    const paths = archive.files.map((f) => f.path);
    expect(paths).toContain('[Content_Types].xml');
    expect(paths).toContain('word/document.xml');

    const documentXml = archive.files.find((f) => f.path === 'word/document.xml');
    const xml = (await documentXml!.buffer()).toString('utf-8');
    expect(xml).toContain('PART_B - Part B Technical Proposal Structure');
    expect(xml).toContain('part_partb_1');
  });
});

/**
 * The exported document used to print a fixed `İsim: Dr. Mehmet Yılmaz` /
 * `Unvan: Ar-Ge Direktörü` into its signature block — the same invented signatory on every
 * tenant's official-looking PDF. These tests pin both halves of the fix: a real record is
 * printed, and no record prints NO name.
 */
describe('signature block attribution', () => {
  const base = {
    documentRef: 'part_nda_2',
    kind: 'NDA',
    title: 'Mutual Non-Disclosure Agreement',
    opportunityTitle: 'HORIZON-CL5-2026-D3-01',
    tenantName: 'Fabrika Teknoloji A.Ş.',
    version: 1,
  };

  test('prints the signatory from the record, not a hard-coded person', () => {
    const html = generatePdfHtml({
      ...base,
      signatory: {
        name: 'Elif Şahin',
        title: 'Genel Müdür',
        org: 'Fabrika Teknoloji A.Ş.',
        signedAt: '2026-09-01T10:00:00.000Z',
      },
    });

    expect(html).toContain('İsim: Elif Şahin');
    expect(html).toContain('Unvan: Genel Müdür');
    expect(html).toContain('✓ Dijital İmzalandı');
    expect(html).not.toContain('Mehmet Yılmaz');
    expect(html).not.toContain('Ar-Ge Direktörü');
  });

  test('with no signatory record it prints no name and does not claim a signature', () => {
    // `signedAt` is set — the old template treated that alone as proof of a signature and
    // stamped "✓ Dijital İmzalandı" under an invented name.
    const html = generatePdfHtml({ ...base, signedAt: new Date('2026-09-01T10:00:00.000Z') });

    expect(html).toContain('İmzalayan atanmadı');
    expect(html).not.toContain('İsim:');
    expect(html).not.toContain('Unvan:');
    expect(html).not.toContain('Mehmet Yılmaz');
    expect(html).not.toContain('✓ Dijital İmzalandı');
    expect(html).not.toContain('✓ Onaylandı');
  });

  test('a signatory record without a signing date reads as awaiting signature', () => {
    const html = generatePdfHtml({ ...base, signatory: { name: 'Elif Şahin' } });

    expect(html).toContain('İsim: Elif Şahin');
    expect(html).not.toContain('Unvan:'); // no stored title -> no invented title
    expect(html).toContain('⏳ İmza Bekliyor');
    expect(html).not.toContain('✓ Dijital İmzalandı');
  });

  test('a blank signatory name counts as no signatory', () => {
    const html = generatePdfHtml({ ...base, signatory: { name: '   ' }, signedAt: new Date() });

    expect(html).toContain('İmzalayan atanmadı');
    expect(html).not.toContain('✓ Dijital İmzalandı');
  });

  test('renders English labels for the en catalogue', () => {
    const html = generatePdfHtml({ ...base, locale: 'en' });

    expect(html).toContain('No signatory assigned');
    expect(html).not.toContain('İmzalayan atanmadı');
  });

  test('escapes a signatory name instead of injecting it into the template', () => {
    const html = generatePdfHtml({
      ...base,
      signatory: { name: '<script>alert(1)</script>', signedAt: new Date() },
    });

    expect(html).not.toContain('<script>alert(1)</script>');
    expect(html).toContain('&lt;script&gt;');
  });

  test('an absent organisation or call is labelled absent, not back-filled', async () => {
    const html = generatePdfHtml({
      kind: 'NDA',
      title: 'Mutual Non-Disclosure Agreement',
    });

    expect(html).toContain('Kuruluş belirtilmedi');
    expect(html).toContain('Çağrı belirtilmedi');
    expect(html).not.toContain('FonBridge Teknoloji A.Ş.');

    const buffer = await generateDocxBuffer({
      kind: 'NDA',
      title: 'Mutual Non-Disclosure Agreement',
    });
    const archive = await unzipper.Open.buffer(buffer);
    const documentXml = archive.files.find((f) => f.path === 'word/document.xml');
    const xml = (await documentXml!.buffer()).toString('utf-8');

    expect(xml).toContain('Kuruluş belirtilmedi');
    expect(xml).not.toContain('FonBridge Teknoloji A.Ş.');
  });
});
