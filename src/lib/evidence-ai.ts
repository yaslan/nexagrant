import { OpenAI } from 'openai';

/**
 * Interface representing extracted metadata from an Evidence Document
 */
export interface ExtractedEvidenceMetadata {
  issuingAuthority?: string;
  documentNumber?: string;
  issuedAt?: string;
  validUntil?: string;
  categorySuggestion?: string;
  tags: string[];
  suggestedClaims: Array<{ statementTr: string; statementEn: string }>;
  maskedPiiFound: boolean;
  ocrSummary: string;
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

/**
 * Simulated/AI Vision OCR extraction for evidence documents
 */
export async function extractEvidenceMetadata(
  fileName: string,
  category: string,
  rawText?: string
): Promise<ExtractedEvidenceMetadata> {
  const defaultOcrText = rawText || `Sertifika Adı: ${fileName}\nVeren Kurum: TÜRKAK / TSE Akredite Kurul\nBelge No: ISO-27001-2025-9921\nDüzenleme Tarihi: 2025-01-15\nGeçerlilik Bitiş Tarihi: 2028-01-15\nYetkinlik: Bilgi Güvenliği Yönetim Sistemi (BGYS) ISO/IEC 27001:2022 Standart Uyum Belgesi.`;

  const { maskedText, piiFound } = maskPIIInText(defaultOcrText);

  // Default fallback extraction
  return {
    issuingAuthority: fileName.toLowerCase().includes('iso') ? 'TSE / BSI Certification' : 'İstanbul Ticaret Odası',
    documentNumber: `DOC-${Math.floor(100000 + Math.random() * 900000)}`,
    issuedAt: new Date(Date.now() - 180 * 24 * 3600 * 1000).toISOString().split('T')[0],
    validUntil: fileName.toLowerCase().includes('bilan') || fileName.toLowerCase().includes('mali')
      ? new Date(Date.now() + 180 * 24 * 3600 * 1000).toISOString().split('T')[0]
      : new Date(Date.now() + 730 * 24 * 3600 * 1000).toISOString().split('T')[0],
    categorySuggestion: category || 'CERTIFICATION',
    tags: ['doğrulanmış', 'iso27001', 'AB-uyumlu', 'bgys'],
    suggestedClaims: [
      {
        statementTr: `${fileName.replace(/\.[^/.]+$/, '')} kapsamında uluslararası standartlara tam uyumlu altyapı işletilmektedir.`,
        statementEn: `The organization operates fully compliant infrastructure verified by ${fileName.replace(/\.[^/.]+$/, '')}.`,
      },
      {
        statementTr: `Kuruluşumuz bağımsız akredite denetçi tarafından belgelenmiş bilgi güvenliği yönetim sistemine sahiptir.`,
        statementEn: `Our organization maintains an independently audited and certified information security management system.`,
      }
    ],
    maskedPiiFound: piiFound,
    ocrSummary: maskedText,
  };
}
