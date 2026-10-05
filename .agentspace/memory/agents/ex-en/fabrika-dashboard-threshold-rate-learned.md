---
name: fabrika-dashboard-threshold-rate-learned
description: KPI panoda "Eşik Üstü Oranı" kartı ekledi (2026-09-07) — MetricValue tasarımı, i18n kaynakları, pano grid düzeni kalıcı bilgi
metadata:
  type: project
  updatedAt: 2026-09-07
---

## KPI Kartı Pano Tasarımı

**Grid Düzeni:** `lg:grid-cols-3` (3 sütun desktop) → 7 kart gösterilirse 2 satır + 1 kart. Kartlar şu anda:
1. `totalProposals` (sayı)
2. `hitRate` (%)
3. `thresholdRate` (%) — YENİ
4. `averageScore` (/)
5. `personDays` (gün)
6. `avgDaysG2` (gün)
7. `activeModules` (sayı)

Tasarım: kartlar **sırasıyla render edilir**, grid otomatik wrap. Boş durumda ("Henüz veri yok") tüm kartlar `variant="default"` + unmeasured=true.

**Neden önemli:** Yeni KPI ekliyorsa bu grid'e sığması kontrol et; 3 sütun sabit.

---

## MetricValue Türü — "Ölçülmedi" vs "Ölçülüp Sıfır"

```typescript
type MetricValue = { measured: true; value: number } | { measured: false };
```

**Kuraldır:** `measured: false` ise UI'da `t('noData')` yazı gösterilir, **değer gösterilmez**. `measured: true, value: 0` ise `0.0 %` gösterilir.

**Fark:**
- **Ölçülmedi:** "Henüz G0 puanı olan fırsat yok → oran hesaplanamıyor" (yeni çalışma alanı)
- **Ölçülüp sıfır:** "5 fırsatı G0'dan geçirdik, 0 teklif gönderildi → isabet %0" (gerçek sonuç)

**Kural:** Denominator ≤ 0 → `NOT_MEASURED`. Denominator > 0 ama numerator = 0 → `measured(0.0)`.

**İmplementasyon:** `src/modules/m5/server/metrics.ts` — `hitRate()`, `personDaysPerProposal()`, `thresholdRate()` hepsi aynı deseni izler.

---

## İ18n Kaynakları — `messages/` vs `src/locales/`

**Doğru:** `messages/tr.json`, `messages/en.json` — `next-intl` yalnız bunu okuyor.  
**Ölü kod:** `src/locales/tr/dashboard.json` vb — hoş görünüyor ama hiç import edilmiyor (ROADMAP.md Riskler §1).

**Kural:** Tüm anahtar-değer çiftleri `messages/{locale}.json`'a gitmeli. `t('...')` çağrısı buradan alınır.

**Hata görmez:** `pnpm i18n:check` `src/locales/` taramıyor, yalnız `messages/` tarar → ölü kod tuzağı.

---

## KPI Hesaplama Deseni

1. **Sorguları paralel yap:** `Promise.all([tx.proposal.count(...), tx.effort.aggregate(...), ...])`
2. **Saf fonksiyonlarla türet:** `hitRate(a, b)`, `thresholdRate(a, b)`, vb
3. **Absence rule doğru yap:** denominator ≤ 0 → `NOT_MEASURED`

**Avantaj:** Birim testler veritabanı olmadan yazılıyor.

---

## Pano Boş Durumu

Üç koşul:
```typescript
if (!metrics.hasAnyOpportunity) {
  // Yeni çalışma alanı: "Fırsat yok, ekle" butonu
} else if (metrics.totalOffers === 0) {
  // Fırsatlar var ama bu aralıkta yok: "Daha geniş aralık seç"
} else {
  // Kartlar render et
}
```

Kartlarda boş durumda: `metricCard(..., unmeasured: true)` → `value={t('noData')}`, **başarı yeşili değil** (variant="default").

---

## Sonraki Kart Eklenirse

1. Metrik hesaplama fonksiyonu: `src/modules/m5/server/metrics.ts`
2. `KpiMetrics` interface'e alan ekle + sorgu yazması ekle: `src/modules/m5/server/queries.ts`
3. Kart render et: `src/modules/m5/ui/Dashboard.tsx` (metricCard döngüsünde)
4. i18n anahtar-değer: `messages/{tr,en}.json` (title, description, emptyDescription)
5. Birim testler: `tests/kpi-metrics.test.ts`

[[fabrika-default-0-columns-hide-absence]] — bu kartlar "0 gönderilen" durumunda boş gösterilmeli, mock %84.2 değil.
