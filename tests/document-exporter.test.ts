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
    expect(ndaHtml).toContain('✓ Dijital İmzalandı');

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
