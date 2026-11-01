---
name: fabrika-m6-disclaimer-surfaces
description: Evaluator Lens (M6) skoru gösteren beş yüzey ve her birinin "iç ön değerlendirme" etiketini nereden aldığı — yeni copy icat etme, m6.internalPreAssessment anahtarlarını kullan
metadata:
  type: project
  updatedAt: 2026-09-07
---

CLAUDE.md "Yapma": *"Evaluator Lens çıktısını 'resmî puan' gibi sunma; her yerde 'iç ön
değerlendirme' etiketi."* 2026-09-07'de beş yüzeyin tamamı etiketlendi ve iki locale'de
gerçek tarayıcıyla doğrulandı (TASK-MTQTYE287FERM).

**Etiket taşıması gereken yüzeyler:**

1. `src/app/[locale]/(app)/[workspace]/opportunities/[id]/evaluations/client.tsx` —
   header rozeti; üç sekmenin (Değerlendirmeler / REA / ESR Kalibrasyonu) hepsinin
   üstünde durur, o yüzden sekme başına ayrı rozet gerekmez.
2. `src/modules/m6/ui/EvaluatorForm.tsx`
3. `src/modules/m6/ui/EvaluationDashboard.tsx`
4. `src/modules/m5/ui/Dashboard.tsx` → `Dashboard.descAverageScore` KPI açıklaması
   (ortalama puan kartı M6 `Evaluation` satırlarından besleniyor).
5. `src/actions/user/export-data.ts` → GDPR dump'ı `Evaluation` satırlarını taşıyor;
   payload ürünün UI'ından çıktığı için disclaimer'ı `notice: {tr, en}` alanında
   yanında götürüyor.

**Tek copy kaynağı:** `m6.internalPreAssessment` + `m6.internalPreAssessmentBody`
(`messages/tr.json` / `messages/en.json`). Yeni bir yüzey eklerken **yeni anahtar
yazma** — bu ikisini çağır, yoksa copy üç yerde ayrışır. 1-3 numaralı yüzeyler ortak
`data-testid="m6-internal-badge"` taşır; e2e bu tek seçiciyle her yüzeyi kontrol eder
(`tests/e2e/m6-evaluator.spec.ts`).

**Kapsam dışı, bilinçli:** landing sayfası (`src/app/[locale]/page.tsx`) vitrininde
"⭐ 91/100" ve "Hakem Puanı 14.5 / 15.0" var — bunlar gerçek Evaluator Lens çıktısı
değil, pazarlama mock'u. Disclaimer taşımaları bir ürün kararı; kural gereği değil.

İlgili: [[fabrika-hardcoded-copy-defeats-grep-audit]]
