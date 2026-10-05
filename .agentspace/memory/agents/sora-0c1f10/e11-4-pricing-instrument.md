---
name: e11-4-pricing-instrument
description: E11.4 fiyat doğrulama hattının tasarımı — anket/analiz/politika üç ayrı saf modül, rapor üretilir, FIXTURE bandı sahte veriyi gerçek gibi sunmayı engeller
metadata:
  type: project
  updatedAt: 2026-09-06
---

E11.4 (TASK-MTQ3DZS6W6DFC) fiyat doğrulaması, atölyeden **altı hafta önce** yapıldı; gerçek
yanıt olamayacağı için teslim edilen şey sayısal sonuç değil, **enstrüman + hat + politika** oldu.

Sabitlenen tasarım kararları (gerçek yanıtlar geldiğinde değişmemeli):

- **Üç saf modül, tek CLI.** `pricing-survey.ts` (tanım) → `pricing-analysis.ts` (istatistik) →
  `pricing-report.ts` (Markdown). Hiçbiri dosya/DB/saat okumaz; `scripts/beta-pricing-survey.ts`
  hepsini birleştirir (`--render` varsayılan, `--analyze`, `--send`).
- **Soru id'si = CSV kolonu = Google Form başlığındaki `[köşeli]` ön ek.** Üçü tek tanımdan
  üretildiği için elle kurulan bir form gibi ayrışamaz.
- **`# STATUS: FIXTURE|REAL`** satırı yanıt CSV'sinin başında; `parsePricingResponses` okur,
  rapor bandı buna göre değişir. Fikstür veriyle üretilmiş rapor kendini gerçek gibi sunamıyor —
  iki test bunu koruyor. Sahte veriyle çalışırken tercih edilen kalıp bu.
- **Para sınırı:** form insana **euro** sorar, parse anında ×100 ile cent'e çevrilir. Kolonu
  "cents" diye adlandırıp insandan kuruş istemek sessiz 100× hata sınıfıdır; ayrı test var.
- **Politika kod:** `pricing-transition.ts` içindeki `TRANSITION_TIERS` tek ayar noktası.
  Rapordaki örnek teklif tablosu `resolveBetaTransition()` çağrılarak üretiliyor, yani doküman
  implementasyonla çelişemiyor. Yüzde değiştirmek = bir sabit + testler.

Geçiş politikası özeti: founding %40/12ay + 24ay kilit · contributor %25/12ay + 12ay kilit ·
alumni %15/6ay. Koşul harcama değil **katılım** (sync + ≥1 teklif G2'de). GA 2026-11-16.
Ayrıntı: docs/BILLING.md §8 ve docs/E11-PRICING-FEEDBACK.md §11.

Bkz. [[fabrika-beta-onboarding-e11]] · [[van-westendorp-plateau-trap]]
