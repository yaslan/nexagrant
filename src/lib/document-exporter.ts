/**
 * Native DOCX & PDF Template Exporter Engine
 * Generates official EU Horizon Europe & TÜBİTAK formatted document downloads (.docx & .pdf)
 */

import trMessages from '../../messages/tr.json';
import enMessages from '../../messages/en.json';

export type ExportLocale = 'tr' | 'en';

/**
 * The `DocumentExport` namespace of each message catalogue.
 *
 * The exporter is a synchronous, non-React function called from a route handler, so it can
 * use neither `useTranslations()` nor `await getTranslations()`. Reading the namespace out of
 * the same `messages/<locale>.json` files that `src/i18n/request.ts` loads keeps the strings
 * in one place and in both languages (CLAUDE.md rule 8). A key missing from one catalogue is
 * a type error here, not a Turkish string leaking into an English document.
 */
const CATALOGS = { tr: trMessages.DocumentExport, en: enMessages.DocumentExport };

function labels(locale?: ExportLocale) {
  return CATALOGS[locale === 'en' ? 'en' : 'tr'];
}

/** Interpolation-safe text for the HTML template. Signatory fields are stored user input. */
function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/** Interpolation-safe text for the WordprocessingML body. */
function escapeXml(value: string): string {
  return escapeHtml(value).replace(/'/g, '&apos;');
}

/**
 * Who the document is attributed to — a stored record, never a guess.
 *
 * `src/lib/document-exporter.ts:128` used to print a fixed `İsim: Dr. Mehmet Yılmaz` /
 * `Unvan: Ar-Ge Direktörü` into the signature block of EVERY exported document of EVERY
 * tenant. An official-looking PDF therefore named, as its authorised signatory, a person who
 * had nothing to do with it. Unlike a display name there is no honest fallback for a
 * signatory — not the e-mail local part, not the tenant name — so when no record exists the
 * block renders an "unassigned" state carrying no name at all, and the document is never
 * described as signed. Same rule as {@link file://src/lib/user-display.ts}.
 */
export interface DocumentSignatory {
  /** The signing person's real, stored name. An empty name counts as no signatory. */
  name: string;
  /** Their stored role/title. Omitted rather than invented when the record has none. */
  title?: string | null;
  /** The organisation they sign for. */
  org?: string | null;
  /** When they actually signed. Absent means assigned but not yet signed. */
  signedAt?: string | Date | null;
}

type SignatureState =
  | { kind: 'UNASSIGNED' }
  | { kind: 'PENDING'; signatory: DocumentSignatory }
  | { kind: 'SIGNED'; signatory: DocumentSignatory; signedAt: Date };

/**
 * A document is "signed" only when a real signatory record exists AND it carries a signing
 * date. `signedAt` on its own proves nothing about WHO signed, so it can no longer promote an
 * unattributed document to "✓ Dijital İmzalandı".
 */
function signatureState(
  signatory: DocumentSignatory | null | undefined,
  fallbackSignedAt?: string | Date | null
): SignatureState {
  if (!signatory || !signatory.name?.trim()) return { kind: 'UNASSIGNED' };
  const raw = signatory.signedAt ?? fallbackSignedAt;
  const at = raw ? new Date(raw) : null;
  if (!at || Number.isNaN(at.getTime())) return { kind: 'PENDING', signatory };
  return { kind: 'SIGNED', signatory, signedAt: at };
}

export interface ExportDocumentData {
  id: string;
  kind: 'NDA' | 'LOI' | 'COMMITMENT' | 'ESR_DEBRIEF' | 'AWARD_PACK' | 'PART_B' | string;
  title: string;
  opportunityTitle?: string;
  tenantName?: string;
  version?: number;
  signedAt?: string | Date | null;
  /** Which message catalogue the fixed labels come from. Defaults to `tr`. */
  locale?: ExportLocale;
  /** Authorised signatory, loaded from a record. Omit when nobody has been assigned. */
  signatory?: DocumentSignatory | null;
  /** Counter-signing partner / approver. Same "no record, no name" rule as `signatory`. */
  approver?: DocumentSignatory | null;
  contentText?: string;
  sections?: { key: string; title: string; content: string; leadAuthor?: string; leadAuthorOrg?: string }[];
  budgetLines?: { partnerName: string; personMonths: number; requestedTotal: number }[];
  workPackages?: { code: string; title: string; leadPartner: string; startMonth: number; endMonth: number }[];
}

/** The status line of a signature box: signed / awaiting / nobody assigned. */
function signatureStatusText(state: SignatureState, L: ReturnType<typeof labels>, signedText: string, pendingText: string): string {
  if (state.kind === 'UNASSIGNED') return L.signatoryUnassigned;
  if (state.kind === 'SIGNED') return signedText;
  return pendingText;
}

/**
 * The identity lines of a signature box. An UNASSIGNED block prints the "no signatory
 * assigned" notice and NO name — the whole point of this module's fix.
 */
function signatureIdentityHtml(state: SignatureState, L: ReturnType<typeof labels>, fallbackOrg: string): string {
  if (state.kind === 'UNASSIGNED') {
    return `<span class="sig-unassigned">${escapeHtml(L.signatoryUnassignedHint)}</span><br>`;
  }
  const { signatory } = state;
  const title = signatory.title?.trim();
  const org = signatory.org?.trim() || fallbackOrg;
  return (
    `<span>${escapeHtml(L.nameLabel)}: ${escapeHtml(signatory.name.trim())}</span><br>` +
    (title ? `<span>${escapeHtml(L.titleLabel)}: ${escapeHtml(title)}</span><br>` : '') +
    `<span>${escapeHtml(L.orgLabel)}: ${escapeHtml(org)}</span><br>`
  );
}

/**
 * Generates official HTML/CSS template suitable for browser print / PDF export
 */
export function generatePdfHtml(data: ExportDocumentData): string {
  const {
    title,
    kind,
    opportunityTitle,
    tenantName,
    version = 1,
    signedAt,
    locale,
    signatory,
    approver,
    contentText,
    sections = [],
  } = data;

  // No placeholder call and no placeholder organisation: the previous defaults printed a real
  // -looking call id and "FonBridge Teknoloji A.Ş." onto any document exported without them.
  const L = labels(locale);
  const callName = opportunityTitle?.trim() || L.callUnspecified;
  const orgName = tenantName?.trim() || L.organizationUnassigned;
  const signature = signatureState(signatory, signedAt);
  const approval = signatureState(approver ?? null, signedAt);

  const isTubitak = kind === 'AWARD_PACK';

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
    .sig-status.unassigned { color: #b45309; }
    .sig-unassigned { color: #b45309; font-size: 9.5pt; font-style: italic; }
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
      <td><strong>${escapeHtml(callName)}</strong></td>
    </tr>
    <tr>
      <td class="label">Başvuran Kuruluş:</td>
      <td>${escapeHtml(orgName)}</td>
    </tr>
    <tr>
      <td class="label">Doküman Türü:</td>
      <td>${kind} (Sürüm v${version})</td>
    </tr>
    <tr>
      <td class="label">E-İmza Onay Durumu:</td>
      <td>${
        signature.kind === 'SIGNED'
          ? `${escapeHtml(L.signed)} (${signature.signedAt.toLocaleDateString('tr-TR')})`
          : escapeHtml(signature.kind === 'PENDING' ? L.awaitingSignature : L.signatoryUnassigned)
      }</td>
    </tr>
  </table>

  <div class="content-box">
    ${sectionsHtml || (contentText ? contentText.replace(/\n/g, '<br>') : '<p>Doküman içeriği hazırlanmaktadır.</p>')}
  </div>

  <div class="signature-section">
    <div class="sig-box">
      <strong>${escapeHtml(L.signatoryBoxTitle)}:</strong><br><br>
      ${signatureIdentityHtml(signature, L, orgName)}
      <span class="sig-status${signature.kind === 'UNASSIGNED' ? ' unassigned' : ''}">${escapeHtml(
        signatureStatusText(signature, L, L.signed, L.awaitingSignature)
      )}</span>
    </div>

    <div class="sig-box">
      <strong>${escapeHtml(L.approverBoxTitle)}:</strong><br><br>
      ${signatureIdentityHtml(approval, L, orgName)}
      <span class="sig-status${approval.kind === 'UNASSIGNED' ? ' unassigned' : ''}">${escapeHtml(
        signatureStatusText(approval, L, L.approved, L.awaitingApproval)
      )}</span>
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
  const { title, kind, opportunityTitle, tenantName, version = 1, locale, sections = [] } = data;

  // Same rule as the PDF template: an absent call or organisation is labelled as absent
  // rather than back-filled with a plausible-looking placeholder.
  const L = labels(locale);
  const callName = opportunityTitle?.trim() || L.callUnspecified;
  const orgName = tenantName?.trim() || L.organizationUnassigned;

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
      <w:r><w:t>${escapeXml(callName)}</w:t></w:r>
    </w:p>
    <w:p>
      <w:r><w:rPr><w:b/></w:rPr><w:t>Kuruluş: </w:t></w:r>
      <w:r><w:t>${escapeXml(orgName)}</w:t></w:r>
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
