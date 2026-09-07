/**
 * Evidence document metadata.
 *
 * This module used to *invent* accreditation. `extractEvidenceMetadata()` had neither
 * OCR nor an LLM behind it, yet every upload came back with the same hard-coded
 * certificate: a named accreditation body it had never read, a fixed certificate
 * number, a randomly generated document number, issue and expiry dates computed off
 * the clock, a "verified" tag, and two source-less compliance claims that `actions.ts`
 * persisted as `Claim` rows at confidence 0.95. That content is quoted into EU funding
 * applications, so it broke CLAUDE.md §7 ("every figure shown to the user is backed by
 * an Evidence or TopicStat record; never hard-code a number") in the most damaging way
 * available. See docs/agent-results/TASK-MTRH86RCGVEGC-geli-tirici.md.
 *
 * What is left here is only what can be derived from the document itself:
 *
 *   - `maskPIIInText()` — deterministic redaction, no inference.
 *   - `extractEvidenceMetadata()` — masks the text a caller actually read off the
 *     document, and reports *nothing* when there is no such text.
 *
 * Automatic field extraction stays off until there is a real reader. Two pieces are
 * missing, and neither can be faked: nothing in this repository turns an uploaded PDF
 * or image into text, and `extractEvidenceMetadata()` was handed only a file name. An
 * LLM called with a file name reproduces exactly the fabrication above, at the cost of
 * a credit charge. When OCR lands, pass its output as `rawText` and route the field
 * extraction through `generateText()` in `src/lib/ai/llm.ts` — that is the one entry
 * point that writes `AiUsageLog` and debits `CreditLedger` (CLAUDE.md §5).
 */

/**
 * What could be read off an evidence document.
 *
 * Every field is nullable on purpose: "not known" is a legitimate and common answer,
 * and the user fills it in by hand. A caller must never substitute a placeholder for
 * `null` — an invented issuing authority is worse than a blank one.
 */
export interface ExtractedEvidenceMetadata {
  issuingAuthority: string | null;
  documentNumber: string | null;
  issuedAt: string | null;
  validUntil: string | null;
  categorySuggestion: string | null;
  tags: string[];
  suggestedClaims: Array<{ statementTr: string; statementEn: string }>;
  maskedPiiFound: boolean;
  /** The document's text after redaction, or `null` when no text was read. */
  ocrSummary: string | null;
  /** `false` when no document text reached this function, so nothing was extracted. */
  extracted: boolean;
}

/**
 * Mask PII (Personally Identifiable Information) in extracted OCR text
 * Masks Turkish TCKN (11 digits), Passport Nos, Tax IDs, and Phone Nos by default.
 */
export function maskPIIInText(text: string): { maskedText: string; piiFound: boolean } {
  let piiFound = false;

  // TCKN regex (11 consecutive digits)
  const tcknRegex = /\b[1-9]\d{10}\b/g;
  // Phone regex
  const phoneRegex = /(?:\+?90|0)?\s*[5]\d{2}\s*\d{3}\s*\d{2}\s*\d{2}/g;

  let maskedText = text;

  if (tcknRegex.test(maskedText)) {
    piiFound = true;
    maskedText = maskedText.replace(tcknRegex, '*********** (TCKN Masked)');
  }

  if (phoneRegex.test(maskedText)) {
    piiFound = true;
    maskedText = maskedText.replace(phoneRegex, '+90 5XX XXX XX XX (Phone Masked)');
  }

  return { maskedText, piiFound };
}

/** Nothing was read off the document. The user enters the fields by hand. */
const NOTHING_EXTRACTED: ExtractedEvidenceMetadata = {
  issuingAuthority: null,
  documentNumber: null,
  issuedAt: null,
  validUntil: null,
  categorySuggestion: null,
  tags: [],
  suggestedClaims: [],
  maskedPiiFound: false,
  ocrSummary: null,
  extracted: false,
};

/**
 * Redact and return the text of an evidence document.
 *
 * `rawText` is the text a caller genuinely read off the file. There is no reader in
 * the repository yet, so today every caller omits it and the result is
 * `NOTHING_EXTRACTED` — no issuing authority, no document number, no dates, no tags
 * and no claims. That is the honest answer, and the upload flow renders it as an empty
 * state asking the user to fill the fields in.
 *
 * Even when `rawText` is supplied, no field is *inferred* from it: the text is masked
 * and handed back verbatim. Guessing an issuing authority out of a file name is the
 * bug this function was rewritten to remove.
 */
export async function extractEvidenceMetadata(
  rawText?: string | null,
): Promise<ExtractedEvidenceMetadata> {
  if (!rawText || !rawText.trim()) {
    return { ...NOTHING_EXTRACTED };
  }

  const { maskedText, piiFound } = maskPIIInText(rawText);

  return {
    ...NOTHING_EXTRACTED,
    maskedPiiFound: piiFound,
    ocrSummary: maskedText,
    extracted: true,
  };
}
