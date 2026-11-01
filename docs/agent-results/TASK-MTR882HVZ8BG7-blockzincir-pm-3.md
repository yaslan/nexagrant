# TASK-MTR882HVZ8BG7 — Fiyat Kilidi: Yenileme Sorusu (3. Alt-Görev)

**Kapsam:** İlk satın alma kanıtlandı (bkz. `-2.md`). Bu rapor **tek kalan soruya** odaklanır:
kiracı bir sonraki yenilemede ne öder, ve bu tutar `readPriceLock()`/`effectiveTier()`
üzerinden mi geliyor yoksa katalogtan mı tazeleniyor?

Kod değişikliği yok; koda dokunmadan önce (c) maddesindeki "kopukluk varsa düzelt" koşulunu
sınadım ve **kopukluk bulunmadı** (gerekçe aşağıda, dosya+satır ile). Yalnız test ve doküman
eklendi.

---

## (a) Yenilemede tutarı kim belirliyor — dosya + satır

- **Gerçek tahsilat Stripe'ın kendisi belirliyor**, bizim kodumuz değil. Aboneliğin fiyat
  nesnesi yalnızca **checkout anında bir kez** yaratılıyor:
  `src/app/api/billing/checkout/route.ts:260-271` → `price_data.unit_amount: line.amountMinor`
  ile bir Stripe Checkout Session (`mode: 'subscription'`) açılıyor. Stripe, bu tutarı taşıyan
  fiyat nesnesini aboneliğe kalıcı olarak bağlar ve **her periyotta aynı tutarı kendi
  faturalama motoruyla** yeniden tahsil eder — bizim kodumuz araya girmez.
- Yenileme olayı (`customer.subscription.updated`) uygulamaya ulaştığında tek çalışan
  fonksiyon `syncStripeSubscription` (`src/lib/billing/subscription-sync.ts:195-293`,
  webhook bağlantısı `src/app/api/webhooks/stripe/route.ts:64-71`). Bu fonksiyon **hiçbir
  yerde** `stripe.subscriptions.update` çağırmıyor — doğrulama:
  ```
  $ grep -rn "subscriptions\.update\|subscriptionItems\.update" src --include="*.ts" | grep -v ".test."
  (0 sonuç — yalnız iki .retrieve() çağrısı var, .update() hiç yok)
  ```
  Yani uygulamanın kendisi bir aboneliğin fiyatını **asla** sonradan değiştirmiyor; yenileme
  saf Stripe tarafı.
- `syncStripeSubscription` bir kilit varken hep `keep` kararı veriyor:
  `priceLockUpdate()` (`subscription-sync.ts:166-187`) → `priceLockOnActivation()`
  (`price-lock.ts:186-217`). Kilit doluysa (`readPriceLock(existing)` truthy) `action: 'keep'`
  döner (`price-lock.ts:209-211`), `lockColumns` `null` olur, upsert'in `update` tarafına
  kilit sütunları hiç eklenmez (`subscription-sync.ts:272,291`).

## (b) Tutar `readPriceLock()`/`effectiveTier()`'dan mı geliyor, katalogtan mı tazeleniyor — kanıtlı

İki ayrı katman var, ikisini de ayrı ayrı kanıtladım:

1. **Checkout anındaki (= yenilemede sabitlenecek) tutar** — `effectiveTier()`'dan geliyor,
   katalogtan doğrudan değil:
   - `checkout/route.ts:96-119` (`lockedRateFor`) → `readPriceLock()` ile DB'den kilidi okur.
   - `checkout/route.ts:185-186` → `const activeTier = effectiveTier(lock, shopfrontTier)`.
   - `checkout/route.ts:199` → `priced = requestedLines.map((line) => priceLine(line, activeTier))`.
   - Yani checkout'un ürettiği ve Stripe'a `unit_amount` olarak giden rakam, kilidin
     doğrudan sonucu. **Kanıt** — mevcut test `subscription-sync.test.ts:272-291`
     ("does not touch the lock when a later event arrives under a worse campaign") ve bu
     raporun eklediği yeni testler (aşağıda) bunu ayrıca doğruluyor.
2. **Faturalandırma ayarları ekranındaki gösterim** — aynı şekilde kilitten geliyor:
   `settings/billing/page.tsx:162-163` → `effectiveTier(priceLock, shopfrontTier)` →
   `BillingClient`'a `activeTier` olarak geçiyor, oradan `priceLine()`'a (`BillingClient.tsx:142`).

**Nüans (bug değil, tasarım kararı — dosya+satır ile not edildi):** Kilit **mutlak tutarı**
değil **yüzdeyi** dondurur. `effectiveTier()` kilit kazandığında `lockedTier(lock)` döner
(`price-lock.ts:127-137`), bu nesne yalnız `percentOff` taşır; sonraki `priceLine()` çağrısı
o yüzdeyi **o anki** `catalog.ts`'teki `monthlyListMinor`/`yearlyListMinor` sabitine uygular
(`catalog.ts:294-295`). `lockedAmountMinor` (o gün gerçekten tahsil edilen mutlak rakam)
hiçbir yerde yeniden okunup fiyat üretmiyor — yalnız denetim/kanıt amaçlı saklanıyor
(`price-lock.ts:110-124`, `subscription-sync.ts:426`). Bu **bilinçli**: yüzdenin plan
yükseltme/düşürme ve aylık↔yıllık geçişte taşınabilmesi buna bağlı
(`price-lock.test.ts:151-164`, "carries the rate across an upgrade and a downgrade" /
"…a monthly → yearly switch" — mevcut testler). Katalog liste fiyatları kod sabiti ve
bugüne kadar hiç değişmedi (`git log` → `catalog.ts`'te fiyat değişikliği yok); değişirse bu
yeni bir fiyat kararı olur ve o zaman kilitli kiracılar da yeni liste fiyatının üzerinden
kendi yüzdesiyle fiyatlanır — "kilitli %70" = "liste fiyatının %70 indirimlisi", "sabit
$26,10" değil. Bunu **BULGU** olarak docs/BILLING.md §4.1.1'e yazdım, kod değiştirmedim
(gerekçe: mevcut test paketi bu davranışı açıkça istiyor; tersini yapmak plan
değişikliğinde kilidi bozar).

## (c) Kopukluk var mı — düzeltme gerekiyor mu

**Hayır, düzeltme gerekmedi.** Görev metninin varsaydığı senaryo — "yenileme tutarı
`effectiveTier()`'ı hiç görmeden doğrudan katalogtan tazeleniyor" — bu depoda yok:

- Pasif yenileme (kiracı hiçbir şey yapmadan periyot döndüğünde) tamamen Stripe'ın kendi
  motorunda gerçekleşiyor; uygulama kodu hiç araya girmiyor (yukarıdaki grep kanıtı).
- Kiracının yeni bir checkout başlattığı her yol (ilk satın alma, plan değişikliği, döngü
  değişikliği) `lockedRateFor()` → `effectiveTier()` → `priceLine()` zincirinden geçiyor;
  atlayan ikinci bir kod yolu yok.
- `credits-monthly-grant` job'u (`src/lib/inngest/jobs/credits-monthly-grant.ts`) yalnız YZ
  kredisi veriyor, para/fiyatla hiç ilgisi yok — kontrol ettim, ilgisiz.
- iyzico tarafında (`src/lib/iyzico.ts`) periyodik bir yenileme/tahsilat job'u **yok**
  (`grep -n "cron\|recurring\|schedule"` → 0 anlamlı sonuç); TL akışı zaten faz 2 ve
  `docs/BILLING.md` §4.2'de "fiyatları bayat" olarak açık karar (`TRY-FX-1`) altında.

Sonuç: (c) maddesindeki "en küçük değişiklikle bağla" talimatı koşullu ("kopukluk varsa") —
koşul sağlanmadığı için kod değişikliği yapılmadı; bulgu ve gerekçe docs'a yazıldı.

## (d) Birim testler — katalog "zamlanmış" / "ucuzlamış" senaryoları

Bu iki senaryo zaten `price-lock.test.ts`'te mevcuttu (satır 92, 114) — kampanya bitince
(= tazelenen fiyat yükselir) kilit korunuyor, kampanya derinleşince (= tazelenen fiyat
düşer) ucuz olan kazanıyor. Bunları **yenileme teklifini `priceLine()` ile uçtan uca**
doğrulayan yeni bir `describe` bloğuyla pekiştirdim (`price-lock.test.ts`, yeni blok:
"renewal quoting — effectiveTier() feeding priceLine(), not a catalogue refresh"):

```ts
it('catalogue effectively "raised" (the campaign ended): the locked price still renews, not list', () => {
  const lock = readPriceLock(ilk5ProLock()); // ILK5 %70 ile katıldı → $26.10
  const renewalQuote = priceLine({ sku: 'pro', billingCycle: 'monthly' }, effectiveTier(lock, NO_DISCOUNT_TIER));
  expect(renewalQuote.amountMinor).toBe(2_610);              // kilitli tutar uygulanır
  expect(renewalQuote.amountMinor).toBe(lock!.amountMinor);   // kanıt tutarıyla birebir
  // liste fiyatından farklı — "zam" tenanta yansımıyor
});

it('catalogue effectively "cheapened" (a deeper campaign is running today): the cheaper price renews', () => {
  const lock = readPriceLock({ ...ilk5ProLock(), lockedTierCode: 'PROMO10', lockedPercentOff: 10 });
  const renewalQuote = priceLine({ sku: 'pro', billingCycle: 'monthly' }, effectiveTier(lock, tier('ILK5')));
  expect(renewalQuote.amountMinor).toBe(priceLine({ sku: 'pro', billingCycle: 'monthly' }, tier('ILK5')).amountMinor);
  // ucuz olan (bugünkü %70 kampanya) kazanıyor, kilitli %10 değil
});
```

**Test çıktısı:**

```
$ npx vitest run src/lib/billing
 Test Files  4 passed (4)
      Tests  107 passed (105 mevcut + 2 yeni)
   Duration  218ms
```

**Tüm proje testleri (regresyon kontrolü):**

```
$ pnpm test
 Test Files  71 passed | 2 skipped (73)
      Tests  756 passed | 8 skipped (764)
```

**Typecheck:**

```
$ pnpm typecheck
$ tsc --noEmit
(hata yok)
```

**Lint:**

```
$ pnpm lint
✖ 84 problems (0 errors, 84 warnings)
```
0 hata; 84 uyarı hepsi bu görevden önce var olan, dokunmadığım dosyalarda (ör.
`UserMenu.tsx`, `cordis-delta.ts`, `state-machine.ts`…) — `price-lock.test.ts` ve
`docs/BILLING.md`'de sıfır uyarı.

## (e) docs/BILLING.md güncellemesi

§4.1'in altına yeni bir alt bölüm eklendi: **§4.1.1 "Fiyat kilidi — 'katıldığın fiyat
seninle kalır'"**. İçeriği: neyin kilitlendiği (yüzde, mutlak tutar değil — ve neden),
kilidin ne zaman yazıldığı, yenilemede gerçekte ne olduğu (kanıtlarıyla, (a)/(b)'deki
aynı zincir), iptalde temizlenmesi, ve aşağıdaki görünürlük açığı.

## Kullanıcı görünürlüğü — BULGU (yeni ekran açılmadı)

Kullanıcı **"bir sonraki yenilemede ne ödeyeceğim, ne zaman"** sorusunun cevabını hiçbir
ekranda tam göremiyor:

- `Subscription.currentPeriodEnd` DB'de tutulur ama hiçbir UI dosyasında okunmuyor:
  ```
  $ grep -rn "currentPeriodEnd" src --include="*.ts" --include="*.tsx" | grep -v ".test."
  src/lib/iyzico.ts:601,635,644          (yalnız yazma tarafı)
  src/lib/billing/subscription-sync.ts:261,284,290  (yalnız yazma tarafı)
  ```
  Okuma tarafı yok.
- `settings/billing/page.tsx` / `BillingClient.tsx` kiracının kilitli/güncel oranıyla fiyat
  tablosunu (tüm planlar için) gösteriyor ve kilitliyse `lockedTierNote` metnini yazıyor
  (`BillingClient.tsx:291-293`) — ama "şu tarihte şu kadar tahsil edilecek" biçiminde tek bir
  cümle yok.

Görev talimatı gereği burada **yeni ekran açmadım**; bu, `docs/BILLING.md` §4.1.1'e
`RENEWAL-UI-1` adıyla açık madde olarak işlendi (ürün kararı gerektirir: bir "sonraki fatura"
satırı mı eklenecek, yoksa mevcut panel yeterli mi görülecek mi).

---

## Değişen Dosyalar

- `src/lib/billing/price-lock.test.ts` — yeni `describe` bloğu, 2 yeni test (renewal quoting)
- `docs/BILLING.md` — yeni §4.1.1 (fiyat kilidi + yenileme kanıtı + `RENEWAL-UI-1` açık maddesi)
- Kod (`price-lock.ts`, `subscription-sync.ts`, webhook, job) — **değişmedi**, kopukluk
  bulunmadığı için.

## Riskler

- Yok — davranış değişmedi, yalnız test kapsamı ve dokümantasyon genişledi.
- Teorik/gelecek riski (yeni değil, yeniden teyit edildi): katalogtaki liste fiyatları bir gün
  kod düzeyinde değiştirilirse, kilitli kiracıların yüzdesi o yeni liste fiyatına uygulanır
  (mutlak `lockedAmountMinor` yeniden kullanılmaz). Bu tasarımın bilinçli sonucu; §4.1.1'de
  yazılı.

## Açık Sorular

1. **`RENEWAL-UI-1`** — kullanıcı "bir sonraki yenilemede ne kadar, ne zaman" sorusunu hiçbir
   ekranda tam göremiyor (`currentPeriodEnd` hiç okunmuyor). Ürün kararı gerekiyor; kapsam
   dışı olduğu için yeni ekran açılmadı, yalnız docs'a işlendi.
2. Bu alt-görevin dışında, yol üstünde görülen ama dokunulmayan noktalar (mevcut açık
   kararlar, zaten `docs/BILLING.md`'de kayıtlı): `TRY-FX-1` (§4.2, TL kuru yok + TL akışına
   kampanya uygulanmıyor), `ADDON-USD-1` (§1.1, eklenti kataloğu hâlâ EUR).

## Sonraki Adım

`RENEWAL-UI-1` için ürün kararı: faturalandırma ayarları paneline "sıradaki tahsilat: $X,
DD.MM.YYYY" satırı eklenmeli mi? Karar verilirse ayrı bir görev olarak açılmalı (bu görevin
kapsamı yalnız doğrulama + doküman idi).

---

## Definition of Done

- [x] (a) Yenilemede tutarı kimin belirlediği dosya+satır ile kanıtlandı
- [x] (b) `readPriceLock()`/`effectiveTier()` mi, katalog mu — kanıtla cevaplandı ("büyük ihtimalle" kullanılmadı)
- [x] (c) Kopukluk arandı; bulunmadığı gerekçesiyle belgelendi (kod değişikliği gerekmedi)
- [x] (d) Birim test: katalog zamlanmış → kilitli fiyat uygulanır; katalog ucuzlamış → ucuz olan uygulanır — `pnpm test -- src/lib/billing` çıktısı rapora kopyalandı
- [x] (e) `docs/BILLING.md` yenileme kuralı netleştirildi (§4.1.1)
- [x] Kullanıcı görünürlük açığı BULGU olarak yazıldı, yeni ekran açılmadı
- [x] `pnpm lint && pnpm typecheck && pnpm test` çalıştırıldı, çıktı rapora kopyalandı (0 hata)
- [x] Yalnız izinli dosyalara dokunuldu: `price-lock.test.ts`, `docs/BILLING.md`

---

**Raporlayan:** blockzincir-pm (PM-EN)
**Tarih:** 2026-09-07
**Deneme:** 3 (bu alt-görev)
