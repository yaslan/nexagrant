# TASK-MTR962OV5YGVX (2) — Ayarlar → Faturalandırma panelindeki ömür boyu sayacı da kayda bağlandı

**Ajan:** BE-EN (Backend Mühendisi) · **Branch:** dev · **Tarih:** 2026-09-07
**Önceki tur:** `TASK-MTR962OV5YGVX-geli-tirici.md` (/pricing yüzeyi, commit `eb7f24d`)

---

## 1. Ne yapıldı

İlk turda `/pricing` rozeti `LifetimeLicence` kayıtlarına bağlanmıştı; **aynı uydurma çift ikinci
panelde duruyordu**. `/settings/billing` paneli mesaj kataloğundan iki düz cümle basıyordu:

| | Önce | Sonra |
|---|---|---|
| `billingPanels.settings.lifetimeOwners` | `"5 lisans sahibi"` / `"5 licence owners"` (sabit metin) | **silindi** |
| `billingPanels.settings.lifetimeNext` | `"Sıradaki lisans #6 (ilk 20 firma ile sınırlı)"` (sabit metin) | **silindi** |
| Rozet kaynağı | yok — sayan hiçbir şey yoktu | `countLifetimeLicences()` → `lifetimeScarcity()` |
| Kod yorumu | *"no table records a lifetime licence, so there is nothing to count yet"* | silindi (artık doğru değil — tablo var) |

Yeni akış, `/pricing`'de kurulan kalıbın **aynısı**, mantık kopyalanmadan:

1. **Server page** (`settings/billing/page.tsx`) `lifetimeScarcity(await countLifetimeLicences())`
   çağırıyor ve sonucu `lifetimeScarcity` prop'u olarak istemciye durum olarak geçiriyor.
   Sayım `src/lib/billing/lifetime-licence.ts`'ten; **o dosyaya tek satır dokunulmadı**
   (20 testi olduğu gibi duruyor, yeni export da gerekmedi).
2. **İstemci** (`BillingClient.tsx`) dört durumu render ediyor — `/pricing` ile birebir aynı
   davranış:
   - `unknown` → yalnız kontenjan ("İlk 20 firma ile sınırlı"), **hiçbir sayı iddia edilmiyor**
   - `none` → "Henüz lisans sahibi yok · Sıradaki lisans #1"
   - `available` → "{count} lisans sahibi · Sıradaki lisans #{next}"
   - `sold-out` → "{count}/{cap} — ömür boyu kontenjanı doldu" (**sıradaki lisans vaadi yok**)
   Rozet `data-testid="settings-lifetime-scarcity"` + `data-scarcity="<kind>"` taşıyor, böylece
   durum tarayıcıdan okunabiliyor.
3. **i18n** — `billingPanels.settings` altına beş parametreli anahtar girdi
   (`lifetimeOwnersCount`, `lifetimeOwnersNone`, `lifetimeNextSeq`, `lifetimeSoldOut`,
   `lifetimeCapOnly`), iki katalogda da. `billingPanels.pricing` altındaki anahtarlarla metin
   aynı olsa bile **ayrı anahtarlar**; namespace paylaşımı yok, dizi değeri yok, mevcut yapı
   bozulmadı.

**Önbellek davranışı — `/pricing` ile tutarlı, gerekçesi farklı yazıldı.** Panele
`export const dynamic = 'force-dynamic'` eklendi. Bu sayfa `requireTenantPage()` oturum
çerezini okuduğu için Next zaten dinamik render ediyordu; satır davranışı *değiştirmiyor*,
**nedenini sabitliyor**: kimlik doğrulama çağrısı bir gün taşınırsa sayfa sessizce
önbelleğe alınabilir hâle gelmesin. Önbellekteki "19 sahip" 21. lisansın satılma yoludur.

---

## 2. Kanıt

### 2.1 Kapı (lint + typecheck + test)

```
$ pnpm lint
✖ 172 problems (0 errors, 172 warnings)        ← hepsi önceden var olan no-unused-vars uyarıları

$ pnpm typecheck
$ tsc --noEmit                                  ← çıktı yok = temiz

$ pnpm test
 Test Files  63 passed | 2 skipped (65)
      Tests  671 passed | 8 skipped (679)
   Duration  2.10s
```

Önceki tur 666 testle kapanmıştı; +5 test bu turda eklendi (aşağıda).

### 2.2 Yeni test — panelin durumu doğru seçtiğinin kanıtı

`tests/billing-settings-lifetime-badge.test.tsx` — gerçek `BillingClient`, gerçek `tr.json` /
`en.json` katalogları (silinen bir anahtar burada patlar, ekranda boş rozet olarak değil):

```
$ npx vitest run tests/billing-settings-lifetime-badge.test.tsx
 ✓ claims no owner count when the count could not be read
 ✓ says nobody has bought one yet, and offers licence #1
 ✓ counts the recorded licences and numbers the next one
 ✓ stops promising a next licence once the run is full
 ✓ renders the counted figures in English too
 Test Files  1 passed (1)
      Tests  5 passed (5)
```

`unknown` ve `sold-out` testleri `#\d` deseninin ekranda **olmadığını** ayrıca doğruluyor;
`available` testi eski uydurma "5 lisans sahibi" dizesinin artık çıkmadığını doğruluyor.

### 2.3 Tarayıcı kanıtı — dört DB durumu, iki dil

Gerçek dev sunucusu (`localhost:3000`), gerçek Postgres, gerçek oturum açma
(`/tr/giris` → `admin@yasinaslan.com.tr`), Playwright. Her karede rozetin `data-scarcity`
özniteliği ve metni okundu; kareler panelin içinde, kırpılmamış:

```
[SHOT 07-settings-tr-zero-licences]     state=none       text="Henüz lisans sahibi yok · Sıradaki lisans #1 (ilk 20 firma ile sınırlı)"
[SHOT 08-settings-tr-four-licences]     state=available  text="4 lisans sahibi · Sıradaki lisans #5 (ilk 20 firma ile sınırlı)"
[SHOT 09-settings-en-four-licences]     state=available  text="4 licence owners · Next licence #5 (limited to the first 20 entities)"
[SHOT 10-settings-tr-sold-out]          state=sold-out   text="20/20 — ömür boyu kontenjanı doldu"
[SHOT 11-settings-tr-count-unavailable] state=unknown    text="İlk 20 firma ile sınırlı"
[RESTORED] lifetime_licence_count() = 20
  ✓  1 [chromium] › badge across database states (4.1s)
  1 passed (4.7s)
```

| # | Dosya | DB durumu | Rozet |
|---|---|---|---|
| 07 | `TASK-MTR962OV5YGVX-screenshots/07-settings-tr-zero-licences.png` | **0 lisans** | `none` — dürüst sıfır |
| 08 | `…/08-settings-tr-four-licences.png` | **4 lisans** | `available` — 4 ve sıradaki #5 |
| 09 | `…/09-settings-en-four-licences.png` | 4 lisans | `available` — İngilizce |
| 10 | `…/10-settings-tr-sold-out.png` | **20 lisans** | `sold-out` — sıradaki lisans vaadi yok |
| 11 | `…/11-settings-tr-count-unavailable.png` | 20 satır var ama **sayaç okunamıyor** | `unknown` — hiçbir sayı yok |

Uydurma "5 lisans sahibi" hiçbir durumda çıkmıyor. Önceki 6 kare (01-06, /pricing) **ezilmedi**.

11 için `public.lifetime_licence_count()` fonksiyonu `ALTER FUNCTION … RENAME` ile geçici olarak
kenara alındı (DROP değil), kare çekildi, `finally` bloğunda geri adlandırıldı. Test sonrası
doğrulama: fonksiyon çalışıyor, çekilen satırlar silindi:

```
$ npx tsx -e "…"
rows after cleanup: 0
function: [{"n":0}]
```

Kareleri çeken spec **atıldı** (`tests/e2e/tmp-settings-lifetime-badge.spec.ts` silindi) — kalıcı
kapsam birim testinde; e2e'ye lisans satırı yazan kalıcı bir spec bırakmak istemedim.

### 2.4 i18n

`pnpm i18n:check` raporunda yeni beş anahtarın hiçbiri `missingInTurkish` / `missingInEnglish` /
`missingInBoth` kovalarında **değil**. O kovalarda yalnız şablon-değişkenli
(`${entry.planId}`) anahtarlar var ve bunlar bu karttan önce de oradaydı. Yeni anahtarlar
`unused` kovasında görünüyor: çıkarıcı `t('key', { … })` biçimini tanımıyor (dokunmadığım
`lifetimeCouponNote` de aynı kovada). Gerçekten render edildikleri 07-11 kareleriyle kanıtlı.
`tests/i18n.test.ts` (tr/en anahtar eşitliği) 671 testin içinde yeşil.
(`i18n:check` bu depoda zaten exit 1 dönüyor ve `pnpm gate`'in parçası değil.)

---

## 3. Değişen dosyalar

| Dosya | Ne |
|---|---|
| `src/app/[locale]/(app)/[workspace]/settings/billing/page.tsx` | Sayımı server'da okuyup durumu prop olarak geçiriyor; `dynamic = 'force-dynamic'` + gerekçesi |
| `src/app/[locale]/(app)/[workspace]/settings/billing/BillingClient.tsx` | `lifetimeScarcity` prop'u; rozet dört duruma göre render; **eski yanlış yorum silindi**; `data-testid`/`data-scarcity` |
| `messages/tr.json`, `messages/en.json` | `billingPanels.settings`: `lifetimeOwners`/`lifetimeNext` **çıktı**; `lifetimeOwnersCount`, `lifetimeOwnersNone`, `lifetimeNextSeq`, `lifetimeSoldOut`, `lifetimeCapOnly` **girdi** |
| `tests/billing-settings-lifetime-badge.test.tsx` | **yeni** — 5 test, dört durum + İngilizce |

**Dokunulmayanlar (kart kuralı):** `src/lib/billing/lifetime-licence.ts` (satır bile değişmedi),
`src/lib/billing/catalog.ts`, `src/app/[locale]/pricing/*`, migration'lar, `prisma/rls.sql`.

---

## 4. Madde 4 — bu iki panelde kayda bağlı OLMAYAN diğer rakamlar (bildirim, düzeltme yok)

Kartın kapsamı ömür boyu rozetiydi; aşağıdakilere **dokunmadım**. Ciddiyet sırasıyla:

### 4.1 Ayarlar panelinde uydurma kota kullanımı — `settings/billing/page.tsx`

| Değer | Nerede | Sorun |
|---|---|---|
| `usedSeats: 3` | satır 69 ve 84 | "3 / 6 koltuk" metrik kartında gösteriliyor. **DB dalında bile sabit**: `getEntitlements()` gerçek `seats` dönerken kullanılan koltuk sayısı elle yazılmış. Gerçek kaynak var: `Membership` satırları. |
| `usedWorkspaces: 1` | aynı | "1 / 5 çalışma alanı" — aynı şekilde sabit; gerçek kaynak `Workspace` satırları. |
| `aiCreditsRemaining: 500` | aynı | Kredi çubuğu **ve** "%X kalan" yüzdesi bundan türüyor. Gerçek kaynak `AiUsageLog` (CLAUDE.md kural 5 zaten her çağrıyı yazıyor). |
| `|| 6`, `|| 5`, `|| 1000` varsayılanları | satır 83-87 | Gerçek bir **0** değerini uydurma bir sayıyla değiştirir (`0 || 6 === 6`). "Yok" ile "altı" karıştırılıyor. |
| Sorgu patlarsa devreye giren blok | satır 66-74 | `seats 6 · workspaces 5 · credits 1000 · modules M1-M5,M8` — DB okunamadığında kullanıcı **makul görünen ama tamamen uydurma** bir plan görüyor; hata sadece `console.warn`'a düşüyor. |
| `currentPlanId = 'team'` varsayılanı | satır 46 | `team` **emekliye ayrılmış** bir plan id'si (TASK-MTR6QIE05ZKNH); artık `PLAN_GRANTS` içinde yok. Fallback devreye girerse metrik kartı "TEAM" yazar ve hiçbir plan kartı "mevcut planınız" rozetini almaz. |

### 4.2 Plan kartlarındaki özellik satırları **veriyle çelişiyor** — her iki panel

Kart metinleri i18n prose; yetkilendirmenin koştuğu veri `PLAN_GRANTS` (`catalog.ts:365+`).
Aynı ekranda iki farklı gerçek var:

| Kartın iddiası (`billingPanels.settings.plans` / `.pricing.plans`) | `PLAN_GRANTS` gerçeği |
|---|---|
| basic: "500 YZ kredisi / ay" | `aiCreditsMonthly: 100` |
| basic: "1 kullanıcı / 1 çalışma alanı" | `seats: 2`, `workspaces: 1` |
| basic: "Modüller: M3, M5" | `['M2','M3','M5']` |
| pro: "3.000 YZ kredisi / ay" | `aiCreditsMonthly: 500` |
| pro: "Sınırsız çalışma alanı" | `workspaces: 1` |
| pro: "Modüller: M1-M6, M8" | `['M1','M2','M3','M4','M5','M8']` — **M6 yok** (Evaluator Lens pro'ya dahil değil) |
| ultra: "Sınırsız YZ kredisi" | `aiCreditsMonthly: 2_000` |
| ultra: "Sınırsız koltuk ve çalışma alanı" | `seats: 15`, `workspaces: 5` |

Bu satılan şeyle verilenin uyuşmadığı bir durum, yalnız kozmetik bir tutarsızlık değil.
**Ayrı bir kart gerekiyor** ve ürün kararı içeriyor (metni mi veriyi mi düzelteceğiz);
`/pricing` bu kartta dokunulmaz listesindeydi, zaten oraya da dokunmadım.

### 4.3 Fatura bloğu — `BillingClient.tsx:65-83` (`DEMO_INVOICES`) ve `:520-600`

- `VKN: 2840958172`, `Demo Ar-Ge ve Danışmanlık Ltd. Şti.`, `Doğanbey V.D. / 2840958172`
  — JSX'e gömülü; ne kayda bağlı ne de i18n'li (CLAUDE.md kural 8 ihlali de).
- `DEMO_INVOICES` — `₺32,220.00`, `₺10,740.00`, fatura numaraları, tarihler. Kodda "demo"
  olduğunu söyleyen bir yorum var, **ama ekranda böyle bir uyarı yok**: satırlar "GİB ONAYLI"
  rozetiyle ve çalışan XML/PDF indirme bağlantılarıyla gerçek fatura gibi duruyor.
- `invoiceStatusValue` = "E-fatura kayıtlı mükellef" — hiçbir kaydın doğrulamadığı yasal statü iddiası.

### 4.4 Küçükler

- `metricPlanTerm` = "Dönem: otomatik yenileme" — `Subscription.status` / iptal bayrağı
  okunmuyor; iptal edilmiş bir abonelikte de "otomatik yenileme" yazar.
- `yearlyBadge` = "3 ay ücretsiz" — yıllık/aylık farkı kataloğdan hesaplanabiliyor
  (kartın içinde `~%28 daha ucuz` diye zaten hesaplanıyor), rozet ise sabit.
- `billingPanels.pricing.lifetimeBody` içinde "ilk 20 kişi/firma" **düz metin**: kontenjan artık
  `LIFETIME_LICENCE_CAP` verisi, cümle değişirse yalan söyler. (Ayarlar panelinin `lifetimeBody`
  metninde bu sayı yok.) Bu kartın dokunulmaz listesindeki `/pricing` kapsamında.
- `billingPanels.pricing.tiers.*` ("İlk 5 abone", "Sonraki 10 abone" …) — `DISCOUNT_TIERS`
  merdiveninin elle kopyası. **Şu an tutarlı** (5/15/35/85/185/385/885 ile birebir), ama iki
  yerde yaşıyor; merdiven değişirse metin sessizce yanlışa döner.

---

## 5. Riskler

1. **`force-dynamic`** — panel her istekte bir `count()` sorgusu koşuyor. Sayfa zaten dinamikti
   (oturum çerezi), yani ek maliyet yalnız bu tek sorgu. Bilinçli: önbelleğe alınmış sayı
   kontenjan aşımının yolu.
2. **Sayım kiracılar arası.** Panel bir kiracının içinde ama gösterilen sayı **global** —
   `public.lifetime_licence_count()` (SECURITY DEFINER, argümansız, tek tamsayı, satır dönmez).
   Kasıtlı: "ilk 20 firma" tüm ürün için tek bir kontenjan; iki panel farklı sayı gösteremez.
   Kiracı kimliği bu yoldan sızmıyor (fonksiyon satır döndürmüyor).
3. **Tükenmişken CTA hâlâ aktif** — önceki turun açık sorusu ayarlar panelinde de geçerli:
   10 numaralı kare "20/20 kontenjan doldu" derken "Ömür boyu lisans al" butonu duruyor.
   Ürün kararı, ayrı kart.
4. **Paralel ajan yarışı** — `messages/*.json` dosyalarını başka ajanlar da düzenliyor;
   commit öncesi `git diff --cached` ile staged içerik doğrulandı.

---

## 6. Açık sorular

1. **4.2'deki çelişki hangi yönde çözülecek?** Kart metinleri mi `PLAN_GRANTS`'e uydurulacak,
   yoksa satılan şey gerçekten "sınırsız" mı ve veri mi düzeltilecek? Bu bir ürün/fiyat kararı;
   yetkilendirme bugün veriye göre çalışıyor, yani kullanıcı kartta okuduğunu alamıyor.
2. **Kota kullanımı (4.1) hangi kartta bağlanacak?** Üç sayının da kaynağı mevcut
   (`Membership`, `Workspace`, `AiUsageLog`); bu panelde `usedSeats`/`usedWorkspaces`/
   `aiCreditsRemaining` bağlanana kadar ekran uydurma kota gösteriyor.
3. **Demo fatura satırları ekranda "örnek" olarak etiketlensin mi?** Bugün "GİB ONAYLI"
   rozetiyle gerçek fatura gibi duruyor ve indirme bağlantıları çalışıyor.

---

## 7. Sonraki adım

- 4.1 için kart: ayarlar panelindeki kota metriklerini `Membership` / `Workspace` /
  `AiUsageLog` kayıtlarına bağla; `|| varsayılan` kalıbını kaldır, okunamayan değeri
  "—" olarak göster (rozetteki `unknown` kalıbının aynısı).
- 4.2 için karar kartı: plan kartı metinleri ile `PLAN_GRANTS` arasındaki sekiz çelişki.
- 4.3 için kart: fatura geçmişini gerçek kayda bağla ya da ekranda örnek olduğunu söyle.
