# E10.1 Başarı Oranı Sorgusu — Tekrar (Code Review)

**Ajan:** Derin (derin-0c1f10) — Kod İnceleme Uzmanı
**Görev:** `(Proposal.submitted) / (Opportunity.g0)` ratio doğrulaması — `src/modules/m5/server/queries.ts`
**Tarih:** 2026-09-06

## Karar: BLOKE EDEN YOK — düzeltme doğru, gerçek veriyle doğrulandı

## 1. Bulunan durum (inceleme başlangıcında)

İnceleme başladığında `src/modules/m5/server/queries.ts`'teki `successRate` hesabı şu şekildeydi (git diff ile teyit edildi, oturum başındaki `git status` bu dosyayı temiz gösteriyordu — yani değişiklik bu oturum sırasında, muhtemelen paralel çalışan Cora ajanı tarafından yapıldı):

```ts
// ESKİ (hatalı)
tx.proposal.count({
  where: { tenantId, opportunity: {
    createdAt: { gte: from, lte: to },
    status: { in: ['FUNDED', 'ABOVE_THRESHOLD'] },   // ← Opportunity.status hiçbir zaman bu değeri almıyor
  }},
});
```

**Kök neden (statik analizle doğrulandı):** `Opportunity.status` alanı (`OppStatus` enum) seed script'inde (`prisma/seed-opportunities.ts:84`) her zaman `'ACTIVE'` olarak yazılıyor ve kod tabanında bu alanı `FUNDED`/`ABOVE_THRESHOLD` yapan **hiçbir** yol yok (`grep` ile doğrulandı — sadece enum tanımı ve bu iki sorguda geçiyor). Asıl "kabul/ret" bilgisi `Proposal.outcome` (String, `'above_threshold'` gibi küçük harf değerler) alanında tutuluyor — tamamen farklı bir model/alan. Sonuç: bu sorgu gerçek veriyle **her zaman 0** dönerdi; önceki E10.1 raporundaki "%72.5" rakamı gerçek seed verisiyle üretilebilir bir değer değil.

## 2. İnceleme sırasında dosya değişti (paralel ajan çakışması)

İlk `Read` ile yukarıdaki hatalı kodu gördüm. Doğrulama script'i yazıp DB'ye karşı çalıştırırken (`getKpiMetrics()` gerçek sonucu ile satır-satır yeniden hesapladığım sonucun **uyuşmadığını** fark ettim: fonksiyon `40` döndürüyordu, benim elle tekrar ettiğim eski sorgu `0` veriyordu). Dosyayı tekrar okuyunca kodun bu iki çağrı arasında **değiştiğini** gördüm — ticket'ın istediği formüle geçilmişti:

```ts
// YENİ (mevcut, doğru)
submittedProposals = tx.proposal.count({ where: { tenantId, submittedAt: { not: null }, opportunity: { createdAt: {...} } } })
g0ScoredOpportunities = tx.opportunity.count({ where: { tenantId, g0Score: { not: null }, createdAt: {...} } })
successRate = g0ScoredOpportunities > 0 ? (submittedProposals / g0ScoredOpportunities) * 100 : 0
```

Bu, `docs/CLAUDE.md`'de not edilen "paralel ajanlar aynı dosyayı yazıyor" riskinin canlı bir örneği — inceleme bitmeden değişiklik commit'lendi (`f9c0da5 fix(m5): compute hit rate as submitted proposals over G0-scored opportunities`). Hafızada zaten kayıtlı olan [[fabrika-parallel-agent-file-race]] bu olayla doğrulandı; ayrıca eşzamanlı çalışan bir ajanın bıraktığı [[fabrika-g0-conversion-rate-formula]] notu da aynı tuzağı (`stage='G0'` kullanmanın seed veriyle %200 gibi anlamsız bir oran ürettiğini) önceden tespit etmiş — commit'lenen çözüm bu tuzağa düşmeyip `g0Score IS NOT NULL` kullanmış, doğru.

## 3. Mevcut (güncel) implementasyonun incelemesi

- **Formül eşleşmesi:** Ticket'ın istediği `Proposal.submitted / Opportunity.g0` oranıyla birebir örtüşüyor: pay = `submittedAt IS NOT NULL` olan teklif sayısı, payda = `g0Score IS NOT NULL` olan fırsat sayısı.
- **`getKpiTrend()` fonksiyonu da** aynı mantıkla güncellenmiş (satır 208-227) — tutarlı.
- **Alan varlığı doğrulandı:** `Proposal.submittedAt` ve `Opportunity.g0Score` şemada gerçekten var (`prisma/schema.prisma:552,637`) — ticket metnindeki `Proposal.status` alanı şemada **yok** (Proposal'da `status` diye bir alan hiç yok), bu yüzden yeni kod haklı olarak `submittedAt` kullanmış — ticket'ın kelimesi değil niyeti karşılanmış.
- **`successRate` alan adı** (`KpiMetrics.successRate`) değişmedi → `Dashboard.tsx`, `KpiCard`, CSV export route'larında (`export-csv/route.ts`, `fetch-metrics.ts`) ek değişiklik gerekmiyor, geriye dönük uyumlu.

## 4. Gerçek veriyle çalışma zamanı doğrulaması (KANIT)

`pnpm db:seed` çalıştırıldı, ardından gerçek `getKpiMetrics()` fonksiyonu demo tenant'a karşı çağrıldı (geçici script, incelemeden sonra silindi):

```
getKpiMetrics() result: {
  "totalOffers": 5,
  "successRate": 40,
  "averageScore": 0,
  "personDays": 9.5,
  "g0ToG2Days": 9,
  "activeModules": 6
}
```

Doğrulama — elle çapraz kontrol:
- `Proposal` satırları: DREN (`submittedAt: null`), IWHR (`submittedAt: 2026-09-01`), GFLEX (`submittedAt: 2026-08-28`, `outcome: above_threshold`) → **submittedProposals = 2**
- `Opportunity` satırları: 5 kayıt, hepsinde `g0Score` dolu (75/82/85/88/92) → **g0ScoredOpportunities = 5**
- `2 / 5 * 100 = 40` ✅ fonksiyonun döndürdüğü değerle birebir eşleşiyor.

Seed verisi ticket'ın "Doğrulama" kriterini karşılıyor: Opportunity 5 (≥5 ✓), Proposal 3 (≥3 ✓).

## 5. Statik kontroller

- `pnpm exec tsc --noEmit` → temiz, hata yok.
- `pnpm exec eslint src/modules/m5/server/queries.ts` → 0 error, 2 **pre-existing** unused-import warning (`prisma`, `PrismaClient` — bu değişiklikten önce de kullanılmıyordu, kapsam dışı, dokunulmadı).

## 6. Bulgular (önem sırasına göre)

| # | Önem | Bulgu | Durum |
|---|------|-------|-------|
| 1 | Kritik (giderildi) | `Opportunity.status` hiçbir zaman FUNDED/ABOVE_THRESHOLD olmadığından eski sorgu her zaman %0 dönerdi; önceki rapordaki %72.5 rakamı gerçek koşuyla üretilemez | Oturum sırasında paralel ajan tarafından düzeltildi, ben gerçek veriyle doğruladım |
| 2 | Öneri (kapsam dışı, bloke etmiyor) | `queries.ts:1-2` — `prisma`, `PrismaClient` import'ları kullanılmıyor (bu değişiklikten önce de öyleydi) | Düzeltilmedi (kapsam dışı) |
| 3 | Öneri (kapsam dışı, bloke etmiyor) | Bu KPI hesaplaması için birim test yok; CLAUDE.md "puanlama fonksiyonu... için birim test zorunlu" kuralına göre eklenmesi iyi olur | Bu ticket'ın kapsamında değil, ayrı görev olarak açılabilir |
| 4 | Orta (temizlik, bloke etmiyor) | `src/lib/dashboard/fetch-metrics.ts` içinde `fetchDashboardMetrics()` adında **üçüncü, farklı tanımlı** bir "Başarı Oranı" hesaplaması var (`proposal.outcome` bazlı, G0→submission dönüşümü) ve hiçbir yerden çağrılmıyor (`grep` ile doğrulandı — sadece kendi dosyasında geçiyor). Gelecekte biri bu dosyayı "asıl KPI kodu" sanıp üzerine inşa edebilir | Düzeltilmedi (kapsam dışı) — bkz. [[fabrika-m5-kpi-duplicate-implementations]] |

## Sonuç

**Bloke eden bulgu yok.** `successRate` sorgusu artık ticket'ın istediği `Proposal.submitted / Opportunity.g0` oranını doğru şekilde hesaplıyor, tip kontrolü temiz, gerçek seed verisiyle uçtan uca test edildi (%40 sonucu elle doğrulandı). Görev DONE olarak işaretlenebilir.

## Sonraki adım (önerilen, bu ticket'ın parçası değil)
- `getKpiMetrics`/`getKpiTrend` için birim test eklenmesi (ayrı task olarak açılabilir).
- `src/lib/dashboard/fetch-metrics.ts` (orphaned, 3. bir "Başarı Oranı" tanımı) silinsin ya da `queries.ts` ile birleştirilsin — karar `docs/ROADMAP.md`'e yazılıp ayrı task açılmalı.
