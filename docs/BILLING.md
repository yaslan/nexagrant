# BILLING.md — Planlar, eklentiler, yetkilendirme, ödeme

> **Rakamların tek kaynağı `src/lib/billing/catalog.ts`'tir.** Bu doküman o
> dosyayı anlatır; ondan farklı bir rakam görürsen doğru olan katalogdur ve bu
> doküman hatalıdır. `Plan` tablosu (`prisma/seed.ts` §2), yetkilendirme
> hesabı (`src/lib/billing.ts`) ve modül manifestolarının `planTiers` alanı da
> aynı dosyadan **türetilir** — hiçbiri elle yazılmaz.

## 1. Katalog

Para birimi **USD**, tutarlar cent (CLAUDE.md kural 9). Aşağıdaki fiyatlar
**liste** fiyatıdır; kampanya indirimi ödeme anında uygulanır (§3).

| Plan id | Ad | Aylık liste | Yıllık liste | Aylık eşdeğeri (gösterim) | Koltuk | Çalışma alanı | YZ kredi/ay | Açtığı modüller |
|---|---|---|---|---|---|---|---|---|
| `free` | Discover | — | — | — | 1 | 1 | 10 | M3, M5 |
| `basic` | Basic | $45,00 | $387,00 | $32,25 | 2 | 1 | 100 | M2, M3, M5 |
| `pro` | Pro | $87,00 | $747,00 | $62,25 | 6 | 1 | 500 | M1-M6, M8 |
| `ultra` | Ultra | $147,00 | $1.197,00 | $99,75 | 15 | 5 | 2.000 | M1-M11 |

| Tek seferlik sku | Ad | Liste | İndirim | Ödenen | Kampanya kodu |
|---|---|---|---|---|---|
| `lifetime-ultra` | Ultra Lifetime | $2.576,00 | %50 (sabit) | $1.288,00 | `OMURBOYU20` |

**`free` satılık bir plan değildir.** Aboneliği olmayan kiracının düştüğü
durumdur: `CATALOG`'da yer almaz (dolayısıyla hiçbir fiyat panelinde
görünmez), ama `Plan` tablosunda satırı vardır çünkü `getEntitlements()`
abonesiz her kiracı için ona düşer.

**Yıllık fiyat nasıl türetilir:** indirim yıllık toplama **bir kez** uygulanır
ve bir kez yuvarlanır (`YEARLY_DERIVATION`). Aylık eşdeğeri yalnızca gösterim
içindir; ödeme sağlayıcısına asla gönderilmez — gerekçesi katalog dosyasında.

### 1.1 Eklentiler (EUR — yeniden fiyatlandırılmadı)

| Eklenti sku | Ad | Fiyat | Verir |
|---|---|---|---|
| `addon_m6` | Evaluator Lens | €99/ay | M6 |
| `addon_m11` | Full Application | €149/ay | M11 |
| `addon_m7` | TTO Accelerator | €129/ay | M7 |
| `addon_m8_pro` | Consortium Matching Pro | €79/ay | M8 |
| `addon_workspace` | Ek çalışma alanı | €49/ay | +1 çalışma alanı |
| `addon_seat_starter/team/business` | Ek koltuk | €19 / €29 / €39 /ay | +1 koltuk |
| `addon_credits_250` | 250 YZ kredisi | €49 tek seferlik | +250 kredi |

> **Açık karar — `ADDON-USD-1`.** Eklenti kataloğu (`AddOnCatalog`) hâlâ EUR ve
> emekliye ayrılan plan adlarını taşıyor (`addon_seat_team`). Hiçbir satış
> yüzeyinde görünmüyor ve 2026-09-07 itibarıyla `AddOn` tablosunda **0 satır**
> var, bu yüzden kimseyi etkilemiyor. USD'ye çevirmek yeni bir fiyat kararıdır;
> uydurulmadı, karara bırakıldı. Yetkilendirme tarafı çalışmaya devam ediyor:
> `grantsModule` alanları planın üstüne modül eklemeyi sürdürüyor.

Kredi maliyeti: M2 taslak 1, M6 değerlendirme 3, M9 brifing 1, M10 belge 1,
M11 bölüm 2, M1 profil özeti 1, M3 kaynak özeti 1. Kredi bitince YZ özellikleri
"satın al" diyaloğu açar; diğer işlevler çalışmaya devam eder.

## 2. Yetkilendirme hesabı

```
entitlements(tenant) = PLAN_GRANTS[plan]
  + Σ activeAddOns.grants
  + { seats: plan.seats + sub.seatsExtra, workspaces: plan.workspaces + sub.workspacesExtra }
allowedModules = plan.moduleIds ∪ addOns.grantsModule
```

- Plan tarafı aboneliğin işaret ettiği `Subscription.planVersionId`'den (yayınlanmış
  `PlanVersion`) okunur (`src/lib/billing/entitlement-source.ts`). Sütun `NULL` ise
  (eski satırlar) veya geçersiz bir işaretçiyse derlenmiş `PLAN_GRANTS` kataloğu
  cevaplar — geriye dönük kırılma olmaz (`src/lib/billing.ts`).
- Emekliye ayrılmış bir plan id'si (`team`, `business`…) hâlâ bir abonelikte
  duruyorsa `resolvePlanId()` onu karşılığına çevirir; kiracı kilitlenmez.
- `canEnable(module)`: `module ∈ manifest.planTiers` **ve** bağımlılıklar
  `ON|PILOT`. `planTiers` her manifestoda `plansGrantingModule('M6')` ile
  katalogdan türetilir — ikinci bir liste yoktur.
- Plan düşürme: kapsam dışı kalan modüller `OFF` (kademeli), veri korunur.
- Plan yükseltme: yeni modüller otomatik `ON` **değil**, `PILOT` olur; sahibe
  "aç" önerisi gösterilir (bilinçli açma ilkesi).

## 3. Kampanya kademeleri ve operasyon notu

Kademeler `DISCOUNT_TIERS`'te tanımlıdır; bir kupon kodu kampanyayı **adlandırır**,
oranını belirlemez.

| Kod | İndirim | Sıra | Kümülatif abone eşiği |
|---|---|---|---|
| `ILK5` | %70 | 1 | 5 |
| `SONRAKI10` | %60 | 2 | 15 |
| `LANSMAN50` | %50 | 3 | 35 |
| `KURUCU40` | %40 | 4 | 85 |
| `GROWTH30` | %30 | 5 | 185 |
| `SCALE20` | %20 | 6 | 385 |
| `PROMO10` | %10 | 7 | 885 |
| `NONE` | %0 | — | liste fiyatı |

> ### ⚙️ Operasyon notu — kampanyayı açmak bir deploy adımıdır
>
> - Aktif kademe **sunucudan** gelir: `BILLING_ACTIVE_TIER` çevre değişkeni
>   (`src/lib/billing/active-tier.ts`). Tarayıcının gönderdiği oran hiçbir
>   zaman fiyat belirlemez.
> - **Değişken set edilmemişse indirim YOKTUR** (liste fiyatı). Bu bilinçli bir
>   karardır (patron, 2026-09-07): unutulmuş bir değişkenin ürünü %70 indirimle
>   satması sessiz bir kayıptır, başlamamış bir kampanya ise fiyat sayfasını
>   açan herkesin gördüğü bir şeydir. Değişken boşken süreç başına bir kez uyarı
>   loglanır.
> - Kampanyayı açmak: `BILLING_ACTIVE_TIER=ILK5`. Kapatmak: değişkeni sil veya
>   `NONE` yap. **İkisi de dağıtım gerektirir** — çalışan süreç değişkeni bir
>   kez okur.
> - Tanınmayan bir kod (ör. `BILLING_ACTIVE_TIER=50%`) sessizce kabul edilmez:
>   varsayılana düşer ve uyarı loglar.
> - Kademe kodları **katalogdadır**; koda yeni bir oran yazmak yerine oradaki
>   listeye kademe eklenir.
> - Abone sayısına göre otomatik kademe **bugün çalışmıyor**: `Subscription`
>   tablosu tohum/demo kiracıyı ödeyen müşteriden ayırt edemiyor. Gerekçe ve
>   geçiş yolu `active-tier.ts` başlığında.

## 4. Ödeme sağlayıcıları

### 4.1 Stripe (MVP)

- Ürünler/fiyatlar Stripe'ta; id'ler `Plan.stripePrice*` ve `AddOnCatalog.stripePriceId`.
- Checkout Session (mode=subscription) → webhook `checkout.session.completed`,
  `customer.subscription.updated|deleted`, `invoice.payment_failed` →
  `Subscription`, `AddOn`, `CreditLedger(monthly_grant)`.
- Tutar **daima** `priceLine()` + `getActiveTier()` ile sunucuda hesaplanır;
  istek yalnızca *hangi* planı söyleyebilir, *ne kadar* olduğunu söyleyemez.
- Stripe Customer Portal: kart, fatura, iptal.
- Vergi: Stripe Tax. Türkiye e-fatura entegrasyonu faz 2 — **canlı değil**; doldurulacak
  ortam değişkenleri tek tabloda: `docs/EFATURA_SETUP.md`.

#### 4.1.1 Fiyat kilidi — "katıldığın fiyat seninle kalır" (TASK-MTR882HVZ8BG7)

Pricing sayfasının vaadi: bir kiracı hangi kampanyada abone olduysa, o oranı
kampanya bitse de korur (`src/lib/billing/price-lock.ts`). Kilit
`Subscription`'da beş sütun: `lockedTierCode`, `lockedPercentOff`,
`lockedAmountMinor`, `lockedCurrency`, `priceLockedAt`.

- **Ne kilitleniyor:** *yüzde*, mutlak tutar değil. `lockedAmountMinor` yalnız
  kanıt/denetim amaçlı — "o gün gerçekten ne tahsil edildi" — bir sonraki
  fiyat teklifini o rakamdan değil, kilitli yüzdeyi **o anki** katalog liste
  fiyatına uygulayarak hesaplar (`effectiveTier()` → `priceLine()`). Bu
  bilinçli: yüzde, plan değişince de (yükselt/düşür) taşınabilsin diye
  (`price-lock.test.ts` → "carries the rate across an upgrade and a
  downgrade"). Katalog liste fiyatları (`catalog.ts`'teki `PLANS`) bugüne
  kadar hiç değişmedi; değişirse bu, yeni bir fiyat kararıdır ve o zaman
  kilitli kiracıların yüzdesi yeni liste fiyatına uygulanır — "kilitli %70"
  demek "sabit $26,10 sonsuza dek" değil, "liste fiyatının %70 indirimlisi
  sonsuza dek" demektir.
- **Yazılma anı:** yalnız ilk aktivasyonda ve iptalden sonra yeniden
  aktivasyonda (`priceLockOnActivation`). Aradaki her olay (plan değişikliği,
  yenileme) sütunlara dokunmaz — kilit varsa karar her zaman `keep`.
- **Yenilemede ne olur — kanıtlı:** Bu depoda bir "aboneliği yenilerken yeniden
  fiyatlandır" kod yolu **yok**. `syncStripeSubscription`, Stripe'ın
  `customer.subscription.updated` webhook'unda (yenileme de bunu tetikler)
  çalışan tek fonksiyondur ve hiçbir yerde `stripe.subscriptions.update`
  çağırmaz (`grep -rn "subscriptions\.update" src` → 0 sonuç) — yalnız DB'yi
  Stripe'ın söylediğiyle senkron eder. Asıl tahsilat, checkout anında
  `price_data.unit_amount` ile yaratılan ve aboneliğe kalıcı olarak bağlanan
  Stripe fiyat nesnesinden gelir (`src/app/api/billing/checkout/route.ts`);
  o tutar da `priceLine(line, effectiveTier(lock, shopfrontTier))`'dan gelir
  (aynı dosya, `lockedRateFor()`). Yani "yenilemede ne ödenir" sorusunun
  cevabı, checkout anında **bir kez** bu iki fonksiyonla karara bağlanır,
  sonrası Stripe'ın kendi tekrarlayan faturalama motorudur — ne bizim kodumuz
  ne de bir cron o tutara sonradan dokunur. Testler:
  `subscription-sync.test.ts` → "does not touch the lock when a later event
  arrives under a worse campaign"; `price-lock.test.ts` → "renewal quoting —
  effectiveTier() feeding priceLine(), not a catalogue refresh".
- **İptal:** kilit temizlenir (`clearedPriceLock()`) — yeniden abone olmak
  o günkü kampanyaya yeniden katılmaktır.
- **Bilinen görünürlük açığı — `RENEWAL-UI-1`:** `Subscription.currentPeriodEnd`
  DB'de tutulur ama hiçbir ekranda okunmaz (`grep -rn currentPeriodEnd src`).
  Faturalandırma ayarları sayfası (`settings/billing/page.tsx`) kiracının
  kilitli/güncel oranıyla fiyat tablosunu gösterir ama "bir sonraki
  yenilemede *şu tarihte şu kadar* ödeyeceksin" biçiminde tek bir cümle
  yoktur. Yeni bir ekran açılmadı; bu satır bulguyu kayda geçirir.

### 4.2 iyzico (faz 2, TL) — fiyatları bayat

Aynı `Subscription.provider='iyzico'`; TL liste `src/lib/iyzico.ts`
`TRY_PLAN_PRICES` içinde, kuruş cinsinden.

> ### ⚠️ Açık karar — `TRY-FX-1`: TL fiyatlarının kuru yok
>
> TL tutarlar, emekliye ayrılan EUR merdiveninden **elle yazılmış, tarihsiz,
> ~31,4 TRY/EUR** bir kurla türetilmişti. TASK-MTR6QIE05ZKNH bu satırları
> yaşayan plan id'lerine taşıdı ama **tutarları yeniden türetmedi**: USD/TRY
> kuru belirlemek bir fiyat kararıdır, bir refactor değil.
>
> Ölçüm — tutarların katalog USD liste fiyatına oranı:
>
> | Plan | TL aylık | USD aylık | İma edilen kur |
> |---|---|---|---|
> | `basic` | ₺1.850 | $45 | 41,1 TRY/USD |
> | `pro` | ₺7.850 | $87 | 90,2 TRY/USD |
> | `ultra` | ₺18.900 | $147 | 128,6 TRY/USD |
>
> Tek bir para çifti için üç ayrı kur, aralarında **3,1 kat** fark var; gerçek
> kur ne çıkarsa çıksın en az ikisi yanlış. `ultra` planındaki bir TL alıcısı,
> aynı planı kartla alan birinin yaklaşık üç katını öder.
>
> Risk bugün **teorik**: iyzico faz 2 ve 2026-09-07 itibarıyla her
> `Subscription` satırının sağlayıcısı `stripe`. Ama sağlayıcı açılmadan önce
> fiyatlar yeniden belirlenmelidir. Ayrıca **TL akışına kampanya indirimi
> uygulanmıyor** — kart alıcısı indirimli, TL alıcısı liste fiyatı öder; bu da
> aynı kararın parçasıdır.
>
> `enterprise` planının kendi TL satırı vardı (₺45.000/ay); artık `ultra`'ya
> eşleniyor ve `business`'tan gelen **düşük** tutar korunuyor — bir geçiş
> kimsenin fiyatını yükseltmemelidir.

## 5. Hizmet paketleri ve başarı primi

- Hizmetler `ServiceOrder` (faz 2) ile takip edilir; ödeme Stripe fatura ya da havale.
- Başarı primi: sözleşmede "AB hibesinden ödenmez, uygun maliyet değildir"
  maddesi; hesaplama kademeli (örn. ilk €500 K %5, sonrası %3, tavan €40 K);
  fatura hibe sözleşmesi imzalandığında.
- Uyum notu: EIC Board danışman kılavuzu — başarı primi uygun maliyet değildir.

## 6. Pazar yeri ve API (v1.3)

- `MarketplaceListing`, `Engagement`, `Commission` (%12, Stripe Connect).
- `ApiKey` (tenant, scope, rate limit) → `/api/v1/partners/*`, €299/ay 10.000
  çağrı; aşımda 429 + üst paket önerisi. *(Bu iki rakam da `ADDON-USD-1`
  kapsamında EUR kaldı.)*

## 7. Raporlama

Yönetici: MRR, ARPA, churn, kredi tüketimi, eklenti oranı (PostHog + Stripe).
Kiracı: fatura geçmişi, kredi geçmişi, koltuk kullanımı.

## 8. Beta → ücretli geçiş (E11 kohortu)

Beta tasarım ortaklarının geçiş koşulları tek kaynakta:
[`src/lib/beta/pricing-transition.ts`](../src/lib/beta/pricing-transition.ts).

Kademe harcamaya değil **katılıma** bağlıdır (sync katılımı + en az bir teklifin
G2'ye ulaşması): `founding` %40 / 12 ay + 24 ay fiyat kilidi · `contributor`
%25 / 12 ay + 12 ay kilit · `alumni` %15 / 6 ay, kilit yok. Kilit bitince artış
12 ayda en çok %20 ve 60 gün önceden yazılı bildirim.

> **Dikkat:** oradaki `CATALOGUE_LIST_CENTS` **dondurulmuş EUR** merdivenidir —
> E11 ortaklarına gösterilen fiyatlar ve yüzdeler o rakamların üzerine
> verilmiştir. Bu doküman §1'deki USD kataloğuyla karıştırılmamalıdır; ikisi
> farklı şeylerdir, çelişki değildir. **Açık karar — `BETA-USD-1`:** kohortun
> GA'da hangi USD planına, hangi indirimle geçeceği kararlaştırılmadı.

Kuralın tamamı ve örnek teklif tablosu: [`E11-PRICING-FEEDBACK.md`](./E11-PRICING-FEEDBACK.md) §11.

## 9. EUR merdiveninin emekliye ayrılması (TASK-MTR6QIE05ZKNH)

2026-09-07'ye kadar ürün iki plan merdiveni tanıyordu: müşteriye gösterilen ve
tahsil edilen USD merdiveni, ve modül/koltuk/kredi yetkilerini gerçekten
belirleyen iç EUR merdiveni (`free/starter/team/business/enterprise`). Yani
**yetkilendirme, müşterinin satın aldığı şeyi tanımıyordu.** Patron kararı:
satış tarafı kazanır.

### Eşleme tablosu

| Emekli EUR planı | Yeni USD planı | Gerekçe |
|---|---|---|
| `free` | `free` (korundu) | Satılık bir plan değil, aboneliksiz kiracının düştüğü durum. Karşılığı yok, davranışı korumak için satırı kaldı. |
| `starter` (€59) | `basic` ($45) | Giriş seviyesi ücretli plan → giriş seviyesi ücretli plan. Modül kümesi birebir aynı (M2, M3, M5). |
| `team` (€249) | `pro` ($87) | Orta plan → orta plan. Modül kümesi birebir aynı (M1–M5, M8). |
| `business` (€599) | `ultra` ($147) | `ultra`, `business`'ın üst kümesidir (üstüne M7 açar). Kayıp yok, kazanç var. |
| `enterprise` (≥€1.500) | `ultra` ($147) | 11 modülün tamamını açan tek plan `ultra`. Koltuk/çalışma alanı farkı aşağıda korunur. |

Eşleme **fiyat eşliğine göre değil, yetenek eşliğine göre** yapıldı: USD
merdiveni bütünüyle eski `team` fiyatının altında, dolayısıyla fiyat eşleştirmek
imkânsızdı. Kural şuydu: **hiçbir kiracıdan hiçbir yetenek geri alınmayacak.**

- Her hedef plan, kaynağın modüllerinin üst kümesini açar
  (`catalog.test.ts` → "never takes a module away from a migrated subscription").
- Kaynak plan hedeften **fazla koltuk/çalışma alanı** veriyorsa (yalnız
  `enterprise`: 999/999 → 15/5), fark kiracıyı küçültmek yerine
  `Subscription.seatsExtra` / `workspacesExtra` üzerine taşınır. Migration bunu
  satırı taşımadan **önce** yapar; sonrasında nereden geldiği bilinemezdi.
- Migration, eşlenmemiş bir plana bağlı abonelik kalmışsa eski satırları
  silmeyi **reddeder** (`RAISE EXCEPTION`) — `Subscription.planId`'de yabancı
  anahtar yok, tek koruma bu.

Migration: `prisma/migrations/retire-eur-plan-ladder.sql`
(geri alma: `.down.sql`; çok-bire eşleme birebir tersine çevrilemez — her
`ultra` geri dönüşte `business` olur, yani ikisinin düşüğü, gerekçesi dosyada).

### Bu geçişte açılan kartlar

| Kart | Konu |
|---|---|
| `TRY-FX-1` | TL fiyatlarının kuru yok, indirim de uygulanmıyor (§4.2) |
| `ADDON-USD-1` | Eklenti kataloğu EUR ve eski plan adlarını taşıyor (§1.1) |
| `BETA-USD-1` | E11 kohortunun GA'da hangi USD planına geçeceği belirsiz (§8) |
| `PLAN-DEFAULT-1` | Modül ayarları sayfası, aboneliği olmayan kiracıya orta planı (`pro`) varsayıyor — cömert bir varsayılan; `free` olmalı mı? (`settings/modules/actions.ts`) |
