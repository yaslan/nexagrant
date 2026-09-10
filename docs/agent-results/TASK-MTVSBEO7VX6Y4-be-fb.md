# TASK-MTVSBEO7VX6Y4 — Stripe webhook idempotency, `fabrika_app` rolü altında

**Ajan:** be-fb (BE-FB, Backend Mühendisi) · **Tip:** bug (P1, para) · **Sprint:** S12
**ADR:** [`docs/adr/ADR-0003-stripe-webhook-idempotency-key.md`](../adr/ADR-0003-stripe-webhook-idempotency-key.md)
**Bağlam:** TASK-MTVRACMDFRGKV §2.4 (bulgu) · TASK-MTSZ0AL4QP2CT §3.5 (`AuditEvent` kapsam kararı) · TASK-MTSY88Q6AMCGB (aynı hatanın ilk kapanışı)

> **Tek satırlık sonuç:** İdempotency anahtarı `AuditEvent`'ten çıkarılıp UNIQUE kısıtlı kendi tablosuna (`StripeEventLog`) taşındı ve parayı yazan transaction'ın **ilk** ifadesi yapıldı. `fabrika_app` altında tekrar teslimat artık **hiçbir tabloya 0 satır** yazıyor; handler ortasında çökme senaryosunda "para yazıldı, anahtar yazılmadı" hâli **ölçümle üretilemiyor**.

---

## 1. Ne yapıldı

### 1.1 Bulguyu kendim tekrarladım (kartın (a) maddesi)

Başkasının raporunu kanıt saymadım. `@/lib/db` bağlantı dizesini modül kapsamında
okuduğu için, `process.env.DATABASE_URL`'i `DATABASE_URL_RLS_TEST` ile
değiştirip modülü ondan sonra yükleyen bir sonda yazdım
(`.qa-scratch/repro-fabrika-app.ts`) ve **üretim handler'ını** o bağlantı
üzerinden koşturdum.

```
handler role: {"current_user":"fabrika_app","rolbypassrls":false}

--- first delivery, role fabrika_app ---
  before: Subscription=0 AddOn=0 CreditLedger=0 AuditEvent=0
  handler THREW: Invalid `prisma.auditEvent.create()` invocation
  after first delivery: Subscription=1 AddOn=1 CreditLedger=1 AuditEvent=0

--- guard visibility ---
  guard row visible as fabrika (BYPASSRLS):        1
  guard row visible as fabrika_app, no tenant set: 0
  guard row visible as fabrika_app, tenant set:    1

--- verdict ---
  money written on a delivery that threw: Subscription=1 CreditLedger=1
  idempotency key written:                AuditEvent=0
```

Kök neden §1.2'de; kısaca: `AuditEvent.tenantId` nullable olduğu için tablo
`tenant_or_shared` politikasını taşıyor ve kiracısı **olan** bir satır ancak
`app.tenant_id` o kiracıya ayarlıyken yazılıp okunabiliyor — anahtar ise en
sonda, `withTenant`'ın dışında yazılıyordu.

### 1.2 Ölçüm raporlanan bulguyu bir yerde DÜZELTTİ

Kart "her tekrar gönderimde bir aylık kredi tahsisi daha" diyordu. Kendi
ölçümüm bunu doğrulamadı ve daha küçük ama hâlâ gerçek bir şey buldu. Düz bir
tekrar gönderim ACTIVE bir satırın üstüne geldiğinde tahsis dalı hiç
çalışmıyor (`if (!existingSubscription …) else if (existing.status !== 'ACTIVE' …)`).
İki rolü yan yana koşturdum (`.qa-scratch/repro-money-loop.ts`):

```
=== as fabrika (BYPASSRLS, bugün) ===          === as fabrika_app (rol geçişinden sonra) ===
1. active (1. teslimat): ok                    1. active (1. teslimat): THREW — auditEvent.create
   {"balance":777,"rows":1,"audits":1,            {"balance":777,"rows":1,"audits":0,
    "status":"ACTIVE"}                             "status":"ACTIVE"}
2. cancellation: ok                            2. cancellation: THREW — auditEvent.create
   {"balance":777,"audits":2,                     {"balance":777,"audits":0,
    "status":"CANCELED"}                           "status":"CANCELED"}
3. bayat active TEKRAR: already processed      3. bayat active TEKRAR: THREW
   {"balance":777,"rows":1,                       {"balance":1554,"rows":2,
    "status":"CANCELED"}                           "status":"ACTIVE"}     <-- ikinci tahsis + dirilme
4./5. tekrar: already processed                4./5. tekrar: satır ACTIVE olduğu için tahsis yok

VERDICT (fabrika):     credit rows=1 balance=777
VERDICT (fabrika_app): credit rows=2 balance=1554
```

Yani kayıp **iptal → bayat `active` tekrar gönderimi** döngüsü başına bir
tahsis + bir dirilme. Paradan daha kötü olan kısım dirilme: ücretsiz plana
düşmüş bir kiracı ücretli erişimini geri alıyor. Raporlanandan küçük, sıfırdan
büyük; kartı küçültmek için yazmıyorum, doğru sayıyı kayda geçirmek için.

İkinci, ayrı bir kırılma: `logInvoicePayment` denetim satırını faturadan
**önce** yazıyor, dolayısıyla `fabrika_app` altında hiç fatura kesilmiyordu.
Bu, `AuditEvent` yazması sarmalayıcıya alınınca kendiliğinden düzeldi.

### 1.3 Seçenek karşılaştırması ve karar (kartın (b)/(c) maddeleri)

Tam metin ADR-0003'te; özet:

| | A: anahtarı `withTenant`'a al (`AuditEvent` kalır) | B: anahtarı paradan önce yaz (`AuditEvent` kalır) | **C: `StripeEventLog` + UNIQUE** |
|---|---|---|---|
| Migration | yok | yok | **var** (+ RLS + DATA_MODEL) |
| `fabrika_app` altında çalışır | ✅ | ✅ | ✅ |
| Handler ortasında çökme (para↔anahtar atomik) | ✅ | ✅ | ✅ |
| **İki EŞZAMANLI teslimat** | ❌ | ❌ | ✅ |
| Anahtar indeksli sütun mu | ❌ (Json yol taraması) | ❌ | ✅ |
| Kilit ↔ denetim izi ayrı mı | ❌ | ❌ | ✅ |

B, A'nın eksiğini gidermiyor: tek bir transaction içinde ifade **sırası**
atomikliğe hiçbir şey katmaz (ya hepsi commit olur ya hiçbiri). Sıranın değer
taşıdığı tek durum, çakışmayı veritabanının reddettiği bir UNIQUE kısıttır.

**Seçenek C uygulandı.** Eşzamanlılık farkı teorik değil, ölçüldü — §2.4'teki
mutasyon: kısıt kaldırıldığında 8 eşzamanlı teslimat **8 kredi satırı** yazıyor
(777 yerine 6216 kredi).

### 1.4 Uygulanan değişiklik

1. **`StripeEventLog`** (yeni, kiracıya özel): `tenantId` NOT NULL,
   `stripeEventId` UNIQUE, `handler`, `processedAt`. `tenantId` NOT NULL olması
   tablonun düz `tenant_isolation` politikasını almasını sağlıyor — yani
   `withTenant`'ın içinde parayla birlikte yaşıyor.
2. **Migration** `prisma/migrations/add-stripe-event-log/` — tablo + UNIQUE
   indeks + FK + `ENABLE`/`FORCE`/`tenant_isolation` (§16 kuralı) + `fabrika_app`
   GRANT + **`AuditEvent`'ten geriye dönük dolum**. `down.sql` geri alma yolu.
3. **Üç handler** (`syncStripeSubscription`, `handleSubscriptionCancellation`,
   `logInvoicePayment`): `tenantId` guard'dan önce çıkarılıyor · guard okuması
   kiracı kapsamında (hızlı yol) · `claimStripeEvent` para transaction'ının
   **ilk** ifadesi · `auditEvent.create` artık transaction'ın **içinde** ·
   P2002 çakışması transaction'ı geri alıp `skipped` döndürüyor.
4. **`prisma/rls.sql`** tenant-scoped dizisine `StripeEventLog` eklendi
   (46 model).
5. `docs/DATA_MODEL.md` §17 + §1'e `AuditEvent`'in neden anahtar olamayacağına
   dair uyarı.

Para hesaplarına dokunulmadı: `creditsForUsage`, `src/lib/money.ts`,
`price-lock.ts`, `invoice-writer.ts` bu kartta açılmadı.

---

## 2. Kanıt

### 2.1 Migration: additive + idempotent (iki kez koşma kanıtı) + geri alma

Dolum boş bir dev veritabanında hiçbir şey kopyalamadığı için yeşil koşu
tek başına kanıt değildi. Dolumun bulması gereken satırları ektim — aynı olay
id'sini taşıyan **iki** denetim satırı ve kiracısı **olmayan** bir KVKK satırı
dahil — ve migration'ı üst üste koşturdum (`.qa-scratch/backfill-proof.ts`):

```
planted 4 AuditEvent rows (2 share one event id, 1 is tenant-less)
before run 2: {"mine":[],"total":0}
after run 2: total=2 mine=2
   evt-bf-…-a  handler=subscription.sync  processedAt=2026-09-10T12:44:43.708Z
   evt-bf-…-b  handler=invoice.payment    processedAt=2026-09-10T14:44:43.708Z
after run 3: total=2 mine=2
   evt-bf-…-a  handler=subscription.sync  processedAt=2026-09-10T12:44:43.708Z
   evt-bf-…-b  handler=invoice.payment    processedAt=2026-09-10T14:44:43.708Z
tenant-less erasure event copied? no (correct)
duplicate event id: one row, processedAt == oldest audit row? yes (correct)
cleanup done; StripeEventLog rows left in db: 0
```

Üçüncü koşu ikinci koşunun sayılarını **değiştirmedi** → idempotent. Geri alma
yolu da koşuldu:

```
=== ROLLBACK (down.sql) ===
BEFORE: table=true  rows=0 policies=1
AFTER : table=false rows=null policies=0
=== ROLLBACK TWICE (idempotent?) ===
BEFORE: table=false rows=null policies=0
AFTER : table=false rows=null policies=0
=== RE-APPLY ===
BEFORE: table=false rows=null policies=0
AFTER : table=true  rows=0 policies=1
```

Tablonun son hâli veritabanından okundu:

```
StripeEventLog_pkey                     UNIQUE INDEX … (id)
StripeEventLog_stripeEventId_key        UNIQUE INDEX … ("stripeEventId")
StripeEventLog_tenantId_processedAt_idx INDEX        … ("tenantId","processedAt")

policyname        qual / with_check
tenant_isolation  ("tenantId" = current_setting('app.tenant_id'::text, true))
```

`npx prisma migrate status` → `6 migrations found … Database schema is up to date!`

### 2.2 Kartın istediği ölçüm: birinci teslimat + tekrar teslimat, tablo tablo

`fabrika_app` rolü altında, üretim handler'ı (`.qa-scratch/final-measure.ts`):

```
handler role: fabrika_app (rolbypassrls=false)

table            empty  1st delivery  redelivery  redelivery #2
Subscription         0             1           1              1
AddOn                0             1           1              1
CreditLedger         0             1           1              1
AuditEvent           0             1           1              1
StripeEventLog       0             1           1              1

handler returns: 1st="ACTIVE" credits=777 · 2nd="skipped" credits=0 · 3rd="skipped" credits=0
credit balance after three deliveries: 777 (one grant = 777)
rows written by the two redeliveries: 0
```

**İkinci teslimatta yazılan satır sayısı: 0.** Ve handler artık patlamıyor.

### 2.3 Kalıcı test: `tests/stripe-webhook-idempotency-rls.live.test.ts` (YENİ)

Mevcut `stripe-webhook-idempotency.live.test.ts` guard'ı `prisma`
singleton'ıyla ölçüyor; o bağlantı yerelde `fabrika` (SUPERUSER + BYPASSRLS),
yani her politika atlanıyor. Bu yeni dosya singleton'ı `@/lib/db`
yüklenmeden önce `fabrika_app`'e çeviriyor (`vi.hoisted`) ve üretim
handler'larını o rol üzerinden koşturuyor.

```
$ npx vitest run tests/stripe-webhook-idempotency-rls.live.test.ts --reporter=verbose
 ✓ the handlers really are running as a role the policies apply to 11ms
 ✓ a first delivery writes the money, the key and the audit row together 37ms
 ✓ a redelivery of the same event changes no row in any of the five tables 4ms
 ✓ a new event id does move the same rows 10ms
 ✓ a stale active event replayed after a cancellation grants no second allowance 24ms
 ✓ a crash after the money cannot leave the key behind, or the money without it 24ms
 ✓ simultaneous deliveries of one event are settled by the database, not by a read 26ms
 Test Files  1 passed (1)
      Tests  7 passed (7)
```

İlk test dekorasyon değil kapı: rol BYPASSRLS çıkarsa dosya sert biçimde
kırmızı olur, çünkü o durumda geri kalan yedi iddia hiçbir şey ölçmez —
bu kartı doğuran sahte yeşilin ta kendisi.

**Kartın (d) maddesi** — "handler ortasında çökme" — argüman değil ölçüm:
`AuditEvent` üzerine, YALNIZ bu koşunun kendi satırlarını hedefleyen
(`NEW."target" = '<bu koşunun sub id'si>'`) geçici bir `BEFORE INSERT` trigger'ı
kuruluyor; trigger para yazmalarından **sonra**, transaction'ın içinde patlıyor.
İddia: hiçbir sayı değişmedi ve olay hâlâ **sahiplenilmemiş** (yani Stripe'ın
tekrar denemesi başarılı olabilir, yarım uygulanmış bir teslimat yüzünden
atlanmaz). Trigger `finally` içinde düşürülüyor.

### 2.4 Asıl kanıt — mutasyon: her mutasyon kendi hedefini kırdı

Yeşil test kanıt değildir. Üç mutasyon, üç ayrı iddiayı hedefledi.

**Mutasyon 1 — anahtar hiç yazılmıyor** (`claimStripeEvent` gövdesi boşaltıldı):
```
 ✓ the handlers really are running as a role the policies apply to
 × a first delivery writes the money, the key and the audit row together
 × a redelivery of the same event changes no row in any of the five tables
   → expected 'ACTIVE' to be 'skipped'
 × a new event id does move the same rows        → expected +0 to be 1
 × a stale active event replayed after a cancellation grants no second allowance
   → expected 'ACTIVE' to be 'skipped'
 ✓ a crash after the money cannot leave the key behind
 × simultaneous deliveries …                     → expected +0 to be 1
 Tests  5 failed | 2 passed (7)
```

**Mutasyon 2 — anahtar KENDİ transaction'ında, paradan önce commit ediliyor**
(ADR öncesi şeklin en yakın hâli). Tek bir test kırmızı oldu — ve tam da
atomiklik için var olan test:
```
 ✓ a first delivery writes the money, the key and the audit row together
 ✓ a redelivery of the same event changes no row in any of the five tables
 ✓ a new event id does move the same rows
 ✓ a stale active event replayed after a cancellation grants no second allowance
 × a crash after the money cannot leave the key behind, or the money without it
   → expected { subscriptions: 1, addOns: +0, …(4) } to deeply equal { … }
 ✓ simultaneous deliveries …
 Tests  1 failed | 6 passed (7)
```
Yani (d) maddesinin dişleri gerçekten o testte; başka hiçbir test onu
yakalamıyor.

**Mutasyon 3 — UNIQUE indeks veritabanından düşürüldü** (Seçenek A/B'nin
bıraktığı hâl). Kararı gerekçelendiren sayı burada:
```
$ DROP INDEX "StripeEventLog_stripeEventId_key"
 × simultaneous deliveries of one event are settled by the database, not by a read
wave=8 applied=8 skipped=0 rejected=0 | keys=8 creditRows=8 balance=6216
   → expected 8 to be 1
 Tests  1 failed | 6 passed (7)

$ (indeks geri kurulduktan sonra)
wave=8 applied=1 skipped=7 rejected=0 | keys=1 creditRows=1 balance=777
 Tests  7 passed (7)
```
Kısıt olmadan 8 eşzamanlı teslimat 8 kredi tahsisi yazıyor: **6216 yerine 777.**

Her mutasyondan sonra kaynak yedekten geri alındı ve birebir doğrulandı:
```
$ diff -q .qa-scratch/subscription-sync.ts.bak src/lib/billing/subscription-sync.ts
source identical to pre-mutation backup
```

Yan bulgu (mutasyonla ölçülen, düzeltme gerektirmeyen): hızlı yol guard'ı
çıplak istemciye çevrilse bile davranış doğru kalıyor — RLS okumayı gizler,
transaction içindeki claim P2002 alır ve `skipped` döner. Doğruluk hızlı yola
**bağlı değil**; hızlı yol yalnız platform okumalarını atlıyor.

### 2.5 `pnpm vitest run src/lib/billing/`

```
 Test Files  10 passed (10)
      Tests  219 passed (219)
```

Tam paket de yeşil:
```
$ npx vitest run
 Test Files  158 passed | 2 skipped (160)
      Tests  1878 passed | 8 skipped (1886)
```
Bu, TASK-MTSY88Q6AMCGB'nin koruması (`tests/stripe-webhook-idempotency.live.test.ts`)
ve TASK-MTVRACMDFRGKV'nin koruması (`tests/stripe-webhook-tenant-scope.live.test.ts`)
dahil — ikisi de dokunulmadan yeşil.

### 2.6 Değiştirilen mevcut testler — GEVŞETİLMEDİ, TERS ÇEVRİLDİ

`subscription-sync-tenant-scope.test.ts` bir iddia taşıyordu:
`still writes the idempotency audit row outside the transaction`. O iddia bu
kartın düzelttiği kusurun **kendisini** çiviliyordu (kardeş kart idempotency'ye
dokunmakla yetkili değildi ve bunu raporunda açıkça yazdı). Zayıflatmadım;
yönünü çevirip yerine üç yeni ölçüm koydum:

| eski | yeni |
|---|---|
| `still writes the idempotency audit row outside the transaction` | `claims the idempotency key as the first statement of the money transaction` (`state.wrapperStatements[0] === 'stripeEventLog.create'`) |
| — | `writes the audit row inside the transaction and never on the bare client` |
| — | `rolls the money back when a concurrent delivery claimed the event first` |

Mock'un dişleri korundu: `prisma` Proxy'si sarmalayıcı açıkken dokunulmayı
hâlâ kaydediyor (`state.leaks`), çıplak istemcide `auditEvent.create` artık
**kusur işareti** (`auditWrittenOnBareClient`), ve tenant delegeleri hâlâ
`prisma` üzerinde yok — yani regresyon çağrının kendisinde ölüyor.
`subscription-sync.test.ts`'te de `db.auditEvent.create` → `tx.auditEvent.create`:
aynı iddia, doğru istemci. Üstüne iki yeni test (`claims the event …`,
`records nothing when a concurrent delivery already claimed the event`).

### 2.7 `pnpm typecheck` · `pnpm lint` · `pnpm rls:check` · `pnpm rls:verify` · `pnpm alerts:check`

```
$ npx tsc --noEmit
tests/e2e/document-export-tenant-isolation.spec.ts(70,9): error TS18048: 'body' is possibly 'undefined'.
tests/e2e/document-export-tenant-isolation.spec.ts(71,37): error TS2345: Argument of type 'string | undefined' …
```
**İkisi de benim değil** — iddia olarak bırakmadım, ölçtüm: dosya çalışma
ağacında **değişmemiş** (`git status --porcelain` boş) ve son commit'i
`82037c2 test(documents): TASK-MTVT0VLF4AP19 — read the brand from brand.ts
instead of re-typing it`, yani paralel kartın commit ettiği iş. Benim
dokunduğum dosyaların hiçbiri kırmızı değil.

```
$ npx eslint .
(çıktı yok — 0 error, 0 warning)

$ npx tsx scripts/check-rls.ts
Found 46 tenant-scoped models requiring RLS policies:
… StripeEventLog …
✅ SUCCESS: All 46 tenant-scoped models have RLS policies registered.
CHECK 4b — 13 tenant-scoped tables are created by migrations.
✅ SUCCESS: every one of them carries ENABLE + FORCE + tenant_isolation in its own migration.

$ npx tsx scripts/check-rls-live.ts
Kiracıya özel model: 46 · RLS açık tablo: 53 · tenant_isolation politikası: 46
Ölçüm rolü: fabrika_app (rolsuper=false, rolbypassrls=false)
   ✓ okuma (negatif) · ✓ okuma (pozitif) · ✓ yazma (negatif) · ✓ yazma (pozitif) · ✓ yazma (çapraz)
✅ 46 kiracıya özel tabloda politika yerinde ve izolasyon fabrika_app rolüyle GERÇEKTEN ölçüldü

$ npx tsx scripts/check-orphan-alerts.ts
tenant'ı SİLİNMİŞ (öksüz) : 0
✅ Öksüz alarm yok
```

### 2.8 e2e — hangi kırmızı kimin

Bu kart bir webhook yolu; insan yüzeyi yok, tıklanacak bir düğme yok. Gerçek
etkileşim kanıtı, üretimde koşulacak rolün altında gerçek Postgres'e karşı
koşan §2.2/§2.3'tür. Yine de fatura/fiyat yakınındaki iki spec'i gerçek
Chromium'da koşturdum:

```
$ npx playwright test tests/e2e/price-lock.spec.ts tests/e2e/invoice-write-path.spec.ts --reporter=line
  3 failed
    [chromium] › price-lock.spec.ts:71 › the public pricing page quotes a stranger the list price
    [chromium] › price-lock.spec.ts:97 › the locked tenant’s own billing panel still quotes the rate it joined at
    [chromium] › price-lock.spec.ts:118 › checkout charges the locked rate, not the campaign of the day
  4 passed (30.6s)
```

`invoice-write-path` yeşil. `price-lock` kırmızısı **benim değil ve kod
kaynaklı değil** — veritabanı verisi:

```
Plan:         pro monthlyCents=8700   ultra monthlyCents=14700
PlanVersion:  pro monthlyCents=12345  ultra monthlyCents=77700
              (ikisi de createdAt = 2026-09-07T15:19:44.301Z)
```
Fiyat sayfası yayınlanan **sürümü** okuyor, dolayısıyla `$123,45` gösteriyor
(beklenen `$87.00`). Satırlar **2026-09-07**'de, bu kart açılmadan üç gün önce
yazılmış; bu kartta hiçbir `PlanVersion` satırına dokunmadım. Kart önerdim
(§6), düzeltmedim: `src/**` ve seed bu kartın kapsamı dışında.

Hiçbir e2e spec'i bu üç handler'ı sürmüyor ve hiçbiri denetim satırına
dayanmıyor (`grep -ln "syncStripeSubscription\|logInvoicePayment\|handleSubscriptionCancellation" tests/e2e/*.spec.ts` → boş), yani bu değişikliğin e2e yüzeyi yok.

### 2.9 `pnpm rls:bypass-check` — kartıma yazılı borç satırı da kapatıldı

Dilim 5'in statik kapısı (TASK-MTVRAZSUVLL9R, bu kart koşarken indi) bu dosyada
bir borç satırı taşıyordu ve **kartı benim kartımdı**:

```
[TASK-MTVSBEO7VX6Y4] src/lib/billing/subscription-sync.ts — tenantId-fallback (x1)
reason: `tenantId: (subscription.metadata?.tenantId as string) ?? ''` in a logger.warn
        payload. The empty string is exactly what assertTenantScope rejects, so the
        log line names a tenant that can never be looked up.
```

Gerçek kusurdu: `priceLockUpdate` uyarı satırında kiracıyı Stripe metadata'sından
**ikinci kez** çözüyordu, oysa handler onu zaten çözüp doğrulamıştı — ve kiracıyı
`description` alanında taşıyan bir abonelik için uyarı `tenantId: ''` yazıyordu.
Çözüm: ikinci çözümlemeyi kaldır, `tenantId`'yi parametre olarak geçir. Tek
çözümleme kaldı. `as string` cast'i de gitti (CLAUDE.md "Yapma" listesi).

```
$ npx tsx scripts/check-tenant-bypass.ts
⚠ Outstanding tenant-bypass debt: 4 call site(s), measured.        (önce: 5)
  [TASK-MTVSBEO7VX6Y4] src/lib/billing/subscription-sync.ts — tenantId-fallback (fixed — prune me)
✅ SUCCESS: no new tenant bypass. 35 call site(s) allowed with a recorded reason, 4 still owed.
```

**Baseline dosyasını BİLEREK commit ETMEDİM.** `scripts/tenant-bypass-baseline.json`
şu an devop-fb'nin (TASK-MTVTQTJIQ5SDB) commit edilmemiş değişikliklerini taşıyor —
`git status` bunu ben dokunmadan önce ` M` gösteriyordu. `--prune` koşturdum,
diff'te komşunun işinin de benim commit'ime gireceğini gördüm ve **prune'u geri
aldım**: dosya şimdi yalnızca devop-fb'nin değişikliklerini içeriyor (doğrulandı:
`git diff` çıktısında yalnız onların iki hunk'ı var). Borç satırı kaybolmuyor —
kapı her koşuda `(fixed — prune me)` yazıyor, yani sessizleşemez. Prune'u
baseline'ın sahibi kendi commit'iyle atmalı: `pnpm rls:bypass-check --prune`.

### 2.9 Sonda verisi temizlendi

```
StripeEventLog total: 0
my probe tenants: 0
my probe plans: 0
my probe triggers: 0
my probe functions: 0
probe systemalerts: 0
```

Ölçüm sondaları `.qa-scratch/` altında (gitignore'lu, commit edilmiyor):
`repro-fabrika-app.ts`, `repro-money-loop.ts`, `repro-invoice.ts`,
`apply-migration.ts`, `backfill-proof.ts`, `final-measure.ts`.

---

## 3. Değişen dosyalar

| Dosya | Ne |
|---|---|
| `prisma/schema.prisma` | **`StripeEventLog`** modeli + `Tenant.stripeEvents` ters ilişkisi · +32 |
| `prisma/migrations/add-stripe-event-log/migration.sql` | **YENİ** — tablo, UNIQUE indeks, FK, `ENABLE`+`FORCE`+`tenant_isolation`, `fabrika_app` GRANT, `AuditEvent`'ten dolum; hepsi idempotent |
| `prisma/migrations/add-stripe-event-log/down.sql` | **YENİ** — geri alma + neyi geri açtığına dair uyarı |
| `prisma/rls.sql` | tenant-scoped diziye `StripeEventLog` · +1 |
| `src/lib/billing/subscription-sync.ts` | `auditForStripeEvent` → `stripeEventAlreadyHandled` + `claimStripeEvent`; üç handler'da `tenantId` hoist, claim transaction'ın ilk ifadesi, `auditEvent.create` transaction'ın içinde, P2002 → `skipped` · boşluk hariç +204 / −71 |
| `src/lib/billing/subscription-sync-tenant-scope.test.ts` | "audit dışarıda" iddiası ters çevrildi + 3 yeni test (claim-first, audit-inside, concurrent-rollback); 7 → 10 test |
| `src/lib/billing/subscription-sync.test.ts` | `@/lib/db` mock'una `withTenant`; audit iddiaları `tx`'e taşındı + 3 yeni test; 12 → 15 test |
| `tests/stripe-webhook-idempotency-rls.live.test.ts` | **YENİ** — 7 canlı test, hepsi `fabrika_app` rolü altında |
| `docs/adr/ADR-0003-stripe-webhook-idempotency-key.md` | **YENİ** — 1-3-1 kararı, ölçümler, riskler |
| `docs/DATA_MODEL.md` | §17 `StripeEventLog` + §1'e `AuditEvent` uyarısı · +44 |

Dokunulmayanlar: `tests/` altındaki mevcut dosyalar, `tsconfig.json`,
`src/lib/inngest/**`, `scripts/**`, `package.json`, `creditsForUsage`,
`src/lib/money.ts`, `price-lock.ts`, `invoice-writer.ts`,
`src/app/api/webhooks/stripe/route.ts` (dönüş şekli değişmedi, düzenlemeye
gerek olmadı).

---

## 4. Riskler

1. **🔴 `src/lib/iyzico.ts` aynı sınıf hatayı taşıyor ve DAHA kötü durumda.**
   `iyzico.ts:591` `prisma.$transaction` kullanıyor — `withTenant` değil,
   hiçbir yerde `set_config('app.tenant_id')` yok
   (`grep -n 'withTenant|\$transaction|set_config' src/lib/iyzico.ts` → tek satır).
   Guard'ı da `tx.auditEvent.findFirst({ data: { path: ['iyzicoEventId'] } })`,
   yani `AuditEvent`. `fabrika_app` altında bu yolun kiracı yazmalarının
   TAMAMI reddedilir — `pnpm rls:verify`'ın "yazma (negatif): app.tenant_id
   yokken INSERT reddedildi" ölçümü tam olarak bu koşulu ölçüyor. Bu kartın
   kapsamı `src/lib/billing/**`; iyzico dosyası orada değil. **Kart önerildi (§6).**
   Rol geçişi bu kart kapanmadan yapılmamalı — TASK-MTVSBEO7VX6Y4'ü tek ön koşul
   saymak yanlış olur.
2. **`StripeEventLog` süresiz büyür.** Webhook başına bir satır. Budama işi
   bu kartta yok; Stripe üç gün tekrar gönderdiği için 90 gün güvenli bir eşik.
   **Kart önerildi (§6).**
3. **Geriye dönük dolum yalnız migration anındaki satırları kapsar.** Migration
   ile rol geçişi arasında yazılan olaylar için migration tekrar koşulmalı —
   idempotent olduğu için bu güvenli, ama `docs/RELEASE_CHECKLIST.md`'nin elle
   uygulama adımında akılda tutulmalı.
4. **UNIQUE kısıt RLS'e tabi değildir.** Başka bir kiracının olay id'si için
   yapılan ekleme, satırı göremese bile çakışma alır. İstenen davranış bu; ama
   teknik olarak bir varlık sızıntısıdır. Stripe olay id'leri kullanıcı girdisi
   değil, kabul edilebilir.
5. **`logInvoicePayment`'ta fatura kesilemezse tekrar denenmiyor.** Kilit önce
   commit ediyor, sonra fatura yazılıyor ve hata yutuluyor (`SystemAlert` ile
   görünür). Bu bugünkü davranışın aynısı — bu kartta değiştirmedim, çünkü
   dosyanın kendi gerekçesi "başarılı bir ödeme, faturası kesilemese bile kayıtlı
   kalmalı" diyor. Ters sıra (önce fatura, sonra kilit) faturayı tekrar
   denenebilir yapardı; ayrı bir karar.
6. **`syncStripeSubscription` artık üç transaction açıyor** (guard okuması,
   `existingSubscription` okuması, yazma), önceki iki yerine. Üçüncüsü hızlı
   yolun bedeli: guard'ın okuduğu tablo kiracıya özel, yani kiracı bağlamı
   gerekiyor. Tekrar gönderim yolunda toplam maliyet düştü (platform okumaları
   artık atlanıyor); yeni olay yolunda bir `set_config` round-trip'i arttı.
7. **`.live.test.ts` DB yoksa kendini atlıyor** (`describe.skipIf`). Sessiz
   yeşil üretebilir — kardeş raporların da 3./4. riski, hâlâ aynı. Hafifletme:
   DB **erişilebilirken** ilk test rolün gerçekten NOBYPASSRLS olduğunu sert
   biçimde doğruluyor.

---

## 5. Açık sorular

1. `createDbClient` havuzuna açık bir `max` yazılmalı mı? Bugün pg
   varsayılanına (10) sessizce güveniliyor; kardeş raporun açık sorusu, hâlâ açık.
2. `StripeEventLog` budama eşiği 90 gün mü, yoksa denetim/muhasebe gerekçesiyle
   daha uzun mu? (Fatura kayıtları ayrı tabloda, bu satırlar yalnız kilit.)
3. Rol geçişi kartının ön koşul listesi: bu kart + iyzico kartı. Başka bir
   çıplak `prisma.$transaction` var mı — Dilim 5'in statik kapısı
   (TASK-MTVRAZSUVLL9R) `withTenant` DIŞINDAKİ çağrıları arıyor, ama
   `set_config`'siz `$transaction` ayrı bir desen. Kapıya o desen de girmeli mi?

---

## 6. Sonraki adım

1. **Açılan kartlar** (Task Board'da, hepsi SPRINT-S12 / cekirdek):
   - **TASK-MTVU5DI4C96DB** — `iyzico.ts` webhook'u hiç kiracı bağlamı açmıyor
     (`prisma.$transaction`, `set_config` yok) → `withTenant` + `StripeEventLog`.
     **Rol geçişinin ikinci ön koşulu.**
   - **TASK-MTVU6SDYSFIXU** — `StripeEventLog` budama işi (90 günden eski satırlar).
   - **TASK-MTVU65CL8RPS2** — `PlanVersion` seed fiyatları `Plan` ile çelişiyor
     (`pro` 12345 vs 8700, `ultra` 77700 vs 14700) → `price-lock.spec.ts` temel
     çizgide 3 kırmızı.
   - **TASK-MTVU4JH5YT6UD** — bu kartın kendisi. Panoda `TASK-MTVSBEO7VX6Y4`
     kodlu bir kart YOKTU (sprint metninde geçiyor, board'da hiç açılmamış);
     izlenebilirlik için kodu başlığa yazarak açtım, statü `review`.
2. Rol geçişi kartına bu kart bağımlılık olarak işaretlenmeli — ama tek başına
   yeterli değil (§4.1).
3. TASK-MTVRAZSUVLL9R (Dilim 5, statik kapı) allowlist'inde bu dosyanın
   `AuditEvent` çağrıları artık `tx.` üzerinden — kardeş raporun 3. açık
   sorusunun cevabı: grep onları yakalamayacak.
4. **Baseline prune'u devop-fb'ye devredildi** (§2.9): `scripts/tenant-bypass-baseline.json`
   içindeki `B2 | src/lib/billing/subscription-sync.ts | tenantId-fallback`
   satırı artık ağaçta 0 çağrıya karşılık geliyor. Dosya şu an devop-fb'nin
   commit edilmemiş işini taşıdığı için ona dokunmadım. Kapı her koşuda
   `(fixed — prune me)` yazıyor — devredilen bir bulgu değil, her koşuda
   bağıran bir satır.

---

## 7. Platform beyanı

Doğrulama **macOS**'ta yapıldı (Darwin 25.6.0, zsh, Node v26.5.0, yerel
PostgreSQL 16, Chromium/Playwright). Bu kartta dokunulan kodun platforma bağlı
hiçbir yanı yok: süreç öldürme, dosya yolu, kabuk/ikili adı, ekran/DPI, mikrofon
ya da kamera izni içermiyor. Değişen şeyler — bir Postgres tablosu, bir UNIQUE
indeks, bir RLS politikası, SQL transaction sınırı ve Prisma çağrılarının hangi
istemci üzerinden koştuğu — tümü platformdan bağımsız. Migration SQL'i saf
Postgres (`gen_random_uuid()` pg 13+ çekirdeğinde, `jsonb ?` operatörü ve
`DISTINCT ON` standart Postgres); Windows ve Linux'ta aynı sonucu verir.
Ölçüm sondaları saf Node + `pg`. **Windows ve Linux'ta koşulmadı** — bu ofiste
yalnız macOS makinesi var; eksikliğin sebebi ortam, kod değil.
