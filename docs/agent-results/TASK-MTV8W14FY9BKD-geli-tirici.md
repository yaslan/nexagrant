# TASK-MTV8W14FY9BKD — Faturaya basılan yedek satır metni artık kiracının dilinde

**Ajan:** geli-tirici (BE-EN) · **Sprint:** SPRINT-S12 (yedinci dalga) · **Tarih:** 2026-09-10
**Platform:** macOS (Darwin 25.6.0, arm64) — ayrıntı için "Platform beyanı".

---

## 1. Ne yapıldı

### (a) ÖNCE YOLU ÖLÇTÜM — kartın istediği en değerli çıktı

Sorulan: `createInvoiceForPayment` çağrı zincirinde kiracı locale'i hangi noktada biliniyor?

Ölçüm sonucu — **kodda bırakılan TODO yanlış engeli adlandırıyordu.**

TODO şunu diyordu:

> *"…should be bound to locale and catalogued in messages/&lt;locale&gt;.json once
> `createInvoiceForPayment` receives tenant locale."*

Zincir gerçekte şöyle:

```
Stripe webhook
  └─ logInvoicePayment(invoice, eventId)        src/lib/billing/subscription-sync.ts:582
       ├─ stripe.subscriptions.retrieve(...)     → tenantId = subscription.metadata.tenantId
       ├─ auditForStripeEvent(eventId)           (idempotency guard)
       ├─ prisma.auditEvent.create(...)
       └─ createInvoiceForPayment(prisma, { …, description: invoiceLineDescription(…) })
                                                 ^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^
                                                 metin BURADA, çağrı YERİNDE üretiliyor
```

İki ölçülmüş gerçek:

1. **Yedek metin `createInvoiceForPayment`'ın İÇİNDE üretilmiyor.** Çağrı yerinde,
   `subscription-sync.ts` içinde üretilip writer'a hazır `description` olarak
   geçiriliyor. Yani writer'ın locale alması hiç gerekmiyordu — **TODO'nun tarif
   ettiği engel, düzeltmenin gerektirdiği şey değildi.** Writer'ın imzasına
   dokunulmadı; iyzico yolu da (aynı writer'ı çağıran ikinci çağıran) etkilenmedi.

2. **Locale zaten kayıtlı: `Tenant.locale`.** `prisma/schema.prisma:25` —
   `locale String @default("tr")`. `tenantId` çağrı yerinde satır 594'te elde
   ediliyor, açıklama satır 662'de üretiliyor; arada 68 satır var.

   ```
   $ grep -n "locale" prisma/schema.prisma | head
   25:  locale        String   @default("tr")     ← model Tenant (satır 18'de tanımlı)
   67:  locale        String   @default("tr")     ← model User
   ```

**Maliyet ölçümü:** birincil anahtarla tek `Tenant` okuması (`select: { locale: true }`).
Bu yol zaten olay başına 1 Stripe API çağrısı + 2 DB gidiş-dönüşü yapıyor; okuma
idempotency guard'ından SONRA, yani yeniden teslim edilen bir olay bunun bedelini
ödemiyor. Kartın (c) şıkkı ("locale hiçbir yerde yoksa DUR ve karar getir")
**tetiklenmedi** — locale mevcut, uydurma varsayılan seçilmedi.

### (b) Locale taşındı, metin kataloğa alındı — mevcut desen tekrarlandı

Yeni desen icat edilmedi. `TASK-MTTUSZF4QSFGU`'de kurulan yol aynen kullanıldı:
`efatura.ts` senkron, React-dışı bir modül; `useTranslations()` de
`await getTranslations()` de kullanamıyor, bu yüzden katalog `messages/<locale>.json`'dan
doğrudan okunuyor (`INVOICE_CATALOGS`). Marka adı için `src/lib/brand.ts`'in
`withBrand()` deseni — `document-exporter.ts`'in beş yerde yaptığının aynısı.

- `messages/{tr,en}.json` → `invoice.linePeriodFallback`, **iki dile de** (CLAUDE.md #8):
  - tr: `"{brand} abonelik dönemi"`
  - en: `"{brand} subscription period"`
- Marka adı katalogda **literal değil**, `{brand}` yer tutucusu; `withBrand()`
  `PRODUCT_NAME`'i yerleştiriyor. (2026-Q1'deki yeniden adlandırma 32 dosyaya literal
  kopyalanmıştı; `brand.ts` tam olarak bunu önlemek için var.)
- `src/lib/efatura.ts` → `invoiceLinePeriodFallback(locale)` **dışa aktarıldı**.
  `INVOICE_CATALOGS`'un **üçüncü bir kopyası çıkarılmadı**: `invoice.*` ad alanının
  sahibi bu modül, tek okuyucu orada kaldı.
- `src/lib/billing/subscription-sync.ts` → `invoiceLineDescription(invoice, locale)`.

**Bilinçli sınır:** Stripe'ın KENDİ gönderdiği açıklama çevrilmiyor, olduğu gibi
geçiyor. O, alıcının checkout'ta kabul ettiği ifadedir; müşterinin onayladığı satırı
bizim seçtiğimiz kelimelerle yeniden yazmak faturayı satışla çelişkiye düşürürdü.
Çeviriye giren yalnız *bizim yazdığımız* cümle. (Test: "never translates the
description Stripe itself sent".)

### (c) TODO silindi

Sahipsiz TODO bırakılmadı ve kart koduyla da bırakılmadı — iş bitti, engel gerçek
değildi. Yerine ölçülmüş gerçeği anlatan bir açıklama yazıldı.

```
$ grep -rn "TODO" src/lib/billing/subscription-sync.ts
(no TODO left in subscription-sync.ts)
```

### (d) Yolda BENİM ÜRETTİĞİM bir hatayı yakalayıp düzelttim

İlk hâlde `Tenant` okumasını `try` bloğunun **dışına** koymuştum. Bu, o dosyanın
açıkça verdiği garantiyi bozuyordu:

> *"a genuine database failure is caught here so a webhook Stripe will retry does not
> replay the whole subscription sync for it."*

DB düşükse `prisma.tenant.findUnique` fırlar, `logInvoicePayment` fırlatarak çıkar ve
Stripe tüm webhook'u yeniden oynatır — catch'in var olma sebebinin tam tersi. Okuma
`try`'ın içine alındı ve bunu yakalayan bir regresyon testi yazıldı (§2.3'te kırmızıya
dönebildiği kanıtlı).

---

## 2. Kanıt

### 2.1 GERÇEK fatura, gerçek DB, yedek dala GERÇEKTEN düşerek — TR ve EN

Kartın şartı: *"birim test TEK BAŞINA YETMEZ, bu metin belgeye basılıyor."*

Gerçek `logInvoicePayment` gerçek veritabanına karşı sürüldü (yalnız Stripe'ın kendi
API'si stub'landı — sağlayıcı bir testin ulaşamayacağı tek şey), `lines[0].description`
**boş** olacak şekilde; sonra yazılan satır, export route'unun kullandığı **aynı**
`buildInvoiceDocument` + `generateEfaturaHtml` ile belgeye render edildi.

```
$ npx vitest run tests/evidence-invoice-line-fallback.test.ts --reporter=verbose --disable-console-intercept

===== Tenant.locale = "tr" =====
  Invoice number   : FB-2026-000001
  paymentRef       : in_ev_tr_ev-1789028134800
  STORED line name : FonBridge abonelik dönemi
  RENDERED row     : 1 | FonBridge abonelik dönemi | 1 Ay | ₺1.000,00 | %20 | ₺1.000,00
  page contains it : true

===== Tenant.locale = "en" =====
  Invoice number   : FB-2026-000001
  paymentRef       : in_ev_en_ev-1789028134800
  STORED line name : FonBridge subscription period
  RENDERED row     : 1 | FonBridge subscription period | 1 month | ₺1.000,00 | 20% | ₺1.000,00
  page contains it : true

 ✓ tests/evidence-invoice-line-fallback.test.ts > TASK-MTV8W14FY9BKD evidence >
   writes and renders the fallback line in the tenant own language 207ms

 Test Files  1 passed (1)
      Tests  1 passed (1)
```

`STORED line name` = veritabanına gerçekten yazılan `Invoice.lines[0].name`.
`RENDERED row` = müşterinin indirdiği sayfadaki satırın hücreleri.

Bu dosya **`tests/` altında bırakılmadı**: canlı DB gerektiriyor, oysa depodaki tüm
vitest testleri DB'yi mock'luyor; `pnpm test`'i DB'ye bağımlı hâle getirmek kapıyı
yanıltırdı. Yeniden üretilebilsin diye kaynağı
`docs/agent-results/TASK-MTV8W14FY9BKD-evidence/invoice-line-fallback.evidence.ts`
altında duruyor (çalıştırmak için `tests/` altına `*.test.ts` adıyla kopyalayın).

### 2.2 Birim testler — 12/12

```
$ npx vitest run src/lib/billing/subscription-sync.test.ts
 Test Files  1 passed (1)
      Tests  12 passed (12)
```

Yeni `when Stripe sends no line description` bloğu: TR, EN, tanınmayan locale (`de` →
Türkçe'ye düşer), kiracı satırı okunamaz (→ Türkçe), katalogda marka literali yok,
Stripe'ın kendi metni çevrilmiyor, ve DB düşükken ödeme ayakta kalıyor.

### 2.3 Yeni regresyon testi KIRMIZIYA DÖNEBİLİYOR (disproof)

`Tenant` okuması bilerek `try`'ın dışına geri taşındı:

```
### DISPROOF — read moved back outside the try:
       × lets the payment stand when the tenant lookup itself fails 2ms
 FAIL  src/lib/billing/subscription-sync.test.ts > logInvoicePayment >
       when Stripe sends no line description > lets the payment stand when the tenant lookup itself fails
      Tests  1 failed | 11 passed (12)
### RESTORED:
      Tests  12 passed (12)
```

### 2.4 `pnpm i18n:check` — yeşil

```
$ pnpm i18n:check
✅ i18n check passed: both catalogs agree and every key used in src/ resolves.

$ pnpm i18n:check | grep -i "linePeriodFallback"
linePeriodFallback: reached from src/ (not flagged)
```

Yeni anahtar "kataloglarda var ama src/'den ulaşılmıyor" listesinde **değil** — yani
gerçekten okunuyor, ölü katalog girdisi değil.

### 2.5 `pnpm gate` — HANGİ COMMIT ÜZERİNDE ve ne çıktı

Kapı, **`545f412`** HEAD'i üzerindeki çalışma ağacında koşturuldu.
Bu commit'teki kapı tanımı (package.json):

```
"gate": "pnpm db:generate && pnpm lint && pnpm typecheck && pnpm test && pnpm i18n:check && pnpm rls:check && pnpm rls:verify && pnpm test:e2e"
```

**Kapı YEŞİL DEĞİL ve saklamıyorum.** Aşama aşama:

| Aşama | Sonuç | Benim mi? |
|---|---|---|
| `db:generate` | ✅ | — |
| `lint` | ❌ 1960 error / 21724 warning | **HAYIR** (§6.1) |
| `typecheck` | ✅ exit 0 | — |
| `test` | ❌ 3 failed / 1700 passed | **HAYIR** (§6.2) |
| `i18n:check` | ✅ | — |
| `rls:check` | ✅ 44 model | — |
| `rls:verify` | ✅ 44 tabloda canlı ölçüm | — |
| `test:e2e` | ❌ 9 failed / 142 passed | **HAYIR** (§6.3) |

Kendi dosyalarım lint'ten temiz geçiyor:

```
$ npx eslint src/lib/billing/subscription-sync.ts src/lib/billing/subscription-sync.test.ts src/lib/efatura.ts
EXIT=0        (çıktı yok)
```

Lint bulgularının **tamamı** `src/` dışında:

```
$ pnpm lint | grep -E "^/Users" | sed 's|.*fabrika/||' | cut -d/ -f1-2 | sort -u
.claude/worktrees
docs/agent-results
```

Diğer aşamaların tam çıktıları:

```
$ pnpm typecheck
$ tsc --noEmit
exit=0

$ pnpm test
 Test Files  2 failed | 141 passed | 2 skipped (145)
      Tests  3 failed | 1700 passed | 8 skipped (1711)

$ pnpm rls:check
✅ SUCCESS: All 44 tenant-scoped models have RLS policies registered.

$ pnpm rls:verify
✅ 44 kiracıya özel tabloda politika yerinde ve izolasyon fabrika_app rolüyle GERÇEKTEN ölçüldü

$ E2E_PORT=3131 pnpm test:e2e
  9 failed
  1 skipped
  3 did not run
  142 passed (4.6m)
```

Fatura/faturalandırma e2e'lerinin **hepsi geçti**: `invoice-export-locale`,
`invoice-write-path`, `invoice-export-real-record`, `billing-invoice-history`,
`invoice-foreign-currency-export`.

### 2.6 Kırmızıların benim olmadığının kanıtı — HEAD'de de kırmızı

Değişikliklerim `git stash` ile alındı, aynı testler `545f412` üzerinde tek başına
koşturuldu:

```
### AT HEAD 545f412, WITHOUT my changes:
 Test Files  2 failed (2)
      Tests  3 failed | 14 passed (17)        ← aynı 3 test, aynı şekilde kırmızı

### e2e, aynı yöntemle:
  8 failed        ← 9'un 8'i HEAD'de de birebir kırmızı
  3 passed
```

Dokuzuncusu (`partb-template-identity.spec.ts`) sıra-bağımlı bir flake, benim
değişikliğim değil — hem HEAD'de hem değişikliğimle **tek başına koşunca geçiyor**:

```
### HEAD, alone:              2 passed (7.7s)
### WITH my changes, alone:   2 passed (7.8s)
```

### 2.7 Commit

**`ee4d60b`** — `i18n(billing): bind the Stripe invoice fallback line to the tenant locale`

```
$ git show --name-only --oneline HEAD
ee4d60b i18n(billing): bind the Stripe invoice fallback line to the tenant locale
docs/agent-results/TASK-MTV8W14FY9BKD-evidence/invoice-line-fallback.evidence.ts
docs/agent-results/TASK-MTV8W14FY9BKD-geli-tirici.md
messages/en.json
messages/tr.json
src/lib/billing/subscription-sync.test.ts
src/lib/billing/subscription-sync.ts
src/lib/efatura.ts
```

Commit'te yalnız kendi dosyalarım var; `git add -A` kullanılmadı, yollar tek tek
verildi. Commit öncesi `git log --oneline -3` ve `git diff --cached`, sonrası
`git show --name-only` koşturuldu. Pre-commit kapısı (`eslint` staged + `tsc --noEmit`):
`✓ Kapı temiz (staged kapsamı).`

(Bu hash satırı, rapor commit'in kendisinde yer aldığı için hemen ardından gelen
küçük bir takip commit'iyle dolduruldu; kod içeriği değişmedi.)

---

## 3. Değişen dosyalar

| Dosya | Ne |
|---|---|
| `messages/tr.json` | `invoice.linePeriodFallback` — `"{brand} abonelik dönemi"` (1 anahtar) |
| `messages/en.json` | `invoice.linePeriodFallback` — `"{brand} subscription period"` (1 anahtar) |
| `src/lib/efatura.ts` | `invoiceLinePeriodFallback(locale)` dışa aktarıldı; `withBrand` import edildi |
| `src/lib/billing/subscription-sync.ts` | `Tenant.locale` okunuyor (try içinde); `invoiceLineDescription(invoice, locale)`; TODO silindi; artık kullanılmayan `PRODUCT_NAME` import'u kaldırıldı |
| `src/lib/billing/subscription-sync.test.ts` | prisma mock'una `tenant` eklendi (değişikliğim onsuz 4 testi kırıyordu); 7 yeni test |
| `docs/agent-results/TASK-MTV8W14FY9BKD-evidence/invoice-line-fallback.evidence.ts` | §2.1'i yeniden üreten kanıt betiği |
| `docs/agent-results/TASK-MTV8W14FY9BKD-geli-tirici.md` | bu rapor |

**Dokunulmayanlar (kartın DOKUNMA listesi):** `src/lib/beta/**`,
`src/app/[locale]/admin/settings/smtp-form.tsx`, `src/lib/env.ts` — hiçbirine
dokunulmadı. `src/lib/billing/invoice-writer.ts` de değişmedi (imzası korundu).

---

## 4. Riskler

1. **Locale, kiracının dili — faturayı indiren kullanıcının dili değil.** Aynı
   kiracıda İngilizce çalışan bir kullanıcı, kiracı `tr` ise Türkçe yedek satır
   görür. Bilinçli: fatura satırı **ödeme anında** yazılıyor ve o anda ortada bir
   kullanıcı yok (webhook). Belgenin *sayfası* hâlâ `?locale=` ile çevrilebiliyor;
   sabitlenen yalnız satırın kendi metni — ki bu doğrusu: satır bir kez yazılır,
   sonradan dil değiştirmek dosyalanmış belgeyi değiştirmek olurdu.
2. **`Tenant.locale` serbest metin sütunu** (`String`, enum değil). `tr`/`en` dışı
   bir değer Türkçe'ye düşer — sütunun kendi varsayılanı. Testi var, ama sütun bir
   gün üçüncü bir dil taşırsa sessizce Türkçe basar.
3. **Yedek dal yalnız Stripe hiç açıklama göndermediğinde çalışır.** Pratikte nadir;
   bu yüzden regresyonu birim testler + §2.1'deki gerçek üretim taşıyor, canlı
   trafik değil.

---

## 5. Açık sorular

1. `Tenant.locale` bir enum'a (`Locale`) çevrilmeli mi? Bugün dört yerde serbest
   `String` (`Tenant`, `User`, `Feedback`, + `Evidence.language`), hepsi elle
   `=== 'en' ? 'en' : 'tr'` ile daraltılıyor.
2. Fatura satırı **yazıldığı** dilde mi kalmalı (bugünkü davranış), yoksa belge her
   render'da okuyucunun diline mi çevrilmeli? Mali müşavir sorusu: dosyalanmış bir
   belgenin satır metni sonradan değişebilir mi?

---

## 6. Yolda görülen, DÜZELTİLMEYEN bitişik sorunlar (adıyla bildiriliyor)

### 6.1 `pnpm lint` bu makinede çalışamaz hâlde — sebep: başıboş worktree'ler

1960 error / 21724 warning'in **tamamı** `src/` dışında. Kaynak, birinin bıraktığı
worktree'ler ve onların **derleme çıktısı**:

```
/Users/macbook/AgentSpace/fabrika/.claude/worktrees/e2e-fix/.next/dev/build/chunks/[turbopack]_runtime.js
/Users/macbook/AgentSpace/fabrika/.claude/worktrees/e2e-fix/.next/dev/build/chunks/node_modules__pnpm_1a2z018._.js
/Users/macbook/AgentSpace/fabrika/.claude/worktrees/zztest-validation/docs/agent-results/…
```

eslint `.claude/worktrees/**/.next/**` içindeki üretilmiş bundle'ları tarıyor.
`vitest.config.mts` `.claude/worktrees` dizinini dışlıyor ama **eslint yapılandırması
dışlamıyor**. Sonuç: `pnpm gate` ilk adımda düşüyor ve bu makinede kapıyı koşturan
herkes aynı duvara çarpıyor. Düzeltmesi eslint ignore listesine iki satır, ama benim
kartımın kapsamı değil — kendi kartını hak ediyor.

### 6.2 Üç birim testi hâlâ emekli marka adını bekliyor

```
FAIL tests/brand-surfaces-render.test.tsx > brand surfaces > public footer renders the product name (en)
FAIL tests/brand-surfaces-render.test.tsx > brand surfaces > public footer renders the product name (tr)
FAIL tests/document-exporter.test.ts > document provenance > states that no funding body issued the document, in both languages
```

Beklenen metin `"… Fabrika'da hazırlanmıştır"`; `PRODUCT_NAME` artık `FonBridge`.
`545f412` HEAD'inde de kırmızı (§2.6). Marka geçişi kartlarının artığı.

### 6.3 e2e'de dokuz kırmızı, üç ayrı sınıf

- `theme-no-script-warning` (2) + `theme-paint-timing` (2) — tema/hydration.
- `price-lock` (3) + `document-export-tenant-isolation` (1) — HEAD'de de kırmızı.
- `partb-template-identity` (1) — **sıra-bağımlı flake**: tek başına yeşil, tam
  suite içinde kırmızı. Paylaşılan DB kirlenmesi sınıfı (TASK-MTUI9ZBK7W4JY ile aynı).

### 6.4 Playwright artık `:3000`'i devralmıyor — ama port ile aşılabiliyor

`reuseExistingServer: false` olduğundan, paylaşılan dev sunucusu ayaktayken
`pnpm test:e2e` doğrudan hata veriyor. Kardeş süreci öldürmek yasak; çözüm
worktree kurmak DEĞİL, config'in zaten sunduğu `E2E_PORT` değişkeni:
`E2E_PORT=3131 pnpm test:e2e`. Önceki turda (TASK-MTTUSZF4QSFGU) bunun için izole
worktree kurmuştum — gereksizmiş, ucuz yolu bu turda bulundu.

### 6.5 iyzico yolunda AYNI kusurun ikinci örneği — DÜZELTİLMEDİ

`src/lib/iyzico.ts:746` fatura açıklamasını hâlâ gömülü Türkçe ile üretiyor:

```ts
description: `${plan.name} (${interval === 'year' ? '1 yıl' : '1 ay'})`,
```

Bu da müşterinin indirdiği faturaya basılıyor ve **her dilde Türkçe**. Kartımın
kapsamı Stripe yolu olduğu ve `iyzico.ts` bana verilmediği için elleşmedim; sprint
kuralı gereği adıyla bildiriyorum. Düzeltmesi artık ucuz: `invoiceLinePeriodFallback`
ile aynı desen, `Tenant.locale` orada da `tenantId` ile erişilebilir durumda.

---

## 7. Sonraki adım

- §6.1 kendi kartını hak ediyor: eslint ignore'una `.claude/worktrees` — kapı bu
  makinede onsuz koşmuyor.
- §6.5 (iyzico açıklaması) bir kart: kalıp artık hazır, iş 10 satır.
- §6.2 marka testleri: beklenen metinler `PRODUCT_NAME`'e bağlanmalı.
- §5'teki iki soru karara bağlanmalı.

---

## Platform beyanı

- **Doğrulandığı platform:** macOS (Darwin 25.6.0, arm64). §2'deki her çıktı burada
  alındı: birim testler, gerçek-DB kanıt koşusu, `i18n:check`, `typecheck`, `lint`,
  `rls:check`, `rls:verify` ve Playwright/Chromium e2e.
- **Windows / Linux: koşulamadı** — bu oturumda o platformlar yok. Sessiz atlamıyorum.
- **Dokunduğum kod yolu platforma bağlı DEĞİL, ve bunu koddan söylüyorum:**
  değişiklik üç şeyden ibaret — bir Prisma `findUnique` çağrısı, saf string seçimi
  (`locale === 'en' ? 'en' : 'tr'`) ve `String.replaceAll` ile yer tutucu doldurma.
  Süreç öldürme, dosya yolu kurma (`path.join` yok), kabuk/ikili adı, kısayol metni,
  ekran/DPI, mikrofon-kamera izni **yok**. Katalog `import`'ları bundler üzerinden
  çözülüyor. Dolayısıyla Windows ve Linux'ta çıktı aynıdır.
- **Platforma bağlı olan tek şey doğrulama yöntemiydi**, ürün değil: `E2E_PORT` ile
  ikinci bir dev sunucusu ayağa kaldırmak (§6.4). Linux'ta aynısı çalışır; Windows'ta
  da `pnpm dev --port` aynı şekilde çalışır, ek bir koşul yok.
