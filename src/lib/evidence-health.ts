export interface HealthScoreResult {
  score: number;
  grade: 'A+' | 'A' | 'B' | 'C' | 'F';
  totalItems: number;
  validCount: number;
  expiringCount: number;
  expiredCount: number;
  missingCoreDocs: string[];
  recommendationTr: string;
  recommendationEn: string;
}

export interface MinimalEvidenceItem {
  id: string;
  kind?: string;
  category?: string;
  status?: string;
  validUntil?: Date | string | null;
  title: string;
}

const CORE_DOC_TYPES = [
  { key: 'CORPORATE_IDENTITY', labelTr: 'Ticaret Sicil / Faaliyet Belgesi', labelEn: 'Trade Registry / Activity Cert' },
  { key: 'SME_DECLARATION', labelTr: 'KOBİ Beyannamesi (SME Declaration)', labelEn: 'SME Declaration' },
  { key: 'FINANCIAL', labelTr: 'Son Yıl Bilanço / Bağımsız Denetim', labelEn: 'Audit Balance Sheet' },
  { key: 'ETHICS_GEP', labelTr: 'Gender Equality Plan (GEP) / Etik Uyum', labelEn: 'Gender Equality Plan (GEP)' },
];

/**
 * Calculates the Evidence Pack Health Score (0 - 100)
 */
export function calculateEvidenceHealthScore(items: MinimalEvidenceItem[]): HealthScoreResult {
  const totalItems = items.length;

  if (totalItems === 0) {
    return {
      score: 0,
      grade: 'F',
      totalItems: 0,
      validCount: 0,
      expiringCount: 0,
      expiredCount: 0,
      missingCoreDocs: CORE_DOC_TYPES.map(c => c.labelTr),
      recommendationTr: 'Henüz hiçbir kurumsal kanıt belgesi yüklenmedi. Başlamak için Ticaret Sicil ve KOBİ beyannamesini yükleyin.',
      recommendationEn: 'No evidence documents uploaded yet. Upload Trade Registry and SME Declaration to get started.',
    };
  }

  const now = new Date();
  const thirtyDaysFromNow = new Date(now.getTime() + 30 * 24 * 3600 * 1000);

  let validCount = 0;
  let expiringCount = 0;
  let expiredCount = 0;

  items.forEach(item => {
    if (!item.validUntil) {
      validCount++;
      return;
    }

    const expiry = new Date(item.validUntil);
    if (expiry < now) {
      expiredCount++;
    } else if (expiry <= thirtyDaysFromNow) {
      expiringCount++;
      validCount++;
    } else {
      validCount++;
    }
  });

  // Check core document presence
  const missingCoreDocs: string[] = [];
  CORE_DOC_TYPES.forEach(core => {
    const hasDoc = items.some(i => 
      (i.category && i.category.toUpperCase().includes(core.key)) ||
      (i.kind && i.kind.toUpperCase().includes(core.key)) ||
      (i.title && i.title.toUpperCase().includes(core.key))
    );
    if (!hasDoc) {
      missingCoreDocs.push(core.labelTr);
    }
  });

  const coreDocsScore = Math.max(0, 40 - missingCoreDocs.length * 10); // Max 40 points
  const validityRatio = totalItems > 0 ? (validCount / totalItems) : 0;
  const validityScore = Math.round(validityRatio * 60); // Max 60 points
  const expiredPenalty = expiredCount * 15; // 15 pts penalty per expired doc

  const rawScore = coreDocsScore + validityScore - expiredPenalty;
  const score = Math.max(0, Math.min(100, rawScore));

  let grade: 'A+' | 'A' | 'B' | 'C' | 'F' = 'F';
  if (score >= 90) grade = 'A+';
  else if (score >= 80) grade = 'A';
  else if (score >= 65) grade = 'B';
  else if (score >= 50) grade = 'C';

  let recommendationTr = 'Evidence Pack verileriniz AB çağrı uygunluk kontrolleri için yüksek düzeyde hazır.';
  let recommendationEn = 'Your Evidence Pack is highly ready for EU call eligibility checks.';

  if (expiredCount > 0) {
    recommendationTr = `${expiredCount} adet süresi dolmuş belgeniz bulunmaktadır. AB hakem puan kaygısını önlemek için belgeleri güncelleyin.`;
    recommendationEn = `You have ${expiredCount} expired document(s). Update them to prevent evaluator penalty points.`;
  } else if (missingCoreDocs.length > 0) {
    recommendationTr = `Eksik zorunlu belgeleriniz var: ${missingCoreDocs.slice(0, 2).join(', ')}. G1 kapısı geçişi için tamamlayın.`;
    recommendationEn = `Missing core documents: ${missingCoreDocs.slice(0, 2).join(', ')}. Complete them for G1 gate passage.`;
  }

  return {
    score,
    grade,
    totalItems,
    validCount,
    expiringCount,
    expiredCount,
    missingCoreDocs,
    recommendationTr,
    recommendationEn,
  };
}
