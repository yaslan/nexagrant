# TASK-MULQK8IRX9GSN — FB marketplace sipariş güvenlik düzeltmesi (be-fb)

Repo: `/Users/macbook/alan/FONBRIDGE`, dal `dev`. **Push yapılmadı**, push devop-fb'nin kartında.

## 1. Ne yapıldı

- **`orderMarketplaceService`** (`src/modules/marketplace/server/actions.ts`) artık fiyat parametresi almıyor. İşin çekirdeği yeni `src/modules/marketplace/server/orders.ts` dosyasında: `placeMarketplaceOrderOn(client, buyerTenantId, listingId)`.
  - İlan satıcı kiracıya ait. Alıcının `withTenant`'ı içinde `fabrika_app` rolü ilanı **göremiyor** (canlı ölçüldü). Bu yüzden okuma `withSystemScopeOn(…, 'tenant-discovery', …)` ile yapılıyor ve yalnız `id, tenantId, status, price` alanlarını çekiyor. Yazma alıcının `withTenantOn(buyerTenantId)` kapsamında.
  - Fiyat `MarketplaceListing.price` serbest metninden okunuyor ve `Int` minor unit + currency'ye çevriliyor (`toMinorUnits`, kural 9). Kabul edilen biçimler: `1500`, `1500.50`, `1,500`, `12,500.00`; önde ya da sonda €/$/£/₺ veya EUR/USD/GBP/TRY/TL olabilir. Para birimi yoksa EUR sayılıyor. **Belirsiz değerler reddediliyor, tahmin edilmiyor:** `€2.500` (2500 mü, 2,5 mu?), `2,50`, `Görüşülecek`, `Negotiable`, 0 ve negatif tutarlar.
  - Komisyon sunucuda hesaplanıyor: `payout = applyPercentDiscount(total, 10)`, `fee = total − payout`. Tamsayı aritmetiği kullanılıyor, fee + payout her zaman total'e eşit.
  - Ret kodları (`{success:false, code}` olarak dönüyor, throw edilmiyor):
    - `LISTING_NOT_FOUND`: ilan yoksa **ya da** aktif değilse. Tek kod kullanılıyor ki cevap, başka kiracının yayında olmayan ilanının var olduğunu belli etmesin.
    - `OWN_LISTING`: alıcı kendi ilanını sipariş ediyorsa.
    - `PRICE_NOT_FIXED`: ilanın sabit fiyatı yoksa.
  - Oturumda kiracı yoksa `requireTenantAction` fırlatıyor; bu durumda hiçbir okuma yapılmıyor.
- **İstemci** (`marketplace/client.tsx`) artık fiyat göndermiyor. Toplam `formatMoney` ile yerel biçimde gösteriliyor, ret nedeni `role="alert"` kutusunda çıkıyor. i18n: `m8.orderModal.refused.*` (en/tr) eklendi, `totalAmount` içindeki sabit `€` kaldırıldı.
- **Bypass taban çizgisi**: `scripts/tenant-bypass-baseline.json` dosyasına CHECK D girdisi eklendi (`orders.ts`, `tenant-discovery`, gerekçesiyle birlikte).
- **Kartın 4. maddesi** (commit'lenmemiş diğer değişiklikler): `getEntitlements(tenantId, tx?)` + `access.ts` içindeki `withTenant` sarmalı + `module-plan-gate` test güncellemesi ayrı bir commit oldu. `stripeEventCleanup` kaydı da ayrı bir commit oldu.

### Commit'ler (hepsi TASK kodlu, `git add -A` yok)
```
c8dcef26 fix(gate): restore the marketplace order CHECK D baseline entry (TASK-MULQK8IRX9GSN)
2e932ca0 fix(rls): scope the three billing bypasses; baseline pruned (TASK-MULQKFER4MF0Y)   ← komşu ajan
e40b5c72 chore(inngest): register the stripe-event-cleanup job (TASK-MULQK8IRX9GSN)
0b52298a fix(modules): read entitlements inside the tenant scope in checkModuleAccess (TASK-MULQK8IRX9GSN)
e8a6b8e3 fix(marketplace): price orders from the listing and persist them (TASK-MULQK8IRX9GSN)
e56810b7 feat(db): MarketplaceOrder table, migration and RLS policy (TASK-MULQK8IRX9GSN)
```
Paylaşılan ağaç notu: çalışırken komşu ajan (TASK-MULQKFER4MF0Y) kendi billing dosyalarını index'e aldı. Commit'lerimi geçici bir `GIT_INDEX_FILE` üzerinden yalnız kendi yollarımla kurdum, onların staging'ine dokunmadım. Sonra komşunun 2e932ca0 commit'i, benim girdimden önce stage edilmiş bir baseline sürümünü yazdı ve CHECK D girdimi HEAD'den düşürdü. c8dcef26 girdiyi aynen geri ekliyor; onların prune işi korunuyor.

## 2. Kanıt

Aşağıdaki tüm koşular HEAD `c8dcef26` üzerinde, çalışma ağacı HEAD ile aynıyken yapıldı (yalnız benim olmayan `FON_BRIDGE.md` izlenmiyor).

```
pnpm typecheck        → TYPECHECK_OK
pnpm lint             → LINT_OK
pnpm rls:check        → RLSCHECK_OK
pnpm rls:bypass-check → ✅ SUCCESS: no new tenant bypass. 1 call site(s) allowed …, 24 on the sanctioned cross-tenant path, 0 still owed.
pnpm rls:verify       → ✅ 47 kiracıya özel tabloda politika yerinde ve izolasyon fabrika_app rolüyle GERÇEKTEN ölçüldü …
pnpm i18n:check       → ✅ i18n check passed

set -a; source .env; set +a; pnpm test
 Test Files  167 passed | 2 skipped (169)
      Tests  1966 passed | 8 skipped (1974)
```
**Atlanan testler: 8.** Hepsi bu işle ilgisiz, önceden var olan K1 adapter testleri: `tests/adapters.test.ts` (2), `tests/k1-daily-calls.test.ts` (4), `tests/sedia-adapter.test.ts` (2). Yeni canlı testin atlanmadığı verbose çıktıda görülüyor, 8 testin hepsi ✓.

**Canlı RLS testi** (`tests/marketplace-order.live.test.ts`, `DATABASE_URL_RLS_TEST` = `fabrika_app`, `rolbypassrls=false` teste başlamadan doğrulanıyor), 8/8 geçti:
- alıcının kendi kapsamında satıcının ilanı görünmüyor (`null`); bu karşı-olgu testi;
- başarılı sipariş: satır admin handle'ı ile geri okunuyor → `totalAmountMinor 250000`, `platformFeeMinor 25000`, `payoutAmountMinor 225000`, `EUR`, `tenantId=buyer`, `sellerTenantId=seller`;
- sipariş yalnız alıcıya görünüyor; satıcı kapsamı ve kapsamsız okuma `null` dönüyor;
- alıcı kapsamında başka kiracı adına INSERT → DB `row-level security` ile reddediyor;
- var olmayan ilan / başka kiracının `unlisted` ilanı / `Görüşülecek` fiyatlı ilan → ret, sipariş sayısı değişmiyor;
- satıcı kendi ilanını sipariş edemiyor.

**Mutasyon koşusu:** keşif okuması alıcının `withTenantOn`'una çevrildiğinde `Tests 3 failed | 5 passed (8)` çıktı. Testin gerçekten ölçtüğü görülüyor. Dosya `git checkout` ile geri alındı; o sırada commit'liydi, kayıp yok.

**Birim testleri** (`tests/modules/marketplace.test.ts`, 30/30):
- fiyat manipülasyonu: `priceAmountEUR: 1` gönderiliyor → yazılan tutar `200000` (ilandan geliyor);
- var olmayan ilan, başka kiracının yayında olmayan ilanı, kendi ilanı, sabit fiyatsız ilan ve oturumsuz istek → ret, `orderCreate` çağrılmıyor;
- `parseListingPrice` için 7 kabul ve 10 ret vakası.

**Migration idempotency** (`fabrika-postgres`, zaten uygulanmıştı, iki kez daha koşuldu):
```
run 1 psql exit=0
run 2 psql exit=0
relrowsecurity|relforcerowsecurity = t|t ; policies: system_scope, tenant_isolation
```
Geri alma: `prisma/migrations/add-marketplace-order.down.sql` (`DROP POLICY IF EXISTS …; DROP TABLE IF EXISTS "MarketplaceOrder";`).
Test sonrası artık kalmadı: `Tenant slug like 'mulqk8-%'` = 0, `MarketplaceOrder` = 0.

## 3. Değişen dosyalar
- `prisma/schema.prisma`, `prisma/rls.sql`, `prisma/migrations/add-marketplace-order.sql`, `…down.sql`, `src/types/db-rows.ts`
- `src/modules/marketplace/server/orders.ts` (yeni), `src/modules/marketplace/server/actions.ts`
- `src/app/[locale]/(app)/[workspace]/marketplace/client.tsx`, `messages/en.json`, `messages/tr.json`
- `tests/modules/marketplace.test.ts`, `tests/marketplace-order.live.test.ts` (yeni)
- `scripts/tenant-bypass-baseline.json` (yalnız `orders.ts` girdisi)
- `src/lib/billing.ts`, `src/lib/modules/access.ts`, `tests/modules/module-plan-gate.test.ts`
- `src/lib/inngest/jobs/index.ts`

## 4. Riskler
- **UI'dan sipariş verilemiyor.** Marketplace sayfası yalnız kiracının **kendi** ilanlarını listeliyor (`listTenantListings`, TASK-MTVTQTJIQ5SDB). Kendi ilanını sipariş etmek artık `OWN_LISTING` ile reddediliyor, bu yüzden bugün arayüzden sipariş vermenin yolu yok. Bu kasıtlı: çapraz kiracı vitrin kararı açık bir ürün sorusu. Karar verilince okuma için yeni bir fonksiyon yazılacak (listings.ts başlığında da böyle yazıyor).
- Fiyat metni ayrıştırıcısı bilinçli olarak dar tutuldu. `€1,500 / hour` gibi birim fiyatlar ve `2.500` gibi Avrupa binlik biçimi `PRICE_NOT_FIXED` alıyor. Satıcı bunu fiyatın "görüşülecek" olduğu şeklinde görecek. Kalıcı çözüm, ilana yapısal `priceAmountMinor` + `currency` kolonları eklemek (ayrı kart).
- `withSystemScope` yolu `fabrika_app`'in `set_config`'i doğrudan çağırabildiği bilinen sınırı taşıyor (system-scope.ts başlığında belgeli). Bu değişiklik o sınırı genişletmiyor.
- Ödeme/escrow akışı yok. Sipariş `CONFIRMED` olarak yazılıyor ve para tahsil edilmiyor; bu davranış eski sahte onayla aynı.

## 5. Açık sorular
- Vitrin kararı: alıcılar başka kiracıların aktif ilanlarını nerede görecek? Sipariş akışının UI'da işe yaraması buna bağlı.
- İlana yapısal fiyat kolonu eklensin mi? Önerim evet: serbest metinden fiyat okumak bir geçiş çözümü.

## 6. Sonraki adım
- devop-fb push'u yapacak (bu kart push etmedi).
- Vitrin kararından sonra e2e "mutlu yol" testi yazılmalı: başka kiracının ilanını sipariş et, onay modalında tutarı gör. Bugün UI yolu olmadığı için gerçek tıklama e2e'si **koşulamadı**. Doğrulama sunucu tarafında canlı DB testi ile yapıldı.

## Platform beyanı
Doğrulama **macOS** (Darwin 27) üzerinde, Docker `fabrika-postgres` :5433 ile yapıldı. Değişen kod platformdan bağımsız: süreç, dosya yolu, kabuk ya da ikili adı içermiyor; yalnız Prisma/Postgres ve React kullanıyor. Windows ve Linux'ta davranış aynı olmalı. Bu platformlarda **koşulmadı**, çünkü bu makinede yalnız mac var.

## Kapanış doğrulaması (29.09)

HEAD `5264aae0` (dev). Aradaki komşu commit'lere (6dfd76e5, 5264aae0, 146a0e70) dokunulmadı. `git diff --quiet HEAD -- src/modules/marketplace` temiz: mutasyon koşusundan sonra geri alma tam.

```
pnpm typecheck        → TYPECHECK_OK
pnpm lint             → exit=0
pnpm rls:bypass-check → ✅ SUCCESS: no new tenant bypass. 1 call site(s) allowed with a recorded reason, 24 on the sanctioned cross-tenant path, 0 still owed.   exit=0
pnpm exec vitest run marketplace              → Test Files 4 passed (4) · Tests 50 passed (50)
pnpm exec vitest run marketplace system-scope → Test Files 5 passed (5) · Tests 56 passed (56)
```
(`DATABASE_URL_RLS_TEST` yüklü, yani canlı `marketplace-order.live.test.ts` atlanmadan koştu.)

Not: `pnpm test -- marketplace` filtreyi uygulamıyor, tüm paketi koşuyor (`vitest run --passWithNoTests -- marketplace`). Hedefli koşu için `pnpm exec vitest run marketplace` kullanıldı.

**İstenen kapıların hepsi yeşil.** Tüm paket koşusunda bu işle ilgisi olmayan, ortama bağlı iki bulgu çıktı:
1. `.env` 28.09 23:55'te değişmiş. Artık zsh'da `source .env` 58. satırda (`EMAIL_FROM`, tırnaksız değer) `parse error` veriyor ve sonraki değişkenler, `DATABASE_URL_RLS_TEST` dahil, yüklenmiyor. Bu yarım ortamda `tests/system-scope.live.test.ts > inside the path, the same read spans tenants` 1 test kırıldı. Ortam tam yüklenince (satır satır ayrıştırarak) aynı test geçiyor.
2. Ortam tam yüklenince `src/lib/calendar/__tests__/encryption.test.ts > reports whether calendar encryption key is configured` kırılıyor (`Tests 1 failed | 1965 passed | 8 skipped (1974)`). Kök neden: `resolveEncryptionKey`, modül yüklenirken ayrıştırılan `env.CALENDAR_ENCRYPTION_KEY`'yi okuyor. Test yalnız `process.env`'i siliyor. `.env`'e yeni eklenen `CALENDAR_ENCRYPTION_KEY` (67. satır) bu kırılganlığı görünür yapıyor. Marketplace koduyla bağı yok, bu kartta düzeltilmedi. leed-fb'ye bildirildi.

`pnpm prettier` bu repoda kurulu değil (`Command "prettier" not found`), biçimlendirme adımı atlandı.

Rapor, repo dışındaki `/Users/macbook/alan/docs/agent-results/` konumundan buraya taşındı. Eski kopya silindi.

Platform: macOS (Darwin 27). Windows ve Linux'ta koşulmadı, çünkü bu makinede yalnız mac var.
