/**
 * DOCX & print-HTML exporter for a tenant's own working documents.
 *
 * This module produces the TENANT's draft, not a funding body's paperwork. It used to head
 * every single export with a fixed `EUROPEAN COMMISSION - HORIZON EUROPE` badge (or
 * `TÜBİTAK EŞİK ÜSTÜ ÖDÜLÜ PAKETİ` for one document kind), tied to no record at all, and to
 * open the body with "produced in line with the official Horizon Europe … standards". A
 * consultancy's half-written NDA therefore downloaded as something that looked issued by the
 * Commission. The letterhead now names the organisation the document actually belongs to —
 * a stored row — and the page carries an explicit notice that no funding body issued it.
 */

import { Document as DocxDocument, Packer, Paragraph, TextRun } from 'docx';
import { withBrand } from './brand';
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

/**
 * Boilerplate body for a document that carries no stored content of its own.
 *
 * `src/app/api/documents/export/route.ts` used to build this paragraph as a
 * Turkish template literal inside the route handler, so an English session
 * downloaded a Turkish document (CLAUDE.md rule 8). It lives in the message
 * catalogue now, in both languages, and no longer stamps today's date onto the
 * "effective date" clause — an export is not an execution.
 */
export function templateBodyText(kind: string, locale?: ExportLocale): string {
  return withBrand(labels(locale).templateBody.replace('{kind}', kind));
}

/** Interpolation-safe text for the HTML template. Signatory fields are stored user input. */
function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
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
  /**
   * The stored id of the record this export is OF — an `ApplicationPart` id, for instance.
   *
   * It is printed as the document reference, so it has to identify the document rather than
   * the download: the route used to pass `doc-export-${Date.now()}`, which put a different,
   * registration-number-looking reference on the header every time the same document was
   * exported. A document with no stored record behind it has no reference, and the header
   * says so instead of inventing one — hence optional.
   */
  documentRef?: string;
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

/**
 * The "who wrote this section" line of a Part B section.
 *
 * A section's lead author comes from the stored part, so it is present only when a real user
 * has been recorded against that section. It used to be printed as
 * `Lider Yazar: <name> (<org> || 'Konsorsiyum')`, which invented an organisation for every
 * author whose organisation was unknown — the export equivalent of the invented template
 * authors this module used to carry. Now: the recorded organisation or nothing at all, and an
 * unowned section states that no lead author is assigned rather than staying silent about it.
 */
function leadAuthorText(
  sec: { leadAuthor?: string; leadAuthorOrg?: string },
  L: ReturnType<typeof labels>
): string {
  const author = sec.leadAuthor?.trim();
  if (!author) return L.leadAuthorUnassigned;
  const org = sec.leadAuthorOrg?.trim();
  return `${L.leadAuthorLabel}: ${author}${org ? ` (${org})` : ''}`;
}

/**
 * The reference line of the header.
 *
 * A reference identifies the DOCUMENT, so it can only come from a stored id. When there is
 * none the header states that, rather than printing the `doc-export-<epoch millis>` string the
 * route used to mint per download — two exports of one document carried two references, each
 * looking like a registration number nobody could look up.
 */
function documentRefText(documentRef: string | undefined, L: ReturnType<typeof labels>): string {
  const ref = documentRef?.trim();
  return ref ? `${L.docRefLabel}: ${ref}` : L.documentRefUnassigned;
}

/** Who actually produced this document — printed on every export, in both formats. */
function provenanceText(orgName: string, L: ReturnType<typeof labels>): string {
  return withBrand(L.provenanceNotice.replace('{org}', orgName));
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
 * Generates official HTML/CSS template suitable for browser print / PDF export.
 *
 * Every fixed label here used to be a Turkish literal, so an English session
 * downloaded a document whose body was English and whose table headings, print
 * button, date format and footer were Turkish. They come from the catalogue
 * now, like the rest of this module (CLAUDE.md rule 8).
 */
export function generatePdfHtml(data: ExportDocumentData): string {
  const {
    documentRef,
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

  let sectionsHtml = '';
  if (sections.length > 0) {
    sectionsHtml = sections
      .map(
        (sec) => `
      <div style="margin-bottom: 25px; page-break-inside: avoid;">
        <h3 style="color: #1e40af; border-bottom: 1px solid #cbd5e1; padding-bottom: 5px; margin-bottom: 8px; font-size: 13pt;">
          ${sec.title}
        </h3>
        <div style="font-size: 9pt; color: #64748b; margin-bottom: 8px;">${escapeHtml(leadAuthorText(sec, L))}</div>
        <div style="font-size: 10pt; line-height: 1.5; color: #334155;">
          ${sec.content.replace(/\n/g, '<br>')}
        </div>
      </div>
    `
      )
      .join('');
  }

  const dateLocale = locale === 'en' ? 'en-GB' : 'tr-TR';

  return `<!DOCTYPE html>
<html lang="${locale === 'en' ? 'en' : 'tr'}">
<head>
  <meta charset="UTF-8">
  <title>${kind} - ${title}</title>
  <style>
    @page { size: A4; margin: 20mm; }
    body { font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif; color: #1e293b; line-height: 1.6; font-size: 11pt; }
    .header { border-bottom: 2px solid #1d4ed8; padding-bottom: 15px; margin-bottom: 25px; display: flex; justify-content: space-between; align-items: center; }
    .logo-badge { font-weight: bold; font-size: 14pt; color: #1d4ed8; }
    .sub-header { font-size: 9pt; color: #64748b; font-family: monospace; }
    .provenance { font-size: 9pt; color: #92400e; background: #fffbeb; border: 1px solid #fde68a; border-radius: 6px; padding: 8px 12px; margin-bottom: 22px; }
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
      ${escapeHtml(L.printButton)}
    </button>
  </div>

  <div class="header">
    <div>
      <div class="logo-badge">${escapeHtml(orgName)}</div>
      <div class="sub-header">${escapeHtml(documentRefText(documentRef, L))} | ${escapeHtml(L.versionLabel)} v${version}</div>
    </div>
    <div style="text-align:right;" class="sub-header">
      ${escapeHtml(L.exportedAtLabel)}: ${new Date().toLocaleDateString(dateLocale)}
    </div>
  </div>

  <div class="provenance">${escapeHtml(provenanceText(orgName, L))}</div>

  <div class="title">${title}</div>

  <table class="meta-table">
    <tr>
      <td class="label">${escapeHtml(L.callLabel)}:</td>
      <td><strong>${escapeHtml(callName)}</strong></td>
    </tr>
    <tr>
      <td class="label">${escapeHtml(L.organizationLabel)}:</td>
      <td>${escapeHtml(orgName)}</td>
    </tr>
    <tr>
      <td class="label">${escapeHtml(L.documentTypeLabel)}:</td>
      <td>${kind} (${escapeHtml(L.versionLabel)} v${version})</td>
    </tr>
    <tr>
      <td class="label">${escapeHtml(L.signatureStatusLabel)}:</td>
      <td>${
        signature.kind === 'SIGNED'
          ? `${escapeHtml(L.signed)} (${signature.signedAt.toLocaleDateString(dateLocale)})`
          : escapeHtml(signature.kind === 'PENDING' ? L.awaitingSignature : L.signatoryUnassigned)
      }</td>
    </tr>
  </table>

  <div class="content-box">
    ${sectionsHtml || (contentText ? contentText.replace(/\n/g, '<br>') : `<p>${escapeHtml(L.contentPending)}</p>`)}
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
    ${escapeHtml(withBrand(L.footer))}
  </div>
</body>
</html>`;
}

/**
 * Real Word (.docx) bytes: an Office Open XML package, built with the `docx` library the M2
 * concept-note export already uses.
 *
 * This function used to return the bare `word/document.xml` markup with a `Buffer.from(xml)`
 * and hand it to the route under the OOXML content type and a `.docx` filename. A .docx is a
 * ZIP container, so what the browser saved began with `<?xml` instead of `PK\x03\x04`, and
 * every zip tool (and Word itself) rejected it — `unzip -t` reported "End-of-central-directory
 * signature not found". Nothing about the old output was a document anyone could open.
 *
 * Async because packing a zip is: the single caller is a route handler and already awaits.
 */
export async function generateDocxBuffer(data: ExportDocumentData): Promise<Buffer> {
  const { documentRef, title, kind, opportunityTitle, tenantName, version = 1, locale, sections = [] } = data;

  // Same rule as the PDF template: an absent call or organisation is labelled as absent
  // rather than back-filled with a plausible-looking placeholder.
  const L = labels(locale);
  const callName = opportunityTitle?.trim() || L.callUnspecified;
  const orgName = tenantName?.trim() || L.organizationUnassigned;

  /** A label/value line, e.g. **Kuruluş:** Küçük Danışmanlık Ltd. */
  const field = (label: string, value: string) =>
    new Paragraph({
      children: [new TextRun({ text: `${label}: `, bold: true }), new TextRun({ text: value })],
    });

  const children: Paragraph[] = [
    new Paragraph({
      children: [new TextRun({ text: `${kind} - ${title}`, bold: true, size: 36, color: '1D4ED8' })],
    }),
    // The .docx carries the same provenance notice as the printed page: the letterhead of an
    // export is the tenant's own organisation, and no funding body issued this file.
    new Paragraph({
      children: [new TextRun({ text: provenanceText(orgName, L), italics: true, color: '92400E' })],
      spacing: { after: 200 },
    }),
    field(L.docxProjectLabel, callName),
    field(L.docxOrganizationLabel, orgName),
    field(L.versionLabel, `v${version}`),
    new Paragraph({ children: [new TextRun({ text: documentRefText(documentRef, L) })] }),
    new Paragraph({ children: [] }),
  ];

  if (sections.length > 0) {
    for (const sec of sections) {
      children.push(
        new Paragraph({
          children: [new TextRun({ text: sec.title, bold: true, size: 26, color: '1E40AF' })],
          spacing: { before: 300 },
        }),
        new Paragraph({
          children: [new TextRun({ text: leadAuthorText(sec, L), italics: true, color: '64748B' })],
        }),
        ...plainTextParagraphs(sec.content),
        new Paragraph({ children: [] })
      );
    }
  } else {
    children.push(
      new Paragraph({ children: [new TextRun({ text: L.docxBodyHeading, bold: true, size: 28 })] }),
      ...plainTextParagraphs(data.contentText ?? withBrand(L.docxFallbackBody))
    );
  }

  const doc = new DocxDocument({ sections: [{ properties: {}, children }] });
  return Packer.toBuffer(doc);
}

/**
 * Stored section content as Word paragraphs.
 *
 * Section bodies come out of the Part B editor, so they can carry HTML tags and newlines. The
 * `docx` library escapes the text it is given, so tags are stripped for readability only — not
 * as an escaping measure.
 */
function plainTextParagraphs(text: string): Paragraph[] {
  return text
    .replace(/<[^>]+>/g, '')
    .split('\n')
    .map((line) => new Paragraph({ children: [new TextRun({ text: line })] }));
}
