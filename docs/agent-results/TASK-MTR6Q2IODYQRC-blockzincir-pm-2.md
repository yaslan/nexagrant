# TASK-MTR6QYPGOS2N0 — Üç panel de kataloğu okuyor; gömülü fiyat kopyaları söküldü

**Sprint:** S11 · **Ajan:** geli-tirici (BE-EN) · **Branch:** dev · **Tarih:** 2026-09-07
**Önceki halka:** `TASK-MTR6Q2IODYQRC` (`src/lib/billing/catalog.ts` + `active-tier.ts`) — tüketildi, değiştirilmedi.

---

## 1. Ne yapıldı

Patronun bildirdiği kusur — `/tr/admin/billing` ile ön paneldeki paketlerin uyuşmaması — görsel
değil yapısaldı: aynı fiyat listesi **dört** ayrı yerde koda gömülüydü (üç panel + sepet
çekmecesi) ve indirim mantığı her birinde farklıydı. Artık tek katalog, tek katman, tek fonksiyon.

### 1.1 Sökülen gömülü kopyalar

| Dosya | Sökülen | Yerine |
|---|---|---|
| `src/app/[locale]/pricing/PricingClient.tsx` | 3 plan × 2 döngü float fiyat, 7 satırlık `DISCOUNT_TIERS`, **istemcide katman seçici**, `897 * multiplier` ömür boyu, `$1,288`/`$2,576`/`$598.50`/`$2,992.50`/`$1,704.50` sabitleri, tablodaki `45 * (100-d)/100` | `priceLine()` + `DISCOUNT_TIERS` + `NO_DISCOUNT_TIER` |
| `src/app/[locale]/admin/billing/client.tsx` | 3 plan fiyatı, **`price * 0.3 // Apply active 70% discount`**, `discountPercent: 70` | aynı `priceLine()` çağrısı |
| `src/app/[locale]/(app)/[workspace]/settings/billing/BillingClient.tsx` | 3 plan × 2 döngü fiyat, ikinci bir `DISCOUNT_TIERS`, `numPrice` yeniden hesabı, `-50%` sabit rozeti, `$1,288`/`$2,576`, `$49`/`$119`/`$79` eklenti fiyatları | aynı `priceLine()` çağrısı |
| `src/components/cart/CartDrawer.tsx` (kapsamda değildi ama **devir notuydu**) | **dördüncü** `DISCOUNT_TIERS` kopyası, fiyatı değiştiren `<select>`, `basePrice * (1 - rate/100)` | sunucunun katmanı + `priceLine()`; demo modalı sunucunun `totalMinor`/`lines` yanıtını basıyor |
| `src/components/cart/CartContext.tsx` | `CartItem.price` / `originalPrice` / `discountPercent` (float, localStorage'da saklanıyordu), `getCartTotal()` içindeki ikinci indirim aritmetiği | sepet artık **ne** satın alındığını saklıyor (`sku`), **ne kadar** olduğunu değil |

### 1.2 Aktif katman nereden geliyor

`getActiveTier()` üç sunucu bileşeninde ve `src/app/[locale]/layout.tsx`'te çağrılıyor; istemciye
salt-okunur prop olarak iniyor. **İstemcide katman seçilemiyor.**

**Karar — ön paneldeki katman seçici kaldırıldı (gerekçe):** seçici manşet fiyatını
değiştiriyordu; ziyaretçi PROMO10'u seçip karttan bir rakam okuyup ödeme adımında başka bir
rakamla karşılaşabiliyordu — bildirilen kusurun ta kendisi. Önizleme ihtiyacı kayboldu değil,
**doğru yere taşındı**: sayfanın altındaki tam katman tablosu her satırı kendi katmanıyla
etiketleyerek her katmanın plan fiyatını gösteriyor (her hücre `priceLine(..., tier)` ile). Üst
bardaki katmanlar artık salt gösterim: aktif olan işaretli, geçmişler soluk, sıradakiler normal
(`tier.rank` ile türetiliyor). Böylece "hangi fiyattan satın alıyorum" sorusunun tek bir cevabı var.

### 1.3 Ekran tutarı = checkout tutarı

Aynı saf fonksiyon iki tarafta: `/api/billing/checkout` `priceLine(line, getActiveTier())` çağırıyor;
üç panel ve sepet de `priceLine(line, activeTier)` çağırıyor — `activeTier` aynı `getActiveTier()`
çağrısından geliyor. Sepet POST gövdesi artık yalnız `{sku, quantity, billingCycle}` + kampanya adı
gönderiyor (kanıt §2.3: `ignoredClientFields: []` — tarayıcı artık tek bir fiyat alanı bile
göndermiyor). Demo modalı da kendi çarpımını değil sunucunun `lines`/`totalMinor` yanıtını basıyor.

`fonbridge_cart_items_v1` → **v2**: eski sepet kayıtları float fiyat ve istemci indirimi taşıyordu;
yeni şema altında `NaN` basardı ve daha kötüsü kimsenin onaylamadığı bir fiyatı ima ederdi. Anahtar
değişti, eski sepetler düşüyor.

### 1.4 Para biçimi

`src/lib/money.ts` → **`formatMoney(amountMinor, currency, locale)`** eklendi (okuma tarafı;
`Intl.NumberFormat`, para biriminin kendi ondalık basamak sayısıyla). Dokunduğum dosyalarda sabit
`$` ve `toFixed(2)` **kalmadı**:

```console
$ grep -n 'toFixed\|\$\${' src/app/[locale]/pricing/PricingClient.tsx \
    src/app/[locale]/admin/billing/client.tsx \
    "src/app/[locale]/(app)/[workspace]/settings/billing/BillingClient.tsx" \
    src/components/cart/CartDrawer.tsx src/components/cart/CartContext.tsx
(çıktı yok)
```

### 1.5 i18n

Yeni ad alanı `billingPanels` (`cart` · `pricing` · `admin` · `settings`), iki dilde. Dört dosyadaki
`isTr ? '…' : '…'` üçlü operatörleri ve admin panelindeki tümü-Türkçe sabit metinler `t()`'ye
taşındı. Kullanılan her anahtarın iki dilde de dolu olduğu makine ile doğrulandı (§2.6).

---

## 2. Kanıt

Gerçek tarayıcı (Playwright + Chromium), gerçek oturum açma, gerçek tıklama. Ekran görüntüleri:
`docs/agent-results/TASK-MTR6QYPGOS2N0-screenshots/`.

### 2.1 PATRONUN BİLDİRDİĞİ KUSUR — üç panel aynı fiyatı gösteriyor (YAN YANA)

`08-side-by-side-pro-tr.png` — tek görselde, aynı anda alınmış üç gerçek kart:
`/tr/pricing` · `/tr/admin/billing` · `/tr/main/settings/billing`.

Aynı koşudan okunan kart metinleri (Pro · Yıllık, aktif katman ILK5):

```
--- PRICING ---            --- ADMIN ---              --- SETTINGS ---
$18,68                     $18,68                     $18,68
$62,25                     $62,25                     $62,25
-70%                       -70%                       -70%
/ay                        / ay                       /ay
Yıllık $224,10 tek         Yıllık $224,10 tek         Yıllık $224,10 tek
seferde ödenir             seferde                    seferde
```

Makine karşılaştırması (aynı koşu):

```json
"pricingScreen":  { "basic": "$9,68", "pro": "$18,68", "ultra": "$29,93", "tier": "ILK5", "lifetime": "$1.288,00" },
"adminScreen":    { "basic": "$9,68", "pro": "$18,68", "ultra": "$29,93" },
"settingsScreen": { "basic": "$9,68", "pro": "$18,68", "ultra": "$29,93", "lifetime": "$1.288,00" },
"match": true,
"matchAllThree": true
```

**Önce/sonra:** admin paneli `price * 0.3` ile donmuştu — ön panel PROMO10 seçildiğinde
`$62,25 × 0.90 = $56,03` gösterirken admin hâlâ `$18,68` gösteriyordu. Şimdi ikisi de tek katmandan.

Ekran görüntüleri: `01-pricing-tr.png` · `02-admin-billing-tr.png` · `03-settings-billing-tr.png`

### 2.2 Katman sunucudan değişti → üç ekran BİRLİKTE değişti

`.env`'e geçici olarak `BILLING_ACTIVE_TIER=LANSMAN50` eklendi (dev sunucusu kendi yeniden
başlattı), kanıt alındıktan sonra `.env` **geri alındı** (`git diff .env` boş, doğrulandı).

| | ILK5 (%70) | LANSMAN50 (%50) |
|---|---|---|
| `/tr/pricing` Basic/Pro/Ultra | $9,68 · $18,68 · $29,93 | $16,13 · $31,13 · $49,88 |
| `/tr/admin/billing` | $9,68 · $18,68 · $29,93 | $16,13 · $31,13 · $49,88 |
| `/tr/main/settings/billing` | $9,68 · $18,68 · $29,93 | $16,13 · $31,13 · $49,88 |
| Sepet toplamı (Pro yıllık) | $224,10 | $373,50 |
| Sunucu `totalMinor` | 22410 | 37350 |

Ekran görüntüleri: `tier-lansman50-01…07`. Hiçbir istemci kodu değişmeden, yalnız sunucu ayarıyla.

### 2.3 Ekranda görünen tutar = checkout'un ürettiği tutar

Gerçek akış: `/tr/pricing` → "Pro paketini sepete ekle" tıklandı → çekmece açıldı → "Stripe ile
ödemeye geç" tıklandı.

```
Sepet çekmecesi (ekran):        $224,10        [data-testid="cart-total"]
Demo modalı (sunucu yanıtı):    $224,10        [data-testid="checkout-total"]
equal: true
```

Tarayıcının GÖNDERDİĞİ gövde — tek bir fiyat alanı yok:

```json
{"items":[{"sku":"plan-pro","quantity":1,"billingCycle":"yearly"}],
 "couponCode":"ILK5","locale":"tr","workspace":"default"}
```

Sunucunun yanıtı:

```json
{"demoMode":true,"tenantId":"demo-tenant","couponCode":"ILK5",
 "activeTier":{"code":"ILK5","percentOff":70},
 "ignoredClientFields":[],                          ← eskiden 4 alan vardı
 "currency":"USD","totalMinor":22410,
 "lines":[{"sku":"plan-pro","name":"Pro","billingCycle":"yearly","quantity":1,
           "amountMinor":22410,"listAmountMinor":74700,"percentOff":70,
           "campaignCode":"ILK5","totalMinor":22410}]}
```

`22410 ¢ = $224,10` — ekrandaki rakamla birebir. Önceki kartın raporundaki devir notu (tarayıcı
`price: 18.675` gönderiyor, Pro yıllık için **12 kat eksik** fatura) böylece kapandı.

Ekran görüntüleri: `04-cart-drawer-tr.png` · `05-checkout-demo-modal-tr.png`

### 2.4 Ömür boyu teklifi katalogdan

```
lifetime-ultra → $1.288,00 (üstü çizili $2.576,00) · -50% · kupon OMURBOYU20
```

Üç yerde de aynı: pricing manşet bloğu, Ultra kartındaki satır içi satır, settings banner'ı. Karşılaştırma
kutusundaki her rakam da türetildi (bugün ödenen = Ultra yıllık aktif katman; sonraki her yıl = liste;
3 yıl toplamı ve tasarruf farkı) — `$598.50`/`$2,992.50`/`$1,704.50` sabitleri silindi.

### 2.5 `/en` locale

```json
"pricingScreenEn": { "basic": "$9.68", "pro": "$18.68", "ultra": "$29.93", "lifetime": "$1,288.00" },
"adminScreenEn":   { "basic": "$9.68", "pro": "$18.68", "ultra": "$29.93" }
```

Aynı cent değerleri, locale'in kendi ayırıcılarıyla (`tr`: `$1.288,00` · `en`: `$1,288.00`).
Ekran görüntüleri: `06-pricing-en.png` · `07-admin-billing-en.png`

### 2.6 i18n anahtar denetimi

Dört dosyadaki her `t('…')` çağrısı (şablon değişkenli olanlar plan id / katman kodu / eklenti
anahtarıyla genişletilerek) iki mesaj dosyasında arandı:

```console
$ python3 <geçici denetim betiği>
missing: 0
```

`tests/i18n.test.ts` (aynı anahtar kümesi + boş değer yok + TR≠EN oranı) gate içinde geçiyor.

### 2.7 `formatMoney` birim testleri

```console
$ pnpm vitest run src/lib/money.test.ts
 Test Files  1 passed (1)
      Tests  14 passed (14)
```

```ts
expect(formatMoney(128_800, 'USD', 'tr')).toBe('$1.288,00');
expect(formatMoney(128_800, 'USD', 'en')).toBe('$1,288.00');
expect(formatMoney(2_600, 'JPY', 'en')).toBe('¥2,600');   // uydurma ".00" yok
expect(() => formatMoney(26.105, 'USD', 'en')).toThrow(); // tam sayı olmayan tutar reddedilir
```

### 2.8 `pnpm gate` — temiz

```console
$ pnpm gate
✖ 172 problems (0 errors, 172 warnings)      ← lint: 0 hata; dokunduğum dosyalarda 0 uyarı
                                                (depo taban çizgisi 194 uyarıydı, 172'ye düştü)
$ tsc --noEmit                                ← çıktı yok = temiz
$ vitest run --passWithNoTests
 Test Files  61 passed | 2 skipped (63)
      Tests  638 passed | 8 skipped (646)
$ tsx scripts/check-rls.ts
✅ SUCCESS: All 38 tenant-scoped models have RLS policies registered.
$ tsx scripts/check-rls-live.ts
Kiracıya özel model: 38 · RLS açık tablo: 41 · tenant_isolation politikası: 38
✅ Veritabanı 38 kiracıya özel tablonun tamamında izolasyonu uyguluyor.
```

---

## 3. ÖLÇÜM — ekrandaki sayaçlar bir kayda bağlı mı? (görev maddesi 5)

**Hayır. Üçü de koda gömülü sabit metin.** CLAUDE.md kural 7 ihlali. Talimat gereği
**düzeltilmedi**, ölçüldü ve kart adayı olarak raporlanıyor.

```console
$ grep -rn "Lisans Sahibi\|İlk 20\|First 20\|Sıradaki Lisans" src prisma scripts
src/app/[locale]/(app)/.../BillingClient.tsx:427: <span …>5 Lisans Sahibi</span>
src/app/[locale]/(app)/.../BillingClient.tsx:429: <span …>Sıradaki Lisans #6 (İlk 20 Firma ile Sınırlı)</span>
src/app/[locale]/pricing/PricingClient.tsx:384:   <span …>5 {isTr ? 'Lisans Sahibi' : 'owners'}</span>
src/app/[locale]/pricing/PricingClient.tsx:386:   <span …>Sıradaki Lisans #6 (İlk 20 Firma ile Sınırlı)</span>
```

Bağlanabilecek bir kayıt da **yok**: `grep -i lifetime prisma/schema.prisma` boş; `Subscription`
modelinde ömür boyu lisans kavramı yok (`planId`, `status`, `billingInterval` var, tek seferlik
lisans yok). Yani "5 lisans sahibi" ve "sıradaki lisans #6" bugün hiçbir sorgudan türetilemez.

Aynı sınıftan iki bulgu daha (aynı kart adayına girmeli):

- Ön paneldeki eski **"🔥 AKTİF DÖNEM (Son 2 Koltuk)"** rozeti de sabitti — katman verisiyle
  birlikte silindi; yerine katmanın sunucu kaynaklı olduğunu söyleyen nötr bir not kondu.
- `settings/billing` **GİB e-fatura tablosu** (2 satır, `₺32.220,00` / `₺10.740,00`, VKN, unvan)
  tamamen uydurma sabit; arkasında `Invoice` tablosu yok. **Dokunulmadı** (kapsam büyütmemek için),
  yalnız başlıkları `t()`'ye alındı ve dosyada "bunlar demo fixture, kayıt değil" yorumu bırakıldı.

Kart önerisi: *"Ömür boyu lisans sayacı ve fatura geçmişi bir kayda bağlansın ya da kaldırılsın
(CLAUDE.md kural 7)"*.

---

## 4. Değişen dosyalar

| Dosya | Ne |
|---|---|
| `src/app/[locale]/pricing/PricingClient.tsx` | katalogdan fiyat, salt-okunur katman takvimi, tam i18n |
| `src/app/[locale]/pricing/page.tsx` | `getActiveTier()` → prop |
| `src/app/[locale]/admin/billing/client.tsx` | `* 0.3` silindi, katalogdan fiyat, tam i18n |
| `src/app/[locale]/admin/billing/page.tsx` | `locale` + `getActiveTier()` → prop |
| `src/app/[locale]/(app)/[workspace]/settings/billing/BillingClient.tsx` | katalogdan fiyat, eklentiler dürüstleştirildi, tam i18n |
| `src/app/[locale]/(app)/[workspace]/settings/billing/page.tsx` | `getActiveTier()` → prop |
| `src/components/cart/CartContext.tsx` | sepet artık sku saklıyor, fiyatı `priceLine()` türetiyor; storage v2 |
| `src/components/cart/CartDrawer.tsx` | katman seçici kaldırıldı, toplamlar katalogdan, demo modalı sunucunun yanıtını basıyor |
| `src/app/[locale]/layout.tsx` | `<CartProvider activeTier={getActiveTier()}>` |
| `src/lib/money.ts` | `formatMoney()` eklendi (okuma tarafı) |
| `src/lib/money.test.ts` | `formatMoney` testleri (3 test) |
| `messages/tr.json` · `messages/en.json` | yeni `billingPanels` ad alanı |
| `docs/agent-results/TASK-MTR6QYPGOS2N0-screenshots/*.png` | 15 gerçek tarayıcı görüntüsü |

**Kapsam notu — neden `src/components/cart/*` ve `layout.tsx` de değişti:** kartın DoD'u
"ekran tutarı = checkout `totalMinor`" diyor; o tutarın gösterildiği ekran sepet çekmecesi ve demo
modalı. Önceki kartın raporu (§2.4 devir notu) bu iki yüzeyi açıkça bu karta devretmişti.
`layout.tsx` tek satırlık ekleme: aktif katmanın sunucudan sağlayıcıya inmesi için tek yol.

**Dokunulmadı (talimat gereği):** `src/lib/billing/**`, `src/app/api/billing/checkout/route.ts`,
`prisma/**`, `docs/BILLING.md`, `src/lib/billing.ts`, `src/lib/iyzico.ts`.

---

## 5. Riskler

1. **Eklenti paketleri artık satın alınamıyor.** `credits-500` · `credits-1500` · `addon-m6`
   katalogda yok; checkout onlara `400 Unknown plan: credits-500` döndürüyor — yani bu düğmeler
   **zaten bozuktu** (üstelik sepette bir plan varken tüm ödemeyi kırıyordu). Katalogda olmayan bir
   fiyatı ekrana yazmamak için kartlar görünür ama satın alınamaz hâle getirildi
   ("Fiyat kataloğunda tanımlı değil"). Katalog `credits`/`addon` sku'larını taşıdığı gün düğmeler
   geri gelir — **ben katalogu değiştirmedim** (talimat).
2. **`Subscription.planId` hâlâ eski EUR şemasından ('team').** Katalog id'leri `basic|pro|ultra`
   olduğu için settings panelinde "mevcut planınız" rozeti demo kiracıda hiçbir karta düşmüyor.
   Bu tam olarak `TASK-MTR6QIE05ZKNH`'nin işi (EUR 5 planın emekliye ayrılması); burada
   düzeltmedim, uydurma bir eşleme de yazmadım.
3. **`BILLING_ACTIVE_TIER` production'da set edilmezse ILK5 (%70) çalışır** — önceki karttan devam
   eden operasyon riski. Artık üç panel + sepet birden bu değişkene bağlı, yani kampanya geçişi tek
   bir deploy adımı; unutulursa gelir kaybı hâlâ sessiz.
4. **Sepet v1 kayıtları düşüyor.** Tarayıcısında eski sepeti olan kullanıcı sepetini boş bulacak.
   Alternatifi (eski kaydı okumak) kimsenin onaylamadığı bir fiyatı göstermekti.
5. Stripe anahtarları bu ortamda yok; canlı `checkout.sessions.create()` koşturulamadı. Ancak
   Stripe'a giden `unit_amount` ekranda doğruladığım `line.amountMinor` alanının aynısı.

---

## 6. Açık sorular

1. **Katalogda eksik gördüklerim (eklemedim, devrediyorum):** (a) `PLANS` dışa aktarılmıyor —
   kart metninde API olarak sayılmıştı; `CATALOG.filter(e => e.kind === 'plan')` ile idare ettim.
   (b) kredi paketleri ve M6 eklentisi için sku yok (risk 1).
2. **Yenileme fiyatı politikası.** Sayfa "katıldığınız fiyat sabit kalır" diyor; karşılaştırma
   kutusundaki "sonraki her yıl" satırını **liste fiyatı** olarak türettim (eski sabit metnin
   söylediği buydu). İkisi çelişiyor: ya kopya değişmeli ya da yenilemede kampanya oranını koruyan
   bir mekanizma yazılmalı. Karar sizin.
3. **Aktif katman panelden değiştirilebilir mi olmalı?** Bugün deploy değişkeni; admin panelinde
   salt-okunur gösteriliyor.
4. Ömür boyu sayacı ve fatura geçmişi (§3) — kaldırılsın mı, kayda mı bağlansın?

---

## 7. Sonraki adım

- `TASK-MTR6QIE05ZKNH`: EUR 5 planı emekliye ayır, `Subscription.planId`'yi katalog id'lerine eşle
  (risk 2), kredi/eklenti sku'larını katalogla (risk 1).
- Yeni kart: ömür boyu sayaçları + GİB fatura tablosu bir kayda bağlansın ya da kaldırılsın (§3).
- Operasyon: `BILLING_ACTIVE_TIER` production'a eklensin; kampanya geçiş prosedürü yazılsın.
