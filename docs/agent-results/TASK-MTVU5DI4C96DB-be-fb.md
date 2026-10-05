# TASK-MTVU5DI4C96DB — iyzico webhook, kiracı bağlamı hiç açılmıyordu

**Ajan:** be-fb (BE-FB, Backend Mühendisi) · **Tip:** bug (P1, para) · **Sprint:** S12
**Bağlam:** TASK-MTVSBEO7VX6Y4 / ADR-0003 (aynı arıza sınıfının Stripe tarafındaki kapanışı) ·
docs/agent-results/TASK-MTVSBEO7VX6Y4-be-fb.md §4.1 (bu kart oradan önerildi)

> **Tek satırlık sonuç:** `handleIyzicoWebhook` parayı `prisma.$transaction` üzerinden yazıyordu,
> `app.tenant_id` hiç set edilmiyordu. `fabrika_app` (NOBYPASSRLS) altında ilk yazma
> (`Subscription.upsert`) RLS tarafından reddediliyor, **hiçbir para yazılmadan** işlem
> patlıyordu — Stripe'ın önceki arızasından farklı olarak çifte kredi değil, tam bir kesinti.
> Düzeltme: `prisma.$transaction` → `withTenant(tenantId, …)`. Zaten var olan
> `pg_advisory_xact_lock`, 8 eşzamanlı teslimatı ek bir tabloya gerek kalmadan tek satıra
> indirdiği ÖLÇÜLDÜ. Kiracı çözülemeyen/bilinmeyen durumlarda artık `SystemAlert` yazılıyor.

---

## 1. Ne yapıldı

### 1.1 Arızayı kendim ürettim — kartın (i) maddesi

`fabrika_app` rolü altında (yerel `@/lib/db` bağlantısını `DATABASE_URL_RLS_TEST`'e çevirip
üretim handler'ını o bağlantı üzerinden koşturan bir sonda — `.qa-scratch/repro-iyzico-fabrika-app.ts`,
Stripe kartındaki `repro-fabrika-app.ts` ile aynı desen):

```
handler role: {"current_user":"fabrika_app","rolbypassrls":false}
--- first delivery, role fabrika_app ---
  before: {"Subscription":0,"CreditLedger":0,"AuditEvent":0}
  handler THREW:
Invalid `tx.subscription.upsert()` invocation in
/Users/macbook/AgentSpace/fabrika/src/lib/iyzico.ts:646:27
Database error. Code: `42501`. Message: `new row violates row-level security policy for table "Subscription"`
  after first delivery: {"Subscription":0,"CreditLedger":0,"AuditEvent":0}

--- second delivery (redelivery of same event), role fabrika_app ---
  handler THREW: (aynı hata)
  after second delivery: {"Subscription":0,"CreditLedger":0,"AuditEvent":0}
```

Kartın tarifi doğruydu ama sonucu **daha kötüydü**: satırda "webhook hiç kiracı bağlamı
açmıyor" deniyordu — bu, kodun okunmasından çıkarılabilecek bir bulgu. Ölçüm bunun pratikte
ne anlama geldiğini gösterdi: `fabrika_app` altında (yani üretimde) **her tek iyzico
ödemesi** aboneliği hiç etkinleştirmeden 500 ile patlıyor. Stripe'ın arızası (para yazılıp
anahtarın yazılamaması → çifte kredi) buradan farklı ve daha basit: hiçbir yazma anahtarın
önüne bile geçmiyor, çünkü ilk yazmanın kendisi (`Subscription.upsert`) reddediliyor.
`.env`'de zaten `DATABASE_URL_RLS_TEST` ve `fabrika_app` rolü kuruluydu (Stripe kartının
bıraktığı altyapı); yeniden kurmaya gerek kalmadı.

### 1.2 Kök neden

`handleIyzicoWebhook`, Stripe'ın ADR-0003 öncesi haliyle aynı hatayı taşıyordu ama
`AuditEvent`'in `tenant_or_shared` politikasından değil, doğrudan `prisma.$transaction`'ın
hiç `set_config('app.tenant_id', …)` çağırmamasından: `Subscription`, `CreditLedger`,
`ModuleState`, `AuditEvent`, `Invoice` — hepsi `tenantId`'ye bağlı bir RLS politikası taşıyor
(`prisma/rls.sql`) ve `app.tenant_id` set edilmeden bu tabloların hiçbirine INSERT/UPDATE
geçmiyor. Yerelde bu hiç görünmedi çünkü uygulama `fabrika` rolüyle bağlanıyor
(SUPERUSER + BYPASSRLS) — RLS tamamen atlanıyor.

### 1.3 Düzeltme — kartın (ii) maddesi

Tek yapısal değişiklik: `return prisma.$transaction(async (tx) => {…})` →
`return withTenant(tenantId, async (tx) => {…})`. Transaction gövdesinin içi
değişmedi — `withTenant` zaten `set_config('app.tenant_id', tenantId, true)`'u aynı
transaction'ın ilk ifadesi olarak çalıştırıyor (`src/lib/db.ts`), yani gövde içindeki
her `tx.*` çağrısı artık doğru kiracı bağlamında çalışıyor. Bu, TASK-MTVSBEO7VX6Y4'ün
Stripe tarafına uyguladığı düzeltmenin aynısı.

**"Kiracı çözülemiyorsa iş kırılmayacak, SystemAlert üretip düşecek" (kartın kendi cümlesi).**
Kod zaten çökmüyordu — `not_attributable` / `unknown_tenant` / `unknown_plan` dallarının
hepsi `success: false` ile normal dönüyor, route.ts bunları 200 olarak yanıtlıyor (iyzico
tekrar denemesin diye). Eksik olan **operatör görünürlüğüydü**: bir ödeme geldi ve hiçbir
yere işlenmedi, ama bunu gösteren tek şey bir `console.warn` satırıydı — panelde hiç
görünmüyordu. `src/lib/observability/system-alert.ts`'in tek yazıcısı (`recordAlert`)
üzerinden, `src/lib/billing/invoice-writer.ts`'in zaten kurduğu emsal desenle (meta içinde
`tenantId` taşımak dahil — o dosyanın 402 ve 441. satırları), şu beş dala alert eklendi:
eventId çözülemedi, conversationId parse edilemedi, checkout token yok, provider'ın
kaydı başka bir conversation'a ait, tenant bulunamadı, plan bulunamadı. `recordAlert`
hiçbir zaman throw etmiyor (kendi sözleşmesi), yani bu ekleme zaten-nazik bir reddi asla
bir webhook hatasına çeviremez.

### 1.4 İdempotency — kartın (iii) maddesi: Stripe'ın karşılığı var mı?

Stripe'ın `StripeEventLog` + UNIQUE indeks çözümü, **okuma sonra yazma** deseninin
eşzamanlı iki teslimatta yarış bırakmasını kapatıyordu (§2.4,
docs/agent-results/TASK-MTVSBEO7VX6Y4-be-fb.md). iyzico'nun guard'ı bu yarışı zaten farklı
bir mekanizmayla kapatıyor: `pg_advisory_xact_lock(eventId)`, transaction'ın **ilk**
ifadesi olarak, `AuditEvent` okumasından önce çalışıyor. Postgres'te bu lock
transaction-scoped'dur — ikinci bir transaction aynı anahtarı istediğinde, birincisi
commit/rollback olana kadar **bloke olur**, kuyruğa girmez. Yani "önce oku sonra yaz"
yarışının kendisi yapısal olarak yok: iki eşzamanlı teslimat asla aynı anda "henüz
işlenmemiş" okumaz.

Bunu argüman olarak bırakmadım, ölçtüm (§2.3): 8 eşzamanlı teslimat → 1 `synced`, 7
`duplicate`, tam 1 kredi satırı, bakiye 777 (6216 değil). **Yeni bir tablo eklemedim** —
zaten kapalı olan bir yarışı ikinci kez kapatmak, düzeltme değil tekrar olurdu. Bunu kodun
içine de yorum olarak yazdım (`src/lib/iyzico.ts`, `withTenant` çağrısının hemen üstü).

### 1.5 Eşzamanlı teslimat testi — kartın (iv) maddesi

`tests/iyzico-webhook-idempotency-rls.live.test.ts` (YENİ), Stripe'ın
`stripe-webhook-idempotency-rls.live.test.ts`'i ile aynı iskelet: `DATABASE_URL`'i
`DATABASE_URL_RLS_TEST`'e çeviren bir `vi.hoisted`, üretim handler'ını gerçek Postgres'e
karşı `fabrika_app` altında koşturuyor. 6 test — hepsi `fabrika_app` altında canlı DB'ye
karşı.

---

## 2. Kanıt

### 2.1 Düzeltmeden sonra: ilk teslimat para + audit birlikte yazıyor

```
handler role: {"current_user":"fabrika_app","rolbypassrls":false}
--- first delivery, role fabrika_app ---
  before: {"Subscription":0,"CreditLedger":0,"AuditEvent":0}
  handler returned: {"success":true,"outcome":"synced","invoiceNumber":null,
    "tenantId":"t-iyzrepro-…","planId":"plan-iyzrepro-…","status":"ACTIVE",
    "amountMinor":8700,"currency":"TRY","creditsGranted":777,"disabledModules":[],…}
  after first delivery: {"Subscription":1,"CreditLedger":1,"AuditEvent":2}

--- second delivery (redelivery of same event), role fabrika_app ---
  handler returned: {"success":true,"outcome":"duplicate",…,"message":"Event … already processed; no second write"}
  after second delivery: {"Subscription":1,"CreditLedger":1,"AuditEvent":2}
```

İkinci teslimatta yazılan satır sayısı: **0**. Handler artık patlamıyor.

### 2.2 Kiracı çözülemeyen durumda: çökmüyor + SystemAlert yazıyor

`fabrika_app` altında, gerçek bir tenant'a hiç karşılık gelmeyen bir conversationId ile:

```
handler returned (did NOT throw): {"success":false,"outcome":"unknown_tenant",
  "tenantId":"t-ghost-…","message":"Tenant not found: t-ghost-…"}
alert rows before/after: 0 1
alert row: {"id":"…","level":"warn","source":"iyzico_webhook_unattributed",
  "message":"iyzico notification could not be synced: Tenant not found: t-ghost-…",
  "meta":{"reason":"unknown_tenant","eventId":"ref-…","tenantId":"t-ghost-…",
  "alertDedupeKey":"unknown_tenant:t-ghost-…"},"resolvedAt":null}
```

### 2.3 8 eşzamanlı teslimat — StripeEventLog eşdeğerine gerek yok, ölçüldü

```
$ npx tsx .qa-scratch/repro-iyzico-concurrency.ts
wave=8 synced=1 duplicate=7 rejected=0 | subscriptions=1 creditRows=1 balance=777 audits=2
```

Sonra kalıcı test içinde tekrar:

```
$ npx vitest run tests/iyzico-webhook-idempotency-rls.live.test.ts --reporter=verbose
 ✓ the handler really is running as a role the policies apply to
 ✓ a first delivery writes the money and the audit trail together
 ✓ a redelivery of the same event changes no row
 ✓ a new event id does move the same rows
 ✓ an unresolvable tenant does not throw and raises an operator-visible alert
stdout: wave=8 synced=1 duplicate=7 rejected=0 | creditRows=1 balance=777
 ✓ simultaneous deliveries of one event are settled by the advisory lock, not by a read
 Test Files  1 passed (1)
      Tests  6 passed (6)
```

İki kez arka arkaya koşuldu (idempotent, alert temizliği kalıcı — §2.5):
`Test Files 1 passed (1) / Tests 6 passed (6)` her ikisinde de.

### 2.4 Mutasyon — yeşil test kanıt değildir

`return withTenant(tenantId, async (tx) => {` → `return prisma.$transaction(async (tx) => {`
(gövde aynı, sadece sarmalayıcı geri alındı — arızanın orijinal hali). Kaynak
`/tmp/iyzico.ts.bak`'a yedeklendi, mutasyondan sonra birebir geri yüklendi ve
`diff`'le doğrulandı.

```
$ npx vitest run tests/iyzico-webhook-idempotency-rls.live.test.ts
 ✓ the handler really is running as a role the policies apply to
 ✓ a first delivery writes the money and the audit trail together        (RLS hatasıyla FAIL — [1/4])
 × a first delivery writes the money and the audit trail together
   Database error. Code: `42501`. new row violates row-level security policy for table "Subscription"
 × a new event id does move the same rows
   (aynı 42501 hatası)
 × simultaneous deliveries of one event are settled by the advisory lock, not by a read
   expected +0 to be 1
 Test Files  1 failed (1)
      Tests  4 failed | 2 passed (6)
```

4/6 test kırmızı oldu — tam da düzeltmenin hedeflediği dört iddia. Restore sonrası:

```
$ diff /tmp/iyzico.ts.bak src/lib/iyzico.ts
(fark yok)
$ npx vitest run tests/iyzico-webhook-idempotency-rls.live.test.ts src/lib/iyzico.test.ts
 Test Files  2 passed (2)
      Tests  29 passed (29)
```

### 2.5 Kendi bulduğum bir kusuru kendim düzelttim: alert temizliği

İlk koşumda `pnpm alerts:check` yeni bir öksüz-alarm sınıfı buldu — kendi testimin
ürettiği: "kiracı çözülemiyor" testi hiç var olmayan bir `t-ghost-<RUN>` kiracısı adına
alert yazıyor, ama dosyanın `wipe()`'ı yalnız gerçek `TENANT`'ı temizliyordu. 3 kere
koşturduğum ölçüm sondası + testin kendisi 5 tane `iyzico_webhook_unattributed` öksüz
satırı bıraktı:

```
$ npx tsx scripts/check-orphan-alerts.ts
❌ 7 açık alarm, artık var olmayan bir kiracıyı gösteriyor
   •  5 satır ← "iyzico_webhook_unattributed"
   •  2 satır ← "invoice_buyer_identity_missing" (benim repro sondalarımdan, t-iyzrepro-…/t-iyzwave-…)
```

`tests/iyzico-webhook-idempotency-rls.live.test.ts`'in `wipe()`'ına `GHOST_TENANT` için de
bir `systemAlert.deleteMany` eklendi; kendi sondalarımın bıraktığı 7 satır elle silindi.
İki kez arka arkaya koşu sonrası:

```
$ npx tsx scripts/check-orphan-alerts.ts
tenant'ı SİLİNMİŞ (öksüz)         : 0
✅ Öksüz alarm yok
```

### 2.6 Birim testler — mock'a `withTenant` eklendi, 23/23 değişmeden geçti

`src/lib/iyzico.test.ts`'in `@/lib/db` mock'u yalnız `{ prisma }` dışa veriyordu;
`withTenant` import edilince tanımsız kalırdı. Mock'a `withTenant: vi.fn(async (_t, cb) =>
cb(prisma))` eklendi — transaction istemcisi zaten `prisma` mock'unun kendisiydi
(`$transaction: vi.fn((fn) => fn(prisma))`), yani her mevcut `prisma.<tablo>.*` iddiası
hâlâ aynı yazmayı gözlemliyor. 23 test, hiçbiri gevşetilmeden, hiçbiri eklenmeden geçti.

```
$ npx vitest run src/lib/iyzico.test.ts
 Test Files  1 passed (1)
      Tests  23 passed (23)
```

### 2.7 `pnpm typecheck` · `pnpm lint`

```
$ npx tsc --noEmit
(çıktı yok)
$ npx eslint src/lib/iyzico.ts src/lib/iyzico.test.ts tests/iyzico-webhook-idempotency-rls.live.test.ts
(çıktı yok)
```

### 2.8 Tam paket — üç dosya benim değil, kanıtladım

```
$ npx vitest run
 Test Files  3 failed | 159 passed | 2 skipped (164)
      Tests  19 failed | 1893 passed | 8 skipped (1920)
```

Kırmızı olanlar: `tests/api/v1-calls.test.ts`, `tests/api/v1-opportunities.test.ts`,
`tests/api/v1-partners.test.ts` — hiçbiri `iyzico`'ya değinmiyor
(`grep -rn iyzico tests/api/v1-*.test.ts` → boş). Kaynağı ölçtüm, iddia olarak bırakmadım:

```
$ git status --porcelain -- src/lib/api-auth.ts
 M src/lib/api-auth.ts
```

Bu dosya benim dokunmadığım, **paylaşılan çalışma ağacında bir başka ajanın şu an sürmekte
olduğu** bir değişiklik taşıyor (`withSystemScope` ekleyen, `docs/agent-results/
TASK-MTVTPVTEBCF5Z-de-fb.md`'ye atıf yapan bir yorum içeriyor) ve şu an `AUTH_INTERNAL_ERROR`
döndürüyor — kendi kartının henüz bitmemiş hali. Bu üç dosyayı hariç tutarak koştum:

```
$ npx vitest run --exclude "**/tests/api/v1-calls.test.ts" --exclude "**/tests/api/v1-opportunities.test.ts" --exclude "**/tests/api/v1-partners.test.ts"
 Test Files  159 passed | 2 skipped (161)
      Tests  1887 passed | 8 skipped (1895)
```

İki kez koştum (yukarıdaki tam-paket komutu), ikisinde de aynı 3 dosya aynı şekilde kırmızı
— geçici bir kayıt sırası değil, o dosyanın şu anki (bitmemiş) hali. Bu kartın kapsamı
`src/lib/iyzico.ts`; `src/lib/api-auth.ts` orada değil ve ona dokunmadım.

### 2.9 `pnpm rls:check` · `pnpm rls:verify` · `pnpm alerts:check`

```
$ npx tsx scripts/check-rls.ts
✅ SUCCESS: All 46 tenant-scoped models have RLS policies registered.
✅ SUCCESS: every one of them carries ENABLE + FORCE + tenant_isolation in its own migration.

$ npx tsx scripts/check-rls-live.ts
Ölçüm rolü: fabrika_app (rolsuper=false, rolbypassrls=false)
   ✓ okuma (negatif) · ✓ okuma (pozitif) · ✓ yazma (negatif) · ✓ yazma (pozitif) · ✓ yazma (çapraz)
✅ 46 kiracıya özel tabloda politika yerinde ve izolasyon fabrika_app rolüyle GERÇEKTEN ölçüldü

$ npx tsx scripts/check-orphan-alerts.ts
tenant'ı SİLİNMİŞ (öksüz) : 0
✅ Öksüz alarm yok
```

### 2.10 `pnpm rls:bypass-check` — benim değil, ölçtüm

```
$ npx tsx scripts/check-tenant-bypass.ts
⚠ Outstanding tenant-bypass debt: 4 call site(s), measured.
  [TASK-MTVTMZXYT84RZ] src/lib/billing/create-portal-session.ts — subscription.findUnique (x1)
  [TASK-MTVTMZXYT84RZ] src/lib/billing/lifetime-licence.ts — lifetimeLicence.create (x1)
  [TASK-MTVTRNORO1ES8] src/lib/billing/storefront.ts — tenantId-fallback (x1)
  [TASK-MTVTRNORO1ES8] src/modules/m6/server/esr-parser.ts — tenantId-fallback (x1)
❌ rls:bypass-check FAILED.
```

Hepsi başka görev kodları taşıyor (`TASK-MTVTMZXYT84RZ`, `TASK-MTVTRNORO1ES8`) ve `src/lib/iyzico.ts`
bu listede hiç geçmiyor. `scripts/tenant-bypass-baseline.json` benim değişikliğim değil
(`git diff --stat` boş) — bu kart açılmadan önceki commit halinde. Kendi eklediğim koddan
(withTenant çağrısı, recordAlert çağrıları) bu tarayıcının yakalayacağı hiçbir doğrudan
`prisma.<model>.` çağrısı çıkmıyor; withTenant zaten sarmalayıcının kendisi.

### 2.11 e2e

Bu kart bir webhook yolu; insan yüzeyi yok, tıklanacak bir düğme yok
(`grep -ln "handleIyzicoWebhook" tests/e2e/*.spec.ts` → boş). Stripe kardeş kartının
§2.8'inde aynı gerekçeyle e2e'ye girilmedi. Gerçek etkileşim kanıtı §2.1–2.3'teki, üretimde
koşacak rol altında gerçek Postgres'e karşı koşan ölçümler.

### 2.12 Sonda verisi temizlendi

```
$ npx tsx scripts/check-orphan-alerts.ts   (son koşu)
✅ Öksüz alarm yok
```

`.qa-scratch/repro-iyzico-*.ts` ve `read-rls-url.mjs` silindi (gitignore'lu, hiçbir zaman
commit edilmedi). `.qa-scratch/` paylaşılan bir dizin — yalnız kendi dosyalarım silindi,
dizinin kendisi veya başka ajanların (`devop-fb/`) sondaları dokunulmadı.

---

## 3. Değişen dosyalar

| Dosya | Ne |
|---|---|
| `src/lib/iyzico.ts` | `prisma.$transaction` → `withTenant(tenantId, …)` · 6 dala `alertTenantUnresolved` (→ `recordAlert`) eklendi · +64 / −3 |
| `src/lib/iyzico.test.ts` | `@/lib/db` mock'una `withTenant` eklendi (transaction istemcisi `prisma` mock'unun kendisi kalıyor) · +8 |
| `tests/iyzico-webhook-idempotency-rls.live.test.ts` | **YENİ** — 6 canlı test, `fabrika_app` altında |
| `docs/agent-results/TASK-MTVU5DI4C96DB-be-fb.md` | bu rapor |

Dokunulmayanlar: `src/app/api/webhooks/iyzico/route.ts` (dönüş şekli değişmedi,
düzenlemeye gerek olmadı — `not_attributable`/`unknown_tenant`/`unknown_plan` zaten 200
olarak yanıtlanıyordu), `src/lib/observability/system-alert.ts`, `src/lib/db.ts`,
`prisma/schema.prisma`, `prisma/rls.sql` (yeni tablo yok — §1.4), `src/lib/api-auth.ts`
(başka ajanın işi, §2.8), `scripts/tenant-bypass-baseline.json`.

---

## 4. Riskler

1. **`createInvoiceForPayment` hâlâ `tx` üzerinden çalışıyor, artık `withTenant`'ın
   içinde.** Stripe tarafında (`subscription-sync.ts`) fatura yazımı transaction'ın
   *dışında*, bare client üzerinden çalışıyor (TCMB kur çağrısı ve kendi SystemAlert'leri
   olduğu için). iyzico tarafı bunu değiştirmedi — invoice yazımı zaten `tx` parametresi
   alıyordu (TASK-MTSWL8ADKZKDM'den beri) ve `withTenant`'ın içinde kalmaya devam ediyor.
   Bu bir regresyon değil (davranış aynı, sadece artık gerçekten çalışıyor), ama iki
   sağlayıcının fatura yazma noktası artık simetrik değil — biri transaction içinde, biri
   dışında. Bilinçli bir fark mı yoksa borç mu, ayrı bir karar.
2. **`alertTenantUnresolved` her not_attributable/unknown_* dalında `recordAlert` çağırıyor,
   ama `payment_not_successful` dalında çağırmıyor.** Bilinçli: kart bunu istemiyor
   ("kiracı çözülemiyorsa"), ve bir kartın reddedilmesi rutin bir olay (müşteri kartı
   reddetti) — para hareket etmiyor, alarm değeri düşük. Ama gelecekte bu ayrım
   sorgulanabilir.
3. **iyzico advisory-lock yarışını kapatıyor, ama StripeEventLog'un ikinci faydası yok:
   tenant başına indekslenmiş bir olay-kayıt tablosu.** `AuditEvent` JSON path taraması
   (`data: { path: ['iyzicoEventId'], equals: eventId }`) indekssiz — Stripe'ın eski
   sorunu (yavaş sorgu) burada da var, sadece yarış sorunu yok. Ölçmedim (performans bu
   kartın kapsamı dışında); iyzico hacmi bugün sıfır (`Subscription.provider` her satırda
   `stripe` — Stripe kardeş raporun kendi ölçümü), yani şu an pratik bir maliyeti yok.
4. **`src/lib/api-auth.ts` şu an kırık** (§2.8) — benim değil, başka bir ajanın devam eden
   işi. Rapor ediyorum çünkü `pnpm test` tam paket koşusu bunu kırmızı gösteriyor; kartın
   sahibi kapatana kadar `pnpm gate`'in tamamı yeşil olmayacak.

---

## 5. Açık sorular

1. Rol geçişi kartının ön koşul listesi artık iki maddeydi (TASK-MTVSBEO7VX6Y4 +
   TASK-MTVU5DI4C96DB); ikisi de kapandı. Başka çıplak `prisma.$transaction` (set_config
   olmadan) var mı — Dilim 5'in statik kapısı (TASK-MTVRAZSUVLL9R) yalnız `withTenant`
   DIŞINDAKİ `prisma.<model>.` çağrılarını arıyor, `set_config`'siz `$transaction` ayrı bir
   desen (Stripe kardeş raporun 3. açık sorusu, hâlâ açık).
2. `src/lib/api-auth.ts`'in şu anki kırık hali (§2.8) rol geçişini bloke eder mi? API-key
   doğrulaması `withSystemScope` içinde WIP — geçiş öncesi bu kartın da kapanması gerekir.

---

## 6. Platform beyanı

Doğrulama **macOS**'ta yapıldı (Darwin 25.6.0, zsh, Node, yerel PostgreSQL 16). Bu kartta
dokunulan kod platforma bağlı hiçbir şey içermiyor: süreç öldürme, dosya yolu, kabuk/ikili
adı, ekran/DPI, mikrofon/kamera izni yok. Değişen şeyler — bir Prisma transaction
sarmalayıcısı (`withTenant`), bir SystemAlert çağrısı ve bir `pg_advisory_xact_lock`
kullanımı — tümü platformdan bağımsız; Windows ve Linux'ta aynı sonucu verir.
**Windows ve Linux'ta koşulmadı** — bu ofiste yalnız macOS makinesi var; eksikliğin
sebebi ortam, kod değil.
