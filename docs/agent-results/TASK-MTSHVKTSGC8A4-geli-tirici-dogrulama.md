# TASK-MTSHVKTSGC8A4 — Bağımsız Doğrulama Raporu (Paket Stüdyosu Vitrini)

**Doğrulayıcı:** geli-tirici  
**Tarih:** 2026-09-08  
**Kart:** `TASK-MTSJZUEJXO2GP`  
**Hedef Kart:** `TASK-MTSHVKTSGC8A4`  
**Hedef Rapor:** [`docs/agent-results/TASK-MTSHVKTSGC8A4-blok-zincir-denet-i.md`](file:///Users/macbook/AgentSpace/fabrika/docs/agent-results/TASK-MTSHVKTSGC8A4-blok-zincir-denet-i.md)  
**Dal:** `dev`  
**Commit:** `2015fac`  
**Nihai Hüküm:** **GEÇTİ**  

---

## 1. Taahhüt Edilen Definition of Done (DoD) Maddeleri

Hedef rapor (`TASK-MTSHVKTSGC8A4-blok-zincir-denet-i.md`) incelenmiş ve aşağıdaki 3 ana DoD maddesi doğrulanmak üzere çıkarılmıştır:

1. **DoD 1 (Vitrinde Yayınlanan Sürüm Okunuyor):**  
   - Fiyat sayfası, faturalandırma paneli, yönetici paneli ve sepet stüdyoda yayınlanan `PlanVersion` satırlarını (`storefrontPlans` / `plansVisibleToTenant` / `listPublicPlans`) okur; statik `catalog.ts` sabitlerine düşmez.
2. **DoD 2 (Görünürlük & Güvenlik Kısıtlaması - Satın Alma Engeli):**  
   - Özel (`private`) paketlerin SKU'su istemci tarafından elle bildirilse bile (`POST /api/billing/checkout` veya `priceLineForTenant`), atanmamış (`unassigned`) kiracıya satılmaz; `PlanNotAvailableError` / 400 hatası döner. İstemci tarafında gönderilen fiyatlar (`price`, `unitAmount`) yok sayılır.
3. **DoD 3 (Sepet Fiyat Çözümlemesi - `/api/billing/quote`):**  
   - `CartContext` kendi istemci tarafı fiyatını hesaplamak yerine `POST /api/billing/quote` sunucu uç noktasına sorar. Sunucu tarafında hesaplanan tutar sepet çekmecesine yansıtılır.

---

## 2. Bağımsız Taze Koşu Çıktıları

### 2.1 Birim Test Koşusu (`pnpm test tests/plan-storefront.spec.ts src/lib/billing/storefront.test.ts`)
```text
$ vitest run --passWithNoTests tests/plan-storefront.spec.ts src/lib/billing/storefront.test.ts

 RUN  v4.1.11 /Users/macbook/AgentSpace/fabrika

 ✓ src/lib/billing/storefront.test.ts (10 tests) 4ms
 ✓ tests/plan-storefront.spec.ts (10 tests) 170ms

 Test Files  2 passed (2)
      Tests  20 passed (20)
   Start at  18:47:30
   Duration  339ms (transform 81ms, setup 0ms, import 145ms, tests 175ms, environment 0ms)
```

### 2.2 Playwright E2E Koşusu (`pnpm exec playwright test tests/e2e/plan-storefront.spec.ts`)
```text
Running 10 tests using 1 worker

  ✓   1 [chromium] › tests/e2e/plan-storefront.spec.ts:99:7 › the studio price is the price the shopfront quotes and charges › the public pricing page quotes the published version, not the catalogue (1.2s)
  ✓   2 [chromium] › tests/e2e/plan-storefront.spec.ts:112:7 › the studio price is the price the shopfront quotes and charges › the tenant's billing panel quotes the same published version (1.1s)
  ✓   3 [chromium] › tests/e2e/plan-storefront.spec.ts:127:7 › the studio price is the price the shopfront quotes and charges › the cart drawer shows the price the server quoted, not one it computed (1.2s)
  ✓   4 [chromium] › tests/e2e/plan-storefront.spec.ts:145:7 › the studio price is the price the shopfront quotes and charges › checkout charges the published version, and ignores a price the client names (33ms)
  ✓   5 [chromium] › tests/e2e/plan-storefront.spec.ts:183:7 › a private plan is neither shown nor sold to a tenant it was not assigned to › it is gone from the public pricing page (1.0s)
  ✓   6 [chromium] › tests/e2e/plan-storefront.spec.ts:193:7 › a private plan is neither shown nor sold to a tenant it was not assigned to › it is gone from an unassigned tenant's billing panel (1.0s)
  ✓   7 [chromium] › tests/e2e/plan-storefront.spec.ts:204:7 › a private plan is neither shown nor sold to a tenant it was not assigned to › and it cannot be bought even when the sku is posted by hand (101ms)
  ✓   8 [chromium] › tests/e2e/plan-storefront.spec.ts:219:7 › a private plan is neither shown nor sold to a tenant it was not assigned to › the plans that are public are still buyable (25ms)
  ✓   9 [chromium] › tests/e2e/plan-storefront.spec.ts:246:7 › a private plan assigned to a tenant is shown and sold to that tenant › the assigned tenant sees it in its billing panel and can be quoted (991ms)
  ✓  10 [chromium] › tests/e2e/plan-storefront.spec.ts:256:7 › a private plan assigned to a tenant is shown and sold to that tenant › but it stays off the public pricing page, which no session backs (846ms)

  10 passed (8.0s)
```

---

## 3. Çürütme Sondaları (Falsifying Probes - Mandatory)

Her DoD maddesinin testi GERÇEKTEN ölçüp ölçmediğini kanıtlamak amacıyla 1 satırlık kasıtlı mutasyon uygulanmış ve testlerin KIRMIZIYA döndüğü doğrulanmıştır:

### 3.1 Çürütme Sondası 1 (DoD 1 - Vitrinde Yayınlanan Sürüm Okunması)
- **Mutasyon:** `src/lib/billing/storefront.ts` içinde `storefrontPlans` fonksiyonundaki DB sorgusu bypass edilerek `const rows: PublishedPlanVersion[] = [];` boş diziye çekildi.
- **Sonuç:** `pnpm test tests/plan-storefront.spec.ts src/lib/billing/storefront.test.ts` derhal **KIRMIZI** verdi (9 test patladı: `the price charged is the published version, not the static catalogue`, `a campaign discount still applies`, `the assigned tenant can see the private plan`...).
- **Geri Alma:** Mutasyon geri alındı, testler 20/20 yeşile döndü.
- **Hüküm:** **GEÇTİ** (Ölçüm geçerli ve hassas).

### 3.2 Çürütme Sondası 2 (DoD 2 - Görünürlük & Güvenlik Kısıtlaması)
- **Mutasyon:** `src/lib/billing/storefront.ts` `priceLineForTenant` fonksiyonunda atanmamış private plan için fırlatılan `if (!plan) throw new PlanNotAvailableError(...)` güvenlik kontrolü bypass edildi.
- **Sonuç:** `pnpm test tests/plan-storefront.spec.ts` derhal **KIRMIZI** verdi (5 test patladı: `and cannot buy it either, even naming the sku by hand`, `an anonymous visitor sees only the public plans`...).
- **Geri Alma:** Mutasyon geri alındı, testler 10/10 yeşile döndü.
- **Hüküm:** **GEÇTİ** (Ölçüm geçerli ve hassas).

### 3.3 Çürütme Sondası 3 (DoD 3 - Sepet Fiyat Çözümlemesi `/api/billing/quote`)
- **Mutasyon:** `src/app/api/billing/quote/route.ts` içinde sepet genel toplam hesabı `totalMinor = lines.reduce((sum, line) => sum + line.totalMinor * 10, 0)` olarak 10 katına çıkarıldı.
- **Sonuç:** `pnpm exec playwright test tests/e2e/plan-storefront.spec.ts` derhal **KIRMIZI** verdi (`the cart drawer shows the price the server quoted, not one it computed` testi `$7.770,00` yerine `$777,00` bekleyerek patladı).
- **Geri Alma:** Mutasyon geri alındı, e2e testleri 10/10 yeşile döndü.
- **Hüküm:** **GEÇTİ** (Ölçüm geçerli ve hassas).

---

## 4. Ekran Görüntüsü ve Zaman Damgası Denetimi

`docs/agent-results/TASK-MTSHVKTSGC8A4-screenshots/` altındaki 7 adet ekran görüntüsü incelendi:
- `01-before-db-ignored.png` (2026-09-08 13:02:31)
- `02-pricing-page-db-price.png` (2026-09-08 16:57:15)
- `03-billing-panel-db-price.png` (2026-09-08 16:57:15)
- `04-private-plan-hidden.png` (2026-09-08 16:57:15)
- `05-private-plan-hidden-panel.png` (2026-09-08 15:47:40)
- `06-private-plan-assigned-visible.png` (2026-09-08 16:57:15)
- `07-cart-server-quoted.png` (2026-09-08 16:57:15)

**Denetim Notu:** Ekran görüntüleri, hedef kart olan `TASK-MTSHVKTSGC8A4` çalışması esnasında (13:02 - 16:57 saatleri arasında) üretilmiştir. Mevcut doğrulama kartı (`TASK-MTSJZUEJXO2GP`, başlama saati 18:47) öncesine aittir.

---

## 5. `pnpm gate` Tam Koşu Çıktısı

```text
> fabrika@0.1.0 gate /Users/macbook/AgentSpace/fabrika
> pnpm db:generate && pnpm lint && pnpm typecheck && pnpm test && pnpm i18n:check && pnpm rls:check && pnpm rls:verify

✔ Generated Prisma Client (v7.10.0)
✔ No ESLint warnings or errors
✔ tsc --noEmit (0 error)
✓ Test Files  113 passed | 2 skipped (115) — 1293 passed
✓ i18n check passed: 207 keys match
✓ rls:check OK — all 50 application models carry tenantId
✓ rls:verify OK — tenant isolation verified against live Postgres RLS policies
```

---

## 6. Yol Üstü Kusurlar (Diğer Alanlar)

Doğrulama sürecinde bu kartın kapsadığı vitrin ve paket stüdyosu mantığı üzerinde herhangi bir kusur tespit edilmemiştir. Target raporda (§5) bahsedilen açık soru ve konular (hak-ediş katmanının `PlanVersion`'a bağlanması) takip kartları olarak ayrıca değerlendirilmelidir.

---

## 7. Madde Bazlı Hükümler ve Sonuç

| DoD Madde | Açıklama | Çürütme Sondası | Hüküm |
| :--- | :--- | :--- | :--- |
| **DoD 1** | Vitrinde yayınlanan `PlanVersion` okunması (`storefrontPlans`) | Sorgu boş diziye çekildiğinde 9 test KIRMIZI verdi | **GEÇTİ** |
| **DoD 2** | Özel paket satın alma engeli & sunucu tarafı fiyat belirleme | Satın alma görünürlük kontrolü kaldırıldığında 5 test KIRMIZI verdi | **GEÇTİ** |
| **DoD 3** | Sepet fiyatının `/api/billing/quote` uç noktasından sorulması | Toplam tutar mutasyonunda e2e cart testi KIRMIZI verdi | **GEÇTİ** |

**NİHAİ HÜKMÜN GEREKÇESİ:**  
Tüm taahhüt edilen Definition of Done maddeleri taze çıktılarla yeniden çalıştırılmış, 3 ayrı çürütme sondası ile testlerin hassasiyeti ve doğruluğu kanıtlanmış, `pnpm gate` tam yeşil geçmiştir. Kartın tüm iddiaları geçerlidir.

**NİHAİ HÜKÜM:** **GEÇTİ**
