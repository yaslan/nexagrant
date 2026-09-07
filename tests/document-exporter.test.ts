import { describe, test, expect } from 'vitest';
import { generateDocxBuffer, generatePdfHtml } from '../src/lib/document-exporter';

describe('Boşluk 2: Native DOCX & PDF Document Exporter Engine', () => {
  test('generatePdfHtml creates official HTML print template for NDA and TÜBİTAK Award Pack', () => {
    const ndaHtml = generatePdfHtml({
      id: 'doc-nda-1',
      kind: 'NDA',
      title: 'Mutual Non-Disclosure Agreement',
      opportunityTitle: 'HORIZON-CL5-2026-D3-01',
      tenantName: 'Fabrika Teknoloji A.Ş.',
      version: 1,
      signedAt: new Date(),
      contentText: 'Strict confidentiality terms between consortium partners.',
    });

    expect(ndaHtml).toContain('EUROPEAN COMMISSION - HORIZON EUROPE');
    expect(ndaHtml).toContain('Mutual Non-Disclosure Agreement');

    const tubitakHtml = generatePdfHtml({
      id: 'doc-award-1',
      kind: 'AWARD_PACK',
      title: 'TÜBİTAK Eşik Üstü Ödül Paketi Formu',
      opportunityTitle: 'HORIZON-CL4-2026-TWIN-01',
      tenantName: 'İTÜ Ar-Ge A.Ş.',
      version: 1,
      contentText: 'Eşik üstü puan alan proje ödül başvurusu.',
    });

    expect(tubitakHtml).toContain('TÜBİTAK EŞİK ÜSTÜ ÖDÜLÜ PAKETİ');
    expect(tubitakHtml).toContain('İTÜ Ar-Ge A.Ş.');
  });

  test('generateDocxBuffer creates WordprocessingML binary buffer', () => {
    const buffer = generateDocxBuffer({
      id: 'doc-partb-1',
      kind: 'PART_B',
      title: 'Part B Technical Proposal Structure',
      opportunityTitle: 'HORIZON-CL5-2026-D3-01',
      tenantName: 'Fabrika Teknoloji A.Ş.',
      version: 2,
      contentText: '1. Excellence 2. Impact 3. Quality and efficiency of implementation',
    });

    expect(buffer).toBeInstanceOf(Buffer);
    expect(buffer.length).toBeGreaterThan(100);
    const xmlString = buffer.toString('utf-8');
    expect(xmlString).toContain('w:document');
    expect(xmlString).toContain('PART_B - Part B Technical Proposal Structure');
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
    id: 'doc-nda-2',
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

  test('an absent organisation or call is labelled absent, not back-filled', () => {
    const html = generatePdfHtml({
      id: 'doc-nda-3',
      kind: 'NDA',
      title: 'Mutual Non-Disclosure Agreement',
    });

    expect(html).toContain('Kuruluş belirtilmedi');
    expect(html).toContain('Çağrı belirtilmedi');
    expect(html).not.toContain('FonBridge Teknoloji A.Ş.');

    const xml = generateDocxBuffer({
      id: 'doc-nda-3',
      kind: 'NDA',
      title: 'Mutual Non-Disclosure Agreement',
    }).toString('utf-8');

    expect(xml).toContain('Kuruluş belirtilmedi');
    expect(xml).not.toContain('FonBridge Teknoloji A.Ş.');
  });
});
