# TASK-MTSY88Q6AMCGB — Stripe webhook idempotency muhafızı hiç eşleşmiyor

**Ajan:** blok-zincir-denet-i (QA-EN) · **Sprint:** SPRINT-S12 · **Branch:** `dev` · **Tarih:** 2026-09-08

---

## 1. Ne yapıldı

**Önce ölçüldü, sonra düzeltildi.**

`src/lib/billing/subscription-sync.ts` içindeki üç webhook işleyicisi
(`syncStripeSubscription`, `handleSubscriptionCancellation`, `logInvoicePayment`)
aynı muhafızla açılıyordu:

```ts
prisma.auditEvent.findFirst({ where: { data: { equals: { stripeEventId: eventId } } } })
```

Bu filtre "`stripeEventId` alanı bu olan satır" gibi okunuyor ama o değil: `Json`
bir kolonda `equals` **tüm belgeyi** karşılaştırır. Yani yalnızca `data` alanı
tam olarak `{"stripeEventId":"..."}` olan bir satırla eşleşir — oysa bu üç
işleyicinin yazdığı her satır `planId`, `status`, `amountCents`, `priceLock` gibi
ek anahtarlar taşır. Muhafız **hiçbir zaman eşleşmedi**; Stripe'ın yeniden
gönderdiği (retry penceresi 3 gün) her olay baştan işlendi.

İddia canlı Postgres üzerinde kalıcı bir sondayla doğrulandı, düzeltme yapıldı,
aynı sonda yeşile döndü, sonra çürütme sondasıyla (düzeltmeyi geri al → kırmızı,
geri koy → yeşil) nedensellik kanıtlandı.

Düzeltme: üç kopya tek bir `auditForStripeEvent(eventId)` yardımcısına indirildi
ve filtre alan-yoluna çevrildi:

```ts
data: { path: ['stripeEventId'], equals: eventId }
```

**Şema değişikliği gerekmedi** — migration açılmadı, `prisma/schema.prisma`'ya ve
i18n dosyalarına dokunulmadı (bu tur kilidi geli-tirici'de).

---

## 2. Kanıt (kopyalanmış gerçek çıktı)

Ortam: gerçek Postgres (`DATABASE_URL` → `localhost:5432/fabrika`, rol `fabrika`),
gerçek Prisma, üretim kod yolu. Yalnızca Stripe SDK'sı mock'lu (ağ yok; taşıma
katmanı, test edilen davranış değil).

### 2.1 ÖNCE — ölçüm: aynı olay iki kez işleniyor mu?

Senaryo, Stripe'ın retry penceresinin gerçekten ürettiği durum: `active` olayı
işlenir, kiracı aboneliği iptal eder, **sonra** aynı olay yeniden teslim edilir.

```
delivery #1 -> {"tenantId":"t-meas-3wnlvcsy","planId":"plan-meas-3wnlvcsy","status":"ACTIVE","addedAddOns":[],"removedAddOns":[],"creditsGranted":1234}
delivery #2 (same event id) -> {"tenantId":"t-meas-3wnlvcsy","planId":"plan-meas-3wnlvcsy","status":"ACTIVE","addedAddOns":[],"removedAddOns":[],"creditsGranted":1234}
AuditEvent rows for one event id : 2
CreditLedger rows               : 2 | total delta = 2468
Subscription.status after replay: ACTIVE
```

Yani tek bir Stripe olayı: **2 denetim satırı**, **2 kredi hibesi (2 × 1234 = 2468
kredi)** ve **iptal edilmiş aboneliğin ACTIVE'e diriltilmesi**.

### 2.2 KIRMIZI — kalıcı regresyon testi, düzeltmeden önce

`npx vitest run tests/stripe-webhook-idempotency.live.test.ts`

```
 × ... > a redelivered subscription event writes no second audit row
   → expected 'ACTIVE' to be 'skipped'
 × ... > a stale event replayed after a cancellation grants no second allowance
   → expected 'ACTIVE' to be 'skipped'
 × ... > a redelivered cancellation event writes no second audit row
   → expected 'CANCELED' to be 'skipped'
 × ... > a redelivered invoice payment writes no second audit row
   → expected 2 to be 1
 Test Files  1 failed (1)
      Tests  4 failed (4)
```

### 2.3 YEŞİL — düzeltmeden sonra

```
 ✓ ... > a redelivered subscription event writes no second audit row 33ms
 ✓ ... > a stale event replayed after a cancellation grants no second allowance 20ms
 ✓ ... > a redelivered cancellation event writes no second audit row 22ms
 ✓ ... > a redelivered invoice payment writes no second audit row 8ms
 Test Files  1 passed (1)
      Tests  4 passed (4)
```

stdout, muhafızın gerçekten devreye girdiğini gösteriyor:

```
Event evt-sync-1kwqct13 already processed; skipping
Event evt-replay-1kwqct13 already processed; skipping
```

### 2.4 SONRA — aynı ölçüm, düzeltmeyle

```
delivery #1 -> {"tenantId":"t-meas-cfn6mc07","planId":"plan-meas-cfn6mc07","status":"ACTIVE","addedAddOns":[],"removedAddOns":[],"creditsGranted":1234}
delivery #2 (same event id) -> {"tenantId":"t-meas-cfn6mc07","planId":"","status":"skipped","addedAddOns":[],"removedAddOns":[],"creditsGranted":0}
AuditEvent rows for one event id : 1
CreditLedger rows               : 1 | total delta = 1234
Subscription.status after replay: CANCELED
```

İkinci teslim **hiçbir yan etki üretmiyor**: ikinci abonelik yazımı yok, ikinci
kredi hibesi yok, ikinci denetim satırı yok, iptal ayakta kalıyor.

### 2.5 ÇÜRÜTME SONDASI (düzeltme → geçici geri al → geri koy)

**Geri alındı** (`path` filtresi eski `equals` filtresine döndürüldü):

```
=== REFUTATION RUN (fix reverted) ===
 × ... > a redelivered subscription event writes no second audit row 48ms
   → expected 'ACTIVE' to be 'skipped'
 × ... > a stale event replayed after a cancellation grants no second allowance 30ms
   → expected 'ACTIVE' to be 'skipped'
 × ... > a redelivered cancellation event writes no second audit row 38ms
   → expected 'CANCELED' to be 'skipped'
 × ... > a redelivered invoice payment writes no second audit row 12ms
   → expected 2 to be 1
 Test Files  1 failed (1)
      Tests  4 failed (4)
```

**Geri kondu:**

```
217:      data: { path: ['stripeEventId'], equals: eventId },
=== RESTORED RUN ===
 ✓ ... > a redelivered subscription event writes no second audit row 33ms
 ✓ ... > a stale event replayed after a cancellation grants no second allowance 20ms
 ✓ ... > a redelivered cancellation event writes no second audit row 22ms
 ✓ ... > a redelivered invoice payment writes no second audit row 8ms
 Test Files  1 passed (1)
      Tests  4 passed (4)
```

Test yeşile testi gevşeterek değil, tek satırlık filtre düzeltmesiyle döndü.

### 2.6 Kapı — `pnpm typecheck && pnpm lint && pnpm test`

```
$ tsc --noEmit
```
(çıktı yok = 0 hata)

```
$ eslint

/Users/macbook/AgentSpace/fabrika/docs/agent-results/TASK-MTSYH8LDGV5YU-evidence/f1-e2e-probe.mts
  10:7  warning  'R' is assigned a value but never used  @typescript-eslint/no-unused-vars

/Users/macbook/AgentSpace/fabrika/docs/agent-results/TASK-MTSYH8LDGV5YU-evidence/f4-rag-probe.mts
  5:28  warning  '_url' is defined but never used  @typescript-eslint/no-unused-vars

✖ 2 problems (0 errors, 2 warnings)
```
(0 hata; 2 uyarı başka bir görevin kanıt dizininde, kapsam dışı — dokunulmadı)

```
$ vitest run --passWithNoTests
 Test Files  126 passed | 2 skipped (128)
      Tests  1485 passed | 8 skipped (1493)
   Duration  6.27s
```

### 2.7 Paylaşılan ağaç gürültüsü — bana ait OLMAYAN kırmızı

Aynı süiti daha sonra tekrar koştuğumda `src/lib/billing/invoice-writer.test.ts`
kırmızı verdi. Bu benim değişikliğim değil: geli-tirici o sırada
`invoice-writer.ts`, `vat-rate.ts`, `vat-rates.ts`, `money.ts` dosyalarını canlı
düzenliyor (TASK-MTT1WUUS7MN7R, KDV kartı). Kanıt — aynı test benim dosyam
HEAD'e geri alınınca da **birebir aynı** şekilde düşüyor:

```
=== invoice-writer.test.ts WITH my change ===
 FAIL  src/lib/billing/invoice-writer.test.ts > createInvoiceForPayment — when no invoice may be issued > issues nothing when the VAT rate is not configured
 Test Files  1 failed (1)
      Tests  1 failed | 21 passed (22)

=== same test with subscription-sync.ts reverted to HEAD ===
 FAIL  src/lib/billing/invoice-writer.test.ts > createInvoiceForPayment — when no invoice may be issued > issues nothing when the VAT rate is not configured
 Test Files  1 failed (1)
      Tests  1 failed | 21 passed (22)
```

Kapsam dışı; düzeltilmedi, adıyla bildiriliyor.

### 2.8 Sonda kalıntısı bırakmadı

```
select count(*) from "Tenant" where id l -> 0
select count(*) from "Plan" where id lik -> 0
SystemAlert leftovers: 0 []
```

---

## 3. Değişen dosyalar

| Dosya | Değişiklik |
|---|---|
| `src/lib/billing/subscription-sync.ts` | +39 / −20. Üç kopya muhafız tek `auditForStripeEvent()` yardımcısına indirildi; filtre `data: { equals: {...} }` → `data: { path: ['stripeEventId'], equals: eventId }`. `logInvoicePayment` içindeki "bu muhafız hiçbir zaman eşleşmiyor" diyen yorum artık doğru olmadığı için güncellendi. |
| `tests/stripe-webhook-idempotency.live.test.ts` | **YENİ** — 4 testlik kalıcı canlı regresyon süiti (gerçek Postgres). DB erişilemezse dosya `describe.skipIf` ile atlanır, CI'yi kırmaz. |
| `docs/agent-results/TASK-MTSY88Q6AMCGB-blok-zincir-denet-i.md` | bu rapor |

`prisma/schema.prisma`, migration, `messages/tr.json`, `messages/en.json`: **dokunulmadı**.

---

## 4. Riskler

1. **Kalan yarış durumu (LEED-EN'e bildirim gerektirir).** Bu bir *oku-sonra-yaz*
   muhafızı. Sıralı yeniden teslimi (Stripe'ın gerçekte yaptığı şey) kesin olarak
   durdurur, ama aynı olayın **eşzamanlı iki teslimini** durdurmaz: iki istek de
   `findFirst`'ü satır yazılmadan önce koşabilir. Bunu tamamen kapatmak
   `AuditEvent` üzerinde olay kimliği için bir **unique constraint** ister — yani
   bir migration. Kart açıkça "migration gerekiyorsa DUR ve raporla" dediği için
   **açılmadı**; migration kilidi bu tur geli-tirici'de. Önerilen takip:
   `AuditEvent`'e `stripeEventId String? @unique` kolonu (ya da
   `@@unique` taşıyan ayrı bir `ProcessedWebhookEvent` tablosu).
2. **Sorgu maliyeti.** `data->>'stripeEventId' = $1` üzerinde indeks yok, yani
   `AuditEvent` üzerinde sequential scan. Tablo bugün küçük ve her webhook'ta bir
   kez koşuyor; büyüdüğünde bir `CREATE INDEX ... ((data->>'stripeEventId'))`
   ister — bu da migration, aynı sebeple açılmadı. (1) ile birlikte yapılmalı.
3. **Geçmiş yeniden teslimler geri alınmadı.** Düzeltme bundan sonrasını korur;
   üretimde daha önce çift işlenmiş olay varsa `CreditLedger`'da fazladan
   `monthly_grant` satırları durur. Üretim DB'sine bu ortamdan dokunulmadı.

---

## 5. Açık sorular

1. Yukarıdaki (1) + (2) için tek bir migration'ı geli-tirici mi açacak, yoksa
   migration kilidi kalkınca ayrı bir kart mı? **LEED-EN kararı.**
2. Üretimde geçmişe dönük çift `monthly_grant` taraması/temizliği istenir mi?
   (Tarama sorgusu: aynı `refId` + `reason='monthly_grant'` için >1 satır.)

---

## 6. Sonraki adım

- LEED-EN'e bildir: eşzamanlılık için unique constraint + JSON ifade indeksi
  gerekiyor; ikisi de migration, bu turda açılmadı.
- Kapsam dışı bildirim: `invoice-writer.test.ts > issues nothing when the VAT
  rate is not configured` şu an kırmızı, sebebi geli-tirici'nin devam eden KDV
  çalışması (TASK-MTT1WUUS7MN7R) — o kart kapanınca yeniden koşulmalı.
