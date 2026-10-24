---
sözleşme: 3
görev: TASK-MVCU7MP8JK1V5
kod: TASK-MVCU7MP8JK1V5
ajan: crw2-fb
motor: claude
tip: diğer
okur: ekip
hüküm: Bitti: PR #98 merge'e hazır — bloke eden bulgu yok; 3 düşük önemli öneri (kova sayısına üst sınır yok, son kova `to`'yu aşıyor (önceden de vardı), yarı açık sınır testle sabitlenmemiş).
platform: mac (Darwin 27, yerel Postgres 16.15 docker :5433). Değişiklik saf SQL + tarih aritmetiği; süreç/dosya yolu/kabuk bağımlılığı yok, Linux/Windows'ta davranış aynı. Sunucu saat dilimi etkisi koddan değerlendirildi (aşağıda); Windows/Linux'ta koşulmadı, çünkü platforma bağlı kod yolu yok.
sürüm: 1
tarih: 2026-10-17T21:08:11.515Z
---

# FO-72 PR #98 inceleme — getKpiTrend tek sorgu (crw2-fb)

## Ne yapıldı
`origin/dev...origin/be-fb/fo72-kpi-trend-range` diff'ini satır satır okudum (4 dosya, +287/−58). Çağıranları okudum: `dashboard/page.tsx`, `range.ts` (`resolveDashboardRange`), `Dashboard.tsx` (`mergedTrendData`). Ayrıca `getKpiMetrics`, `withTenantOn`/`TenantTx` ve şemadaki Opportunity/Proposal tanımlarına baktım. PR başında (2b766e44) geçici bir worktree açıp canlı testi, mutasyon testini, e2e'yi, typecheck'i ve eslint'i koştum. Worktree sonra silindi. PR koduna dokunulmadı, merge yapılmadı.

## Soruların cevabı
**(1) Kiracı izolasyonu ve enjeksiyon: TEMİZ.** `getKpiTrend` = `withTenant(tenantId, tx => getKpiTrendIn(tx, …))`. Sorgu aynı interaktif tx'te koşuyor, `set_config('app.tenant_id')` ondan önce çağrılıyor (`src/lib/db.ts:201`). SQL'de `o."tenantId" = ${tenantId}` var, JOIN'de de `p."tenantId" = ${tenantId}`. RLS ayrıca geçerli. Sorgu tagged template ile yazılmış, her değer bind parametresi olarak gidiyor (`pgTimestamp(...)` metin parametresi olup `::timestamp`'e cast ediliyor). String birleştirme yok. Canlı RLS testi (B'ye bağlı tx'te A'nın id'siyle okuma yapılınca hep sıfır dönüyor) bunu RLS katmanında da gösteriyor. `assertRlsSubjectRole` BYPASSRLS olmayan bir rolü zorunlu kılıyor.

**(2) Doğruluk: DOĞRU.**
- Kova sayısı `floor((to−from)/aralık)+1`. Etiketler `from + k·aralık`. SQL'deki `floor(epoch_fark/604800)` ile `>= from AND < end` aynı yarı açık tanımı kullanıyor. Sınırdaki satır `k` kovasına bir kez düşüyor. PG16'da `extract(epoch …)` numeric döndürdüğü için yuvarlama kayması yok.
- Boş kovalar JS döngüsünde `byBucket.get(k) ?? 0` ile dolduruluyor.
- `to < from` durumunda `[]` dönüyor. `resolveDashboardRange` ters aralığı zaten engelliyor.
- `intervalDays`: tek çağıran varsayılan 7'yi kullanıyor. 0 ya da negatif değer sonsuz döngü/sıfıra bölme olurdu, ama eski kodda da öyleydi ve dışarıdan girdi gelmiyor.
- LEFT JOIN çoğaltma yapmıyor: şemada `Proposal.opportunityId String @unique`.
- Filtreler `getKpiMetrics` ile aynı: `deletedAt IS NULL` (Opportunity), `submittedAt IS NOT NULL`, `g0Score IS NOT NULL`. Proposal.deletedAt iki tarafta da filtrelenmiyor, yani tutarlılar.

**(3) Davranış farkı: GÖRÜNÜR REGRESYON YOK.** Yarı açık kova eski çift sayımı kaldırıyor (düzeltme). Sabit ms adımı: `from`, sunucu yerel gece yarısı. DST'li bir TZ'de (ör. Europe/Brussels) eski `setDate` yerel gece yarısını korurdu, yeni kod ilk kovanın UTC ofsetini korur. Her iki durumda `toISOString().slice(0,10)` aynı UTC tarihini veriyor (kış 23:00Z ve yaz 22:00Z ikisi de önceki gün). Yani etiketler aynı, yalnızca kova sınırı 1 saat kayıyor. UTC ve Europe/Istanbul'da (DST yok) hiç fark yok. Not: UTC+3'te etiketin "önceki gün" görünmesi eski kodda da vardı; bu PR'ın konusu değil.

**(4) Testler: ESKİ DAVRANIŞI YAKALIYOR.** Mutasyon denemesi: scratch worktree'de eski döngüyü `getKpiTrendIn` olarak geri koydum. Sonuç `AssertionError: expected 783 to be less than or equal to 2` oldu. `$allOperations` sayacı tx içindeki `count` ve `$queryRaw` çağrılarını sayıyor. Ancak 26 yıllık "5 sn içinde" testi ve sayısal testler eski kodla da GEÇTİ (yerel DB hızlı, ~2 sn). Gerçek regresyon kalkanı sorgu sayısı testidir (bkz. Ö-3). e2e veri temizliği: koşudan sonra `kpitrend-%` tenant 0, `e2e-wide-range-manager` user 0, membership 0. İz kalmadı.

**(5) BigInt/number: DOĞRU.** Tüm sayımlar ve `bucket` `::int` olarak dönüyor, Prisma bunları `number` veriyor. `Number(...)` gereksiz ama zararsız. int taşması 2^31 hafta ötesinde, ulaşılamaz.

## Bulgular (bloke eden YOK)
- **Ö-1 (düşük, öneri): Kova sayısına üst sınır yok.** `src/modules/m5/server/queries.ts` (getKpiTrendIn `buckets`) + `range.ts` (`DATE_PARAM` `\d{4}` kabul ediyor). Senaryo: `?from=1000-01-01` → ~53.000 haftalık kova → ~106.000 nokta RSC payload'a ve grafiğe gidiyor. SQL hızlı kalıyor ama sayfa ve recharts ağırlaşıyor. Eskiden aynı istek zaman aşımına düşüyordu; artık "başarıyla" ağır bir yanıt dönüyor. Yalnız yetkili kullanıcının kendi paneli etkileniyor, güvenlik sorunu değil. Öneri: uzun aralıkta aralığı büyütmek (ör. 2 yıldan uzunsa aylık) ya da `from`'u makul bir alt sınıra kırpmak. Ayrı kart olabilir.
- **Ö-2 (düşük, önceden vardı): Son kova `to`'yu aşıyor.** `end = from + buckets·aralık`, yani son kova `rangeEnd`'den en fazla 6 gün sonrasını sayıyor. Eski kod da `lte intervalEnd` ile aynısını yapıyordu. Senaryo: `to` geçmişte bir tarih, `to`'dan 3 gün sonra 5 fırsat var. Son trend noktası bunları içeriyor ve trend toplamı "Toplam teklif" kartından (`createdAt <= rangeEnd`) büyük çıkıyor. Öneri: WHERE'e `AND o."createdAt" <= ${pgTimestamp(to)}::timestamp` eklemek. Tek satır, sorgu sayısı değişmez.
- **Ö-3 (düşük, test boşluğu): Yarı açık sınır düzeltmesi testle sabitlenmemiş.** `tests/kpi-trend.live.test.ts`: fikstürde tam kova sınırında satır yok, bu yüzden eski (çift sayan) kod sayısal testleri geçiyor. Öneri: `2021-01-11T00:00:00Z`'de bir fırsat ekleyip yalnızca 2021-01-11 kovasında sayıldığını assert etmek.

## Kanıt (ham çıktı)
```
# hedef: shell DATABASE_URL boş → test .env'den: postgresql://fabrika:***@localhost:5433/fabrika, RLS_TEST: fabrika_app@localhost:5433
$ vitest run --root <wt@2b766e44> tests/kpi-trend.live.test.ts
 Test Files  1 passed (1)   Tests  5 passed (5)

# mutasyon: eski 3-count döngüsü getKpiTrendIn olarak geri kondu (yalnız scratch worktree, sonra checkout)
 × a five-year range is read in a bounded number of queries, not one batch per week
AssertionError: expected 783 to be less than or equal to 2
 Tests  1 failed | 4 passed (5)

$ playwright test dashboard-wide-range dashboard-kpi-links   (wt kendi node_modules + next dev)
  ✓ tr/en: every KPI card links … ✓ click/Enter … ✓ no Settings link …
  ✓ a range reaching back to 2000 loads the panel, not the load-error notice (708ms)
  5 passed (14.3s)

$ pnpm typecheck → tsc=0 ;  eslint (4 değişen dosya) → 0
$ psql (yalnız SELECT): kpitrend tenants|0, wide-range user|0, wide-range membership|0 ; PostgreSQL 16.15
```

## Değişen dosyalar
Yalnızca bu rapor. PR koduna dokunulmadı.

## Riskler
Ö-1, Ö-2 ve Ö-3 dışında risk görmedim. e2e'nin eski kodda KIRMIZI olduğunu ben ayrıca yeniden üretmedim (be-fb raporunun iddiası). Birim düzeyindeki kırmızıyı mutasyonla gösterdim.

## Açık sorular
Yok.

## Sonraki adım
Merge kararı lider/kullanıcıda. Ö-2 tek satırlık bir düzeltme, bu PR'a eklenebilir. Ö-1 ve Ö-3 için ayrı bir küçük kart önerilir.

Platform: mac'te doğrulandı. Platforma bağlı kod yolu yok.
