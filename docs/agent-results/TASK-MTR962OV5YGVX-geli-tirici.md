# TASK-MTR962OV5YGVX — Fiyat sayfasındaki ömür boyu lisans sayaçlarının arkasına gerçek kayıt

**Ajan:** BE-EN (Backend Mühendisi) · **Branch:** dev · **Tarih:** 2026-09-07

---

## 1. Ne yapıldı

Fiyat sayfasındaki "5 lisans sahibi · Sıradaki lisans #6" rozeti mesaj kataloğuna elle yazılmış
bir cümleydi; sayan hiçbir şey yoktu. Daha kötüsü, **sayılacak bir şey de yoktu**: Stripe
webhook'u `checkout.session.completed` olayında yalnız `session.subscription` doluysa iş
yapıyordu, dolayısıyla tek seferlik `lifetime-ultra` ödemesi tahsil edilip bu veritabanında
hiçbir yere yazılmıyordu. Satış kayıtsız kayboluyordu.

Yapılanlar:

1. **`LifetimeLicence` tablosu** (kiracıya özel, RLS'li) — satışın kaydı. Üç benzersizlik
   kuralı: `seq`, `providerEventId`, `providerSessionId`.
2. **Migration** `prisma/migrations/add-lifetime-licence.sql` — additive + idempotent; tablo,
   indeksler, RLS politikası ve genel sayaç fonksiyonu. Geri alma:
   `add-lifetime-licence.down.sql`.
3. **Webhook'ta tek seferlik ödeme dalı** — abonelik yoksa ve satır `lifetime-ultra` ise lisans
   yazılır; **idempotent** (aynı olay ya da aynı oturum ikinci kez gelirse satır oluşmaz).
4. **Sayaçlar kayıttan türüyor** — saf `lifetimeScarcity()` fonksiyonu, dört durum:
   `unknown` (sayı okunamadı → **hiçbir sayı iddia edilmez**), `none` (0 sahip, sıradaki #1),
   `available` (N sahip, sıradaki N+1), `sold-out` (N ≥ 20 → "sıradaki lisans" vaadi yok).
5. **i18n** — iki katalog da parametreli anahtarlarla güncellendi (`{count}`, `{next}`, `{cap}`);
   dizi değeri kullanılmadı, düz anahtar. Sabit metin kalmadı.
6. **Testler** — sayaç türetmesi (0 / N / dolu / bilinmiyor / aşırı satış) + webhook idempotency
   (yeniden gönderim, yeni olay kimliği aynı oturum, yarış hâlinde P2002).
7. **Seed bilinçli olarak yok** — seed'lenmiş lisans, seed'lenmiş satıştır; rozet yine kimsenin
   ödemediği sahipleri duyururdu. Gerekçe `prisma/seed.ts` §2 sonunda not olarak duruyor.

Kilit tasarım kararı: **`unknown` ayrı bir durum.** Tablo kiracıya özel ve RLS'li, fiyat sayfası
ise hiçbir kiracının içinde değil — düz bir `SELECT` sıfır satır okur ve rozet "henüz sahip yok"
derdi. Yanlış bir sıfır, uydurma bir beş kadar yanlıştır. Bu yüzden sayım
`public.lifetime_licence_count()` üzerinden alınıyor: `SECURITY DEFINER`, argümansız, **yalnız
bir tamsayı** döndüren fonksiyon — satır dönmediği için hiçbir kiracı bu yoldan görünmez.
Fonksiyon yoksa sayım `null` olur ve rozet sayı iddia etmez (ekran görüntüsü 06).

---

## 2. Kanıt

### 2.1 Önce — ölçüm (değişiklikten önceki gerçek durum)

Kod tarafı:

| Ne | Durum (önce) |
|---|---|
| `messages/{tr,en}.json` → `billingPanels.pricing.lifetimeOwners` | `"5 lisans sahibi"` / `"5 licence owners"` — düz metin |
| `billingPanels.pricing.lifetimeNext` | `"Sıradaki lisans #6 (ilk 20 firma ile sınırlı)"` — düz metin |
| Ömür boyu lisansı kaydeden tablo | **yok** |
| `checkout.session.completed` + abonelik yok | **hiçbir iş yapılmıyor** (dal `if (session.subscription …)` içindeydi) |

Veritabanı tarafı (`prisma.*.findMany`, değişiklikten önce):

```
PLANS   [{"id":"free","name":"Discover","monthlyCents":0,"yearlyCents":0,"currency":"USD"},
         {"id":"basic","name":"Basic","monthlyCents":4500,"yearlyCents":38700,"currency":"USD"},
         {"id":"pro","name":"Pro","monthlyCents":8700,"yearlyCents":74700,"currency":"USD"},
         {"id":"ultra","name":"Ultra","monthlyCents":14700,"yearlyCents":119700,"currency":"USD"}]
SUBS    [{"tenantId":"demo-tenant","planId":"pro","status":"ACTIVE"}]
ADDONS  []
TENANTS [{"id":"cmtr9tpul000c0gxkm9orqhwo","slug":"org-9110ax"},{"id":"demo-tenant","slug":"fabrika-beta"}]
```

Şema durumu:

```
[{"tbl": null, "policies": "41", "fn": null}]
```

→ `LifetimeLicence` tablosu yok, sayaç fonksiyonu yok, public şemasında 41 politika.

### 2.2 Migration — iki kez koşuldu (idempotency kanıtı)

```
=== RUN 1
applied prisma/migrations/add-lifetime-licence.sql
=== RUN 2 (idempotency proof)
applied prisma/migrations/add-lifetime-licence.sql
=== AFTER
[{"tbl": "\"LifetimeLicence\"", "policies": "42", "fn": "lifetime_licence_count()",
  "idx": "5", "licences": 0}]
```

İkinci koşu hatasız (no-op). Politika sayısı 41 → 42, indeks 5 (pkey + 3 benzersiz + 1 arama),
mevcut `Plan`/`Subscription`/`AddOn` satırlarına dokunulmadı (tablo yalnız eklendi).

`pnpm db:rls` sonrası (rls.sql ile migration'ın çakışmadığı kanıtı):

```
✅ prisma/rls.sql applied. Policies in public: 42 → 42
```

### 2.3 Kiracı izolasyonu ve genel sayım — canlı ölçüm

20 lisans kayıtlıyken, RLS'e tabi (`NOBYPASSRLS`) `fabrika_app` rolüyle:

```
[{"role": "fabrika_app", "direct_select_under_rls": 0, "via_counter_function": 20}]
```

→ Düz `SELECT` sıfır okuyor (bu yüzden sayaç fonksiyonu var); `SECURITY DEFINER` fonksiyon
gerçek sayıyı veriyor. Politikanın kendisi de çalışıyor:

```
tenant = demo-tenant                 → visible_rows = 19
tenant = cmtr9tpul000c0gxkm9orqhwo   → visible_rows = 1
```

`pnpm rls:check` / `pnpm rls:verify`:

```
Found 39 tenant-scoped models requiring RLS policies:
… Invitation, LifetimeLicence, MarketplaceListing …
✅ SUCCESS: All 39 tenant-scoped models have RLS policies registered.

Kiracıya özel model: 39 · RLS açık tablo: 42 · tenant_isolation politikası: 39
✅ Veritabanı 39 kiracıya özel tablonun tamamında izolasyonu uyguluyor.
```

### 2.4 Idempotency — gerçek veritabanına karşı

`recordLifetimeLicence` (üretim kodu) 3 farklı satın alma için **9 kez** çağrıldı:
pass 1 (ilk teslim), pass 2 (aynı olay yeniden gönderildi), pass 3 (aynı oturum, yeni olay id'si).

```
 pass 2 (redelivery):               { status: 'duplicate', seq: 1, … }
 pass 3 (new event id, same session): { status: 'duplicate', seq: 2, … }
 pass 3 (new event id, same session): { status: 'duplicate', seq: 3, … }
after: 3
rows: [{"seq":1,"tenantId":"demo-tenant","sku":"lifetime-ultra","amountMinor":128800,"currency":"USD","providerEventId":"evt_evidence_1"},
       {"seq":2,"tenantId":"cmtr9tpul000c0gxkm9orqhwo",…,"providerEventId":"evt_evidence_2"},
       {"seq":3,"tenantId":"demo-tenant",…,"providerEventId":"evt_evidence_3"}]
```

**9 çağrı → 3 satır.** Kanıt satırları iş bitince geri alındı; son durum `licences_left = 0`.

### 2.5 Kapı (gate) çıktısı

`pnpm gate` (lint + typecheck + test + rls:check + rls:verify):

```
$ eslint
✖ 172 problems (0 errors, 172 warnings)          ← hepsi mevcut (baseline); değişen dosyalarımda 0 bulgu
$ tsc --noEmit
(çıktı yok = temiz)
$ vitest run --passWithNoTests
 Test Files  62 passed | 2 skipped (64)
      Tests  666 passed | 8 skipped (674)
$ tsx scripts/check-rls.ts   → ✅ SUCCESS: All 39 tenant-scoped models …
$ tsx scripts/check-rls-live.ts → ✅ Veritabanı 39 kiracıya özel tablonun tamamında izolasyonu uyguluyor.
```

Yeni test dosyası tek başına:

```
$ npx vitest run src/lib/billing/lifetime-licence.test.ts
 Test Files  1 passed (1)
      Tests  20 passed (20)
```

`tests/i18n.test.ts` (tr/en anahtar eşitliği) 666 testin içinde yeşil. `pnpm i18n:check`
raporunda yeni anahtarların hiçbiri `missingInTurkish`/`missingInEnglish`/`missingInBoth`
kovalarında **değil**; yalnız `unused` kovasında görünüyorlar — çıkarıcı `t('key', { … })`
biçimini tanımıyor, bu yüzden hiç dokunmadığım `lifetimeCouponNote` de aynı kovada. Anahtarların
gerçekten render edildiği aşağıdaki ekran görüntüleriyle kanıtlı. (`i18n:check` bu depoda zaten
exit 1 dönüyor ve `pnpm gate`'in parçası değil.)

### 2.6 Tarayıcı kanıtı — dört durum, iki dil

Gerçek dev sunucusu (`localhost:3000`), gerçek veritabanı, Playwright ile çekildi. Her kare
rozetin `data-scarcity` özniteliğiyle birlikte okundu:

| # | Dosya | DB | Okunan durum ve metin |
|---|---|---|---|
| 01 | `TASK-MTR962OV5YGVX-screenshots/01-tr-zero-licences.png` | 0 lisans | `state=none` · "Henüz lisans sahibi yok · Sıradaki lisans #1 (ilk 20 firma ile sınırlı)" |
| 02 | `…/02-tr-three-licences.png` | 3 lisans | `state=available` · "3 lisans sahibi · Sıradaki lisans #4 (ilk 20 firma ile sınırlı)" |
| 03 | `…/03-en-three-licences.png` | 3 lisans | `state=available` · "3 licence owners · Next licence #4 (limited to the first 20 entities)" |
| 04 | `…/04-tr-sold-out.png` | 20 lisans | `state=sold-out` · "20/20 — ömür boyu kontenjanı doldu" |
| 05 | `…/05-en-sold-out.png` | 20 lisans | `state=sold-out` · "20/20 — the lifetime run is closed" |
| 06 | `…/06-tr-count-unavailable.png` | sayaç fonksiyonu düşürüldü | `state=unknown` · "İlk 20 firma ile sınırlı" — **hiçbir sayı iddia edilmiyor** |

06 için fonksiyon geçici olarak `DROP` edildi, kare alındı, `pnpm db:rls` ile geri kuruldu
(`select public.lifetime_licence_count()` → 20 doğrulandı).

Uydurma "5 lisans sahibi" hiçbir durumda çıkmıyor: 0 lisansta rozet dürüst sıfırı gösteriyor,
3 lisansta gerçek 3 ve 4'ü, 20'de tükendi hâlini.

---

## 3. Değişen dosyalar

| Dosya | Ne |
|---|---|
| `prisma/schema.prisma` | `LifetimeLicence` modeli + `Tenant.lifetimeLicences` ilişkisi (yalnız ekleme) |
| `prisma/migrations/add-lifetime-licence.sql` | **yeni** — tablo, 3 benzersiz indeks, arama indeksi, RLS politikası, sayaç fonksiyonu |
| `prisma/migrations/add-lifetime-licence.down.sql` | **yeni** — geri alma (yıkıcı; dışa aktarma komutu dosyada) |
| `prisma/rls.sql` | `LifetimeLicence` FOREACH dizisine eklendi + `lifetime_licence_count()` tanımı |
| `prisma/seed.ts` | Lisansın neden seed'lenmediğini açıklayan not (satır eklenmedi, veri değişmedi) |
| `src/lib/billing/lifetime-licence.ts` | **yeni** — saf `lifetimeScarcity()`, `countLifetimeLicences()`, idempotent `recordLifetimeLicence()` |
| `src/lib/billing/lifetime-licence.test.ts` | **yeni** — 20 test |
| `src/lib/billing/catalog.ts` | **yalnız** `LIFETIME_LICENCE_CAP = 20` veri sabiti eklendi (8 satır ekleme, 0 satır değişiklik — `priceLine`/`CATALOG`/`PLANS`/`LIFETIME`/`DISCOUNT_TIERS` ve yuvarlamaya dokunulmadı) |
| `src/app/api/webhooks/stripe/route.ts` | Tek seferlik ödeme dalı |
| `src/app/[locale]/pricing/page.tsx` | Sayımı okuyup durumu geçiriyor; `dynamic = 'force-dynamic'` |
| `src/app/[locale]/pricing/PricingClient.tsx` | Rozet dört duruma göre render ediyor; TASK-MTR6QYPGOS2N0 §5 yorumu **silindi** |
| `messages/tr.json`, `messages/en.json` | `billingPanels.pricing`: `lifetimeOwners`/`lifetimeNext` çıktı; `lifetimeOwnersCount`, `lifetimeOwnersNone`, `lifetimeNextSeq`, `lifetimeSoldOut`, `lifetimeCapOnly` girdi |
| `docs/DATA_MODEL.md` | §10 — tablo, alanlar, RLS + genel sayım gerekçesi, migration/geri alma |

---

## 4. Riskler

1. **`dynamic = 'force-dynamic'`** — /pricing artık build'de pişmiyor, her istekte bir sayım
   sorgusu koşuyor. Bu bilinçli: önbelleğe alınmış "19 sahip" 21. lisansın satılma yoludur.
   Sorgu tek bir `count()`; yük sorunu olursa kısa süreli `revalidate` tartışılabilir, ama o
   zaman "tükendi" bilgisi de gecikir.
2. **`SECURITY DEFINER` fonksiyon** — süper kullanıcı sahipli ve `PUBLIC` çalıştırabilir.
   Argümansız ve yalnız bir tamsayı döndürüyor, satır dönmüyor; kiracı kimliği bu yoldan
   sızmıyor. Yine de RLS'i aşan tek yol olduğu için gövdesi genişletilmemeli.
3. **Kapak aşımı** — 21. lisans satılırsa satır yine yazılır (kaydedilmemiş satış, düzeltmeye
   çalıştığımız hatanın ta kendisi) ve `logger.warn` düşer; rozet "tükendi" gösterir. Satışı
   *engellemek* ödeme akışının işi, bu kartın değil.
4. **`prisma/schema.prisma` paralel ajan yarışı** — dosyayı başka ajanlar da düzenliyor;
   commit öncesi `git diff --cached` ile staged içerik doğrulanacak.

---

## 5. Açık sorular

1. **Tükenmişken "Ömür boyu lisans al" butonu hâlâ aktif.** 04/05 numaralı kareler bunu
   gösteriyor: rozet "20/20 — kontenjan doldu" derken CTA satın almaya devam ediyor. Bu bu
   görevin kapsamı (rozet) dışındaydı ve *ürün* kararı: buton kapansın mı, bekleme listesine mi
   dönsün, yoksa kontenjan aşımı bilinçli olarak mı serbest? **Ayrı kart gerekiyor.**
2. **Aynı uydurma rozet ayarlar panelinde duruyor.**
   `src/app/[locale]/(app)/[workspace]/settings/billing/BillingClient.tsx:411-413`,
   `billingPanels.settings.lifetimeOwners` = "5 lisans sahibi",
   `lifetimeNext` = "Sıradaki lisans #6". Bu dosya bana verilen dosya listesinde yoktu, bu yüzden
   **dokunmadım**. Türetme fonksiyonu artık hazır; o panelin dönüşümü küçük bir iş ama başka
   birinin kartı olmalı (paralel düzenleme riski).
3. **Gerçek Stripe olayıyla uçtan uca doğrulama yapılmadı.** Yerelde `STRIPE_SECRET_KEY` mock,
   checkout `demoMode` dönüyor; webhook imzası olmadan gerçek bir `checkout.session.completed`
   üretilemiyor. Doğrulama, üretim yazıcısını (`recordLifetimeLicence`) gerçek veritabanına karşı
   gerçek oturum nesneleriyle çağırarak yapıldı (§2.4) — HTTP katmanı ve imza doğrulaması
   kapsam dışı kaldı. Stripe test anahtarları bağlandığında bir `stripe trigger` koşusu
   önerilir.

---

## 6. Sonraki adım

- Yukarıdaki 1 ve 2 numaralı açık maddeler için kart açılması (tükenmiş CTA davranışı; ayarlar
  panelindeki ikinci rozet).
- Stripe test anahtarları bağlandığında `stripe trigger checkout.session.completed` ile HTTP
  katmanının bir kez doğrulanması.
