/**
 * Native DOCX & PDF Template Exporter Engine
 * Generates official EU Horizon Europe & TÜBİTAK formatted document downloads (.docx & .pdf)
 */

export interface ExportDocumentData {
  id: string;
  kind: 'NDA' | 'LOI' | 'COMMITMENT' | 'ESR_DEBRIEF' | 'AWARD_PACK' | 'PART_B' | string;
  title: string;
  opportunityTitle?: string;
  tenantName?: string;
  version?: number;
  signedAt?: string | Date | null;
  contentText?: string;
  sections?: { key: string; title: string; content: string; leadAuthor?: string; leadAuthorOrg?: string }[];
  budgetLines?: { partnerName: string; personMonths: number; requestedTotal: number }[];
  workPackages?: { code: string; title: string; leadPartner: string; startMonth: number; endMonth: number }[];
}

/**
 * Generates official HTML/CSS template suitable for browser print / PDF export
 */
export function generatePdfHtml(data: ExportDocumentData): string {
  const {
    title,
    kind,
    opportunityTitle = 'HORIZON-CL5-2026-D3-01: Zero-Emission Transport Systems',
    tenantName = 'FonBridge Teknoloji A.Ş.',
    version = 1,
    signedAt,
    contentText,
    sections = [],
  } = data;

  const isTubitak = kind === 'AWARD_PACK';
  const isHorizon = kind === 'PART_B' || kind === 'NDA' || kind === 'LOI';

  let sectionsHtml = '';
  if (sections.length > 0) {
    sectionsHtml = sections
      .map(
        (sec) => `
      <div style="margin-bottom: 25px; page-break-inside: avoid;">
        <h3 style="color: #1e40af; border-bottom: 1px solid #cbd5e1; padding-bottom: 5px; margin-bottom: 8px; font-size: 13pt;">
          ${sec.title}
        </h3>
        ${sec.leadAuthor ? `<div style="font-size: 9pt; color: #64748b; margin-bottom: 8px;"><strong>Lider Yazar:</strong> ${sec.leadAuthor} (${sec.leadAuthorOrg || 'Konsorsiyum'})</div>` : ''}
        <div style="font-size: 10pt; line-height: 1.5; color: #334155;">
          ${sec.content.replace(/\n/g, '<br>')}
        </div>
      </div>
    `
      )
      .join('');
  }

  return `<!DOCTYPE html>
<html lang="tr">
<head>
  <meta charset="UTF-8">
  <title>${kind} - ${title}</title>
  <style>
    @page { size: A4; margin: 20mm; }
    body { font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif; color: #1e293b; line-height: 1.6; font-size: 11pt; }
    .header { border-bottom: 2px solid ${isTubitak ? '#b91c1c' : '#1d4ed8'}; padding-bottom: 15px; margin-bottom: 25px; display: flex; justify-content: space-between; align-items: center; }
    .logo-badge { font-weight: bold; font-size: 14pt; color: ${isTubitak ? '#b91c1c' : '#1d4ed8'}; }
    .sub-header { font-size: 9pt; color: #64748b; font-family: monospace; }
    .title { font-size: 18pt; font-weight: bold; margin-bottom: 8px; color: #0f172a; }
    .meta-table { width: 100%; border-collapse: collapse; margin-bottom: 25px; background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 6px; }
    .meta-table td { padding: 8px 12px; font-size: 10pt; border-bottom: 1px solid #e2e8f0; }
    .meta-table td.label { font-weight: bold; color: #475569; width: 30%; }
    .content-box { font-size: 10.5pt; text-align: justify; margin-bottom: 30px; }
    .signature-section { margin-top: 50px; border-top: 1px solid #cbd5e1; padding-top: 20px; display: flex; justify-content: space-between; }
    .sig-box { width: 45%; border: 1px dashed #cbd5e1; padding: 15px; border-radius: 6px; background: #fafafa; }
    .sig-status { font-weight: bold; color: #047857; font-size: 10pt; }
    .footer { position: fixed; bottom: 0; left: 0; right: 0; font-size: 8pt; color: #94a3b8; text-align: center; border-top: 1px solid #f1f5f9; padding-top: 5px; }
    @media print {
      .no-print { display: none; }
      body { margin: 0; }
    }
  </style>
</head>
<body>
  <div class="no-print" style="background:#f1f5f9; padding:10px; margin-bottom:20px; text-align:right;">
    <button onclick="window.print()" style="background:#1d4ed8; color:#fff; border:none; padding:8px 16px; border-radius:6px; font-weight:bold; cursor:pointer;">
      🖨️ Resmî Yazdır / PDF İndir
    </button>
  </div>

  <div class="header">
    <div>
      <div class="logo-badge">${isTubitak ? 'TÜBİTAK EŞİK ÜSTÜ ÖDÜLÜ PAKETİ' : 'EUROPEAN COMMISSION - HORIZON EUROPE'}</div>
      <div class="sub-header">Doküman Ref: ${data.id} | Sürüm v${version}</div>
    </div>
    <div style="text-align:right;" class="sub-header">
      Tarih: ${new Date().toLocaleDateString('tr-TR')}
    </div>
  </div>

  <div class="title">${title}</div>

  <table class="meta-table">
    <tr>
      <td class="label">Proje / Çağrı Adı:</td>
      <td><strong>${opportunityTitle}</strong></td>
    </tr>
    <tr>
      <td class="label">Başvuran Kuruluş:</td>
      <td>${tenantName}</td>
    </tr>
    <tr>
      <td class="label">Doküman Türü:</td>
      <td>${kind} (Sürüm v${version})</td>
    </tr>
    <tr>
      <td class="label">E-İmza Onay Durumu:</td>
      <td>${signedAt ? `✓ İmzalandı (${new Date(signedAt).toLocaleDateString('tr-TR')})` : '⏳ İmza Bekliyor'}</td>
    </tr>
  </table>

  <div class="content-box">
    ${sectionsHtml || (contentText ? contentText.replace(/\n/g, '<br>') : '<p>Doküman içeriği hazırlanmaktadır.</p>')}
  </div>

  <div class="signature-section">
    <div class="sig-box">
      <strong>Koordinatör / Yetkili İmza:</strong><br><br>
      <span>İsim: Dr. Mehmet Yılmaz</span><br>
      <span>Unvan: Ar-Ge Direktörü</span><br>
      <span class="sig-status">${signedAt ? '✓ Dijital İmzalandı' : '⏳ İmza Bekliyor'}</span>
    </div>

    <div class="sig-box">
      <strong>Konsorsiyum Ortağı / Resmi Onay:</strong><br><br>
      <span>Kurum: ${tenantName}</span><br>
      <span>Tarih: ${new Date().toLocaleDateString('tr-TR')}</span><br>
      <span class="sig-status">${signedAt ? '✓ Onaylandı' : '⏳ Onay Bekliyor'}</span>
    </div>
  </div>

  <div class="footer">
    FonBridge - Resmî Ufuk Avrupa & TÜBİTAK Doküman Üretim Motoru | Sayfa 1 / 1
  </div>
</body>
</html>`;
}

/**
 * Generates Word (.docx) XML document buffer formatted according to EC guidelines
 */
export function generateDocxBuffer(data: ExportDocumentData): Buffer {
  const { title, kind, opportunityTitle = 'HORIZON-CL5-2026-D3-01', tenantName = 'FonBridge Teknoloji A.Ş.', version = 1, sections = [] } = data;

  let bodyXml = '';

  if (sections.length > 0) {
    bodyXml = sections
      .map(
        (sec) => `
    <w:p>
      <w:pPr><w:pStyle w:val="Heading2"/></w:pPr>
      <w:r><w:rPr><w:b/><w:sz w:val="26"/><w:color w:val="1E40AF"/></w:rPr><w:t>${sec.title}</w:t></w:r>
    </w:p>
    ${sec.leadAuthor ? `<w:p><w:r><w:rPr><w:i/><w:color w:val="64748B"/></w:rPr><w:t>Lider Yazar: ${sec.leadAuthor} (${sec.leadAuthorOrg || 'Konsorsiyum'})</w:t></w:r></w:p>` : ''}
    <w:p>
      <w:r><w:t>${sec.content.replace(/<[^>]+>/g, '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')}</w:t></w:r>
    </w:p>
    <w:p><w:r><w:t></w:t></w:r></w:p>
    `
      )
      .join('');
  } else {
    bodyXml = `
    <w:p>
      <w:pPr><w:pStyle w:val="Heading1"/></w:pPr>
      <w:r><w:rPr><w:b/><w:sz w:val="28"/></w:rPr><w:t>1. DOKÜMAN İÇERİĞİ VE HÜKÜMLER</w:t></w:r>
    </w:p>
    <w:p>
      <w:r><w:t>${data.contentText ? data.contentText.replace(/<[^>]+>/g, '') : 'İşbu doküman resmî Ufuk Avrupa standartlarına uygun olarak üretilmiştir.'}</w:t></w:r>
    </w:p>`;
  }

  // Build WordprocessingML XML package document
  const xmlContent = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<?mso-application progid="Word.Document"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:body>
    <w:p>
      <w:pPr><w:pStyle w:val="Title"/><w:jc w:val="center"/></w:pPr>
      <w:r><w:rPr><w:b/><w:sz w:val="36"/><w:color w:val="1D4ED8"/></w:rPr><w:t>${kind} - ${title}</w:t></w:r>
    </w:p>
    <w:p><w:r><w:t></w:t></w:r></w:p>
    <w:p>
      <w:r><w:rPr><w:b/></w:rPr><w:t>Proje Başlığı: </w:t></w:r>
      <w:r><w:t>${opportunityTitle}</w:t></w:r>
    </w:p>
    <w:p>
      <w:r><w:rPr><w:b/></w:rPr><w:t>Kuruluş: </w:t></w:r>
      <w:r><w:t>${tenantName}</w:t></w:r>
    </w:p>
    <w:p>
      <w:r><w:rPr><w:b/></w:rPr><w:t>Sürüm: </w:t></w:r>
      <w:r><w:t>v${version}</w:t></w:r>
    </w:p>
    <w:p><w:r><w:t></w:t></w:r></w:p>
    ${bodyXml}
  </w:body>
</w:document>`;

  return Buffer.from(xmlContent, 'utf-8');
}
