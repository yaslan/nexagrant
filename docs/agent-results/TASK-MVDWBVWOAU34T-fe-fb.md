---
sözleşme: 3
biçim: html
sayfa: TASK-MVDWBVWOAU34T-fe-fb.html
görev: TASK-MVDWBVWOAU34T
kod: FO-88
ajan: fe-fb
motor: claude-opus-5-5
tip: diğer
okur: kullanıcı
hüküm: "Bitti: Pro ile Basic yer değiştirdi (Basic · Pro · Ultra; TR/EN, masaüstü+375px), sıra tek sabitte (PLAN_DISPLAY_ORDER), fiyat/veri/önerilen vurgusu değişmedi; gate yeşil, PR #110 açık."
platform: mac (darwin 27), Google Chrome (Playwright channel=chrome) üzerinde koşuldu. Windows ve Linux koşulmadı: değişiklik sunucu tarafında saf bir dizi sıralaması ve işletim sistemine bağlı bir kod yolu yok. Sayfa her tarayıcıya aynı HTML sırasını gönderir.
sürüm: 1
kod_sürümü: "dal fe-fb/fo88-pricing-order, commit c7e477d4 (base origin/dev 537a351f), PR #110"
tarih: 2026-10-18T14:33:13.058Z
---

# FO-88: Fiyatlandırma sayfasında Pro ve Basic kartlarının yeri değişti

## Kararlar

```karar
kimlik: karar-1
soru: Fiyatlandırma kartlarının sırası hangisi olsun? (:3000 Pro · Basic · Ultra gösteriyordu; isteği buna göre yorumladım.)
seçenek: A | Basic · Pro · Ultra (uygulandı, PR #110)
seçenek: B | Pro · Basic · Ultra (PLAN_DISPLAY_ORDER'da tek satır değişir)
öneri: A
karar_kimligi: K-569521
```

Kart sırası hiçbir yerde tanımlı değildi. Plan sorguları orderBy kullanmıyordu, kartlar Postgres heap sırasıyla geliyordu ve bu sıra her upsert'te değişebiliyordu. :3000 Pro · Basic · Ultra gösteriyordu, taze seed Basic · Pro · Ultra veriyor.
Değişiklik: PLAN_DISPLAY_ORDER = ['basic','pro','ultra'] ve kararlı bir sortForDisplay, pricing/page.tsx'te hem kartlara hem kampanya tablosu hücrelerine uygulanıyor. Listede adı geçmeyen planlar sona, geliş sırasıyla eklenir.
Kanıt: TR/EN önce/sonra kareleri masaüstü ve 375px'te. Unit testler 5/5, yeni e2e 6/6; eski kodla koşan mutant 6/6 kırmızı. Pre-push gate: vitest 4832/0 (54 skip), e2e 374/0 (9 skip). Diff 4 dosya; şema, fiyat, billing ve i18n dosyası yok.
PR: https://github.com/yaslan/fonbridge/pull/110 (base dev). GitHub CI fatura sorunu yüzünden başlamıyor; kanıt yerel koşu.


# TASK-MVDWBVWOAU34T (FO-88): Fiyatlandırma kart sırası (fe-fb)

## Ne yapıldı
1. **Sıra nereden geliyordu?** Hiçbir yerden. `src/lib/billing/plan-repository.ts` → `listPublicPlans` ve `plansVisibleToTenant` `prisma.plan.findMany` çağrısını `orderBy` olmadan yapıyor. `storefront.ts` ve `PricingClient.tsx` (`cards.map`) sırayı olduğu gibi aktarıyor. Sonuçta kartlar Postgres heap (ctid) sırasıyla geliyordu. Ölçüm:
   - :3000 (ortak DB) → `plan-card-pro, plan-card-basic, plan-card-ultra`. ctid: free(0,3) pro(0,15) basic(0,19) ultra(0,40).
   - Taze seed (izole DB) → basic, pro, ultra.
2. **Değişiklik, tek yerde:** `src/app/[locale]/(public)/pricing/plan-display-order.ts`.
   - `PLAN_DISPLAY_ORDER = ['basic','pro','ultra']` ve kararlı (stable) bir `sortForDisplay`. Listede olmayan planlar sona, geliş sırasıyla eklenir.
   - `pricing/page.tsx` sıralamayı hem `cards`'a hem `tierSchedule[].cells`'e uygular. Kampanya tablosunun sütun başlıkları kartlardan geliyor; hücreler de sıralanmazsa fiyatlar başka planın başlığı altına düşerdi.
   - `/tr/fiyatlandirma` aynı `PricingPage`'i render ettiği için üç URL de aynı sırayı alıyor. DB'ye alan eklenmedi; storefront, katalog ve fiyat koduna dokunulmadı.
3. **Testler:**
   - `plan-display-order.test.ts` (5 test).
   - `tests/e2e/pricing-card-order.spec.ts`: 3 URL × {1440, 375}. DOM sırası, ekrandaki konum sırası, Pro'nun tek "önerilen" kart olması ve tablo sütun sırası kontrol ediliyor.
   - Fiyatlandırma sırasını doğrulayan başka bir test yoktu.

## Kanıt (ham çıktı)
- **Önce / sonra** (izole DB'de :3000'in sırası no-op `UPDATE` ile yeniden üretildi; önce = HEAD `page.tsx`, sonra = yeni kod; aynı sunucu ve aynı DB):
```
before /tr/fiyatlandirma desktop  pro,basic,ultra | $62,25 $32,25 $99,75 | rec=plan-card-pro | sched=Pro,Basic,Ultra
before /en/pricing m375           pro,basic,ultra | $62.25 $32.25 $99.75 | rec=plan-card-pro
after  /tr/fiyatlandirma desktop  basic,pro,ultra | $32,25 $62,25 $99,75 | rec=plan-card-pro | sched=Basic,Pro,Ultra
after  /tr/fiyatlandirma m375     basic,pro,ultra | $32,25 $62,25 $99,75 | rec=plan-card-pro | ovf=false
after  /tr/pricing desktop|m375   basic,pro,ultra | aynı
after  /en/pricing desktop|m375   basic,pro,ultra | $32.25 $62.25 $99.75 | rec=plan-card-pro | ovf=false
```
- **Tablo hizası** (EN, ILK5 satırı): `ILK5 | $13.50 | $26.10 | $44.10`. Bu değerler Basic 4500, Pro 8700 ve Ultra 14700 cent'in %30'u, yani her fiyat kendi sütununda.
- **Gerçek tıklama:** 375px'te ilk karttaki "Basic paketini sepete ekle" / "Add Basic to cart" düğmesine tıklandı. Sepette `{"sku":"plan-basic",...}` oluştu (TR ve EN).
- **Unit test:** `plan-display-order.test.ts` 5 passed.
- **e2e:** `pricing-card-order.spec.ts` 6 passed. Mutant (eski `page.tsx`) 6/6 ✘ (`Expected - 1 / Received + 1`). `BILLING_ACTIVE_TIER=ILK5` ile `price-lock-deeper-campaign` ve order spec'i 7 passed.
- **Fiyatlandırma ile ilgili e2e:** plan-storefront, price-lock, price-lock-deeper-campaign, public-shell ve order spec'i 23 passed, 1 skipped. Atlanan test ILK5 bekliyor, yukarıda ILK5 ile ayrıca geçti.
- **`pnpm lint`:** 0 hata. 4 uyarı, hepsi dokunulmayan dosyalarda (accept.ts, concept-template-tenant.ts, settings-profile-update.test.ts).
- **`pnpm typecheck`:** temiz.
- **Pre-push `pnpm gate`** (izole DB, `E2E_PORT=3089`, `--no-verify` yok):
  - `Test Files 365 passed | 2 skipped`, `Tests 4832 passed | 54 skipped`.
  - e2e `374 passed (8.9m)`, `9 skipped`.
  - `check-orphan-alerts` geçti; push `EXIT=0`.
  - vitest'teki 54 skip: evidence S3/MinIO 43, user-erasure-object-store 2, k1-daily-calls 4, sedia/adapters 4, gerçek OpenAI 1. `check-live-skips` hepsini izinli saydı.
  - İlk push denemesi, ikinci bir izole DB'de GRANT eksikliği yüzünden 282 kırmızıyla düştü. Kod hatası değildi: `setup-rls-role.ts` rol küme genelinde zaten varsa yeni DB'ye GRANT vermiyor. `rls-app-role.sql` uygulanınca ikinci koşu tamamen yeşil geçti.
- **Diff:** 4 dosya, +168/−2. `prisma/`, `src/lib/billing`, `messages/` ve `PricingClient.tsx` altında değişen dosya yok.

## Değişen dosyalar
- `src/app/[locale]/(public)/pricing/page.tsx`
- `src/app/[locale]/(public)/pricing/plan-display-order.ts` (yeni)
- `src/app/[locale]/(public)/pricing/plan-display-order.test.ts` (yeni)
- `tests/e2e/pricing-card-order.spec.ts` (yeni)
- Kanıt: `docs/agent-results/TASK-MVDWBVWOAU34T/` (8 PNG + rapor.html). Karelerde sticky navbar ve Next dev rozeti yalnız kare için CSS ile gizlendi.

## Riskler
- **Yön yorumu:** :3000 o an Pro · Basic · Ultra gösteriyordu, bu yüzden isteği "Basic · Pro · Ultra yap" diye yorumladım. Patron isteği yazdığında (14:03) heap sırası farklıysa, yani Basic öndeyse, istenen Pro · Basic · Ultra olabilir. Değişiklik tek satır; karar kutusu açıldı.
- Ayarlar → Faturalama paneli ve admin billing aynı `readStorefront`'u kullanıyor ve hâlâ heap sırasında. Kart pricing sayfasıyla sınırlı olduğu için onlara dokunmadım. İstenirse aynı sabit orada da kullanılabilir.
- Ortak DB'de sızmış bir public plan var: `padm-1792237856437-fs9t1g` "Admin Test Plan" (plan-admin testinden kalmış). :3088'de ortak DB'ye bağlıyken kart olarak görünüyordu. Yeni kural onu sona koyar. Temizliği ayrı bir iş.
- GitHub CI hesap ödeme/harcama limiti yüzünden başlamıyor. Kanıt yerel tam gate.

## Açık sorular
- Sıra yönü: karar kutusunda.

## Sonraki adım
- PR #110'un incelenip merge edilmesi. Canlıya alma sırası önemsiz: migration yok, yalnız kod.
- İstenirse billing panelleri için ayrı kart açılabilir.

Platform: mac (darwin 27), Chrome. Windows ve Linux koşulmadı; işletim sistemine bağlı kod yolu yok.

Bu raporun sayfası: TASK-MVDWBVWOAU34T-fe-fb.html (AgentSpace Raporlar sekmesinde açılır).
