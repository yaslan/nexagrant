---
task: TASK-MVBBPXU1ZW0F5
kod: FO-5
agent: be-fb
hüküm: "Kısmen bitti: konu önekine göre koordinatör listesi (sorgu, GET /api/v1/partners/leaders, /partners/leaders?topic=, i18n) yazıldı ve gerçek CORDIS verisiyle ölçüldü (<2 s, 18–34 ms). Tam birim paketi temiz değil (31 dosya, ortam kaynaklı: fabrika_app parolası + paylaşımlı DB verisi); PR açıldı, merge edilmedi."
tip: ölçüm
platform: mac (darwin 27.0). Windows/Linux koşulamadı: sorgu ve sayfa platforma bağlı kod içermiyor; yol/süreç/ikili kullanımı yok.
branch: be-fb/fo5-coordinator-leaders (origin/dev ffb9c79f'den)
---

# FO-5 · Konu önekine göre CORDIS koordinatör listesi

## Ne yapıldı

- `coordinatorLeaders({ topicPrefix, limit, country? })` — `src/lib/k2-cordis/coordinator-leaders.ts`. Mevcut `CordisProjectTopic` + `CordisParticipation(role='coordinator')` + `CordisOrganization` üzerinden tek `$queryRaw`. Proje, aynı önekte birden çok konu koduna sahipse bir kez sayılır (DISTINCT). Limit en çok 50.
- `cordisTopicPrefixSchema` (`api-query.ts`): büyük harfe çevrilir, 3–40 karakter, yalnız `[A-Z0-9-]`; `%` ve `_` reddedilir (LIKE için güvenli).
- `GET /api/v1/partners/leaders?topicPrefix=&limit=&country=` — `authenticateApiKey` (yetkisiz → 401), geçersiz parametre → 400 `invalid_query` (sorgu çalışmaz), DB hatası → 500 sabit kod `PARTNER_LEADERS_QUERY_FAILED` (sorgu metni gövdede yok). `totalEcContributionEur` string olarak döner (bkz. Riskler).
- Sayfa `/partners/leaders?topic=` — boş ise bugünkü küresel 20'lik liste; doluysa yeni sorgu; geçersizse mesaj. Tüm sabit metinler `PartnersLeaders` ad alanında `messages/tr.json` + `messages/en.json`'a eklendi (yalnız ekleme, 40 satır). Kanıtsız "teklifin kabul oranını artırır" iddiası kaldırıldı.
- Şema değişikliği YOK, yeni tablo YOK, veri yeniden içe aktarılmadı. Plan (EXPLAIN) indeks gerektirmediği için migration eklenmedi.

## Kanıt (ham çıktı)

### 1. Gerçek CORDIS verisi — izole DB `fabrika_fo5`

Yerel `fabrika` DB'sinde CORDIS verisi YOKTU (tüm DB'ler sayıldı: `CordisProject = 0`). Paylaşılan DB'ye dokunmamak için `fabrika_fo5` açıldı, şema `prisma db push` ile kuruldu (`migrate deploy` boş DB'de `relation "FollowupDoc" does not exist` ile düşüyor — migration zinciri sıfırdan çalışmıyor), `db:seed` + `db:rls` koşuldu, ardından gerçek HORIZON dökümü içe aktarıldı:

```
✅ [CORDIS Import] Completed successfully in 246716ms
   Projects: 23954
   Organizations: 35625
   Participations: 148155
   Topics: 23954
   SciVocs: 53196
✅ [M1 Partner Profile Job] Generated 35625 org profiles and 1079694 co-participations in 22062ms.
IMPORT_EXIT=0
```

Not: kart "yaklaşık 23.613" diyor; indirilen HORIZON dökümü 23.954 proje içeriyordu.

### 2. API süresi (dev sunucu, port 3118, izole DB, gerçek HTTP)

Route bir kez ısıtıldı (`FO5WARM-` öneki, sonuç boş). Sonra her önek için ilk çağrı ("soğuk") ve tekrar ("sıcak"):

```
HORIZON-CL5-   cold 200 0.033850s   warm 200 0.018639s
HORIZON-CL4-   cold 200 0.019297s   warm 200 0.021746s
HORIZON-HLTH-  cold 200 0.018012s   warm 200 0.017734s
```

Sınır: kart "soğuk" derken Postgres sayfa önbelleğinin soğuk olmasını da kastediyorsa bu ölçüm onu kapsamıyor — import hemen öncesinde koştuğu için tablolar sıcaktı. Route/önek bazında soğuk (ilk istek) ile ölçüldü.

### 3. İlk 5 satır (ham API yanıtı, warm)

```
== HORIZON-CL5-   (total 20)
932760440 VTT FI 22 22848989
998802502 CENTRE FOR RESEARCH AND TECHNOLOGY HELLAS CERTH EL 21 16397228
999984059 Fraunhofer DE 20 21272484
910945140 SINTEF NO 19 27402637
999992401 CEA FR 19 25421548
== HORIZON-CL4-   (total 20)
999984059 Fraunhofer DE 27 33128244
932760440 VTT FI 22 38096307
910945140 SINTEF NO 22 34552505
998802502 CENTRE FOR RESEARCH AND TECHNOLOGY HELLAS CERTH EL 21 19914775
999992401 CEA FR 15 19731802
== HORIZON-HLTH-  (total 20)
999997833 INSERM FR 23 71010387
919322739 STICHTING AMSTERDAM UMC NL 10 20509236
999992692 CHARITE - UNIVERSITAETSMEDIZIN BERLIN DE 10 17315240
999915189 UMC UTRECHT NL 8 14142655
999991334 KU Leuven BE 7 14566909
```

Sütunlar: `organisationId shortName/name country coordinatedProjects totalEcContributionEur`.

### 4. Ham SQL çapraz kontrolü (HORIZON-CL5-, bağımsız sorgu)

API ile birebir aynı ilk 5 satır (id, proje sayısı, euro toplamı):

```
 organisationId | coordinated |    ec
----------------+-------------+----------
 932760440      |          22 | 22848989
 998802502      |          21 | 16397228
 999984059      |          20 | 21272484
 910945140      |          19 | 27402637
 999992401      |          19 | 25421548
```

Bu öneki koordine eden toplam kurum sayısı (ham SQL): `462` (API en çok 20 satır döndürür).

### 5. Plan

```
EXPLAIN (analyze, buffers) … HORIZON-CL5- …
  Seq Scan on "CordisProjectTopic" (actual rows=1037) ~3.6 ms
  Bitmap Index Scan on "CordisParticipation_role_idx" (rows=23947)
  Execution Time: 16.792 ms
```

Önek araması LIKE ile yapılıyor; bu boyutta topic tablosu seq scan ile 4 ms. İndeks eklenmedi.

### 6. Testler (koşulan, çıktılar)

- Yeni üç birim/API/live dosyası: `Test Files 3 passed (3) · Tests 21 passed (21)` (birim 11, API 5, live DB 5).
- E2E (`tests/e2e/partners-leaders-topic.spec.ts`, Playwright, izole DB, port 3117):
  ```
  ✓ lists the coordinator of the prefix, not the participant (tr) (2.9s)
  ✓ lists the coordinator of the prefix, not the participant (en) (624ms)
  ✓ an invalid prefix shows the message and no list (559ms)
  3 passed (11.3s)
  ```
- `pnpm lint`: LINT_EXIT=0.
- `pnpm typecheck`: TC_EXIT=0 (önce `pnpm db:generate`; generate yapılmadan 0 olmayan TS2339 hataları çıkıyor — bu worktree'ye özgü değil, client üretilmemişti).
- `pnpm i18n:check`: "✅ i18n check passed: both catalogs agree…".
- `pnpm rls:check`: RLS_CHECK_EXIT=0.
- Tam birim paketi `pnpm test`: ORTAM KAYNAKLI KIRMIZI, bu iş kapsamı dışı:
  - İlk koşu (worktree'de `.env` yok → varsayılan DB parolası): 14 dosya / 51 test kırmızı. 
  - İkinci koşu (`.env`, `.env.local`, `.env.test` kopyalandıktan sonra): 31 dosya kırmızı, `301 passed | 8 skipped`. Hata türleri: 30 × `password authentication failed for user "fabrika_app"` (RLS rolü; kartın 28P01 uyarısı), kalan 2× `PlanNotAvailableError` ve birkaç plan/fatura veri beklentisi (paylaşılan DB'nin tohum verisi).
  - Kırmızı dosyaların hiçbiri CORDIS / partners / leaders / api-query kapsamında değil.
  - Aynı iki dosyayı orijinal checkout'ta (`/Users/macbook/alan/FONBRIDGE`) koştum: `Test Files 2 passed (2), Tests 18 passed (18)`; worktree'de `DATABASE_URL` ana DB'ye verilince de geçti. Yani ilk koşudaki kırmızılar worktree env'inden kaynaklandı.
  - `origin/dev` üzerinde tam paketin temiz olup olmadığı KOŞULMADI; "tüm paket temiz" demiyorum.
- Ekran görüntüleri (e2e, fixture verisi ile): `docs/agent-results/TASK-MVBBPXU1ZW0F5-screenshots/01-topic-tr.png`, `01-topic-en.png`. Görüntüde fixture verisi var (FO5E2E-…), gerçek CORDIS verisi değil.

## Değişen dosyalar

- `src/lib/k2-cordis/coordinator-leaders.ts` (yeni)
- `src/lib/k2-cordis/api-query.ts` (+ `cordisTopicPrefixSchema`, `coordinatorLeadersQuerySchema`)
- `src/app/api/v1/partners/leaders/route.ts` (yeni)
- `src/app/[locale]/(app)/[workspace]/partners/leaders/page.tsx` (`?topic=`, i18n, iddia kaldırıldı)
- `messages/tr.json`, `messages/en.json` (`PartnersLeaders` ad alanı, yalnız ekleme)
- `tests/cordis-coordinator-leaders.test.ts`, `tests/cordis-coordinator-leaders.live.test.ts`, `tests/api/v1-partners-leaders.test.ts`, `tests/e2e/partners-leaders-topic.spec.ts` (yeni)
- `docs/agent-results/TASK-MVBBPXU1ZW0F5-screenshots/*.png`, `docs/agent-results/TASK-MVBBPXU1ZW0F5-be-fb.md`

## Riskler

- **Birim:** `totalEcContributionEur` değeri CORDIS'in sakladığı tam EUR (`parseBigIntEur` tam sayı yuvarlıyor). CLAUDE.md kural 9 "minor unit (cent)" diyor; mevcut tablo cent tutmuyor. Bu işte veri formatını değiştirmedim; API alanı adı EUR diyor. Kural ile veri arasındaki fark ayrı bir karar.
- Tam birim paketinde 31 kırmızı dosya (yukarıda). `fabrika_app` parolası `.env`'deki `DATABASE_URL_RLS_TEST` ile yerel DB'de tutmuyor (28P01). Bu, kartın "parola tutmuyorsa açıkça yaz" maddesi.
- `fabrika_fo5` migration zinciri boş DB'de çalışmıyor (`FollowupDoc`), `db push` ile kuruldu. Üretim şeması bu yolla doğrulanmadı.
- Süre ölçümü tek makinede, yerel Postgres'te. Uzak/üretim DB'sinde ölçülmedi.
- Route dev modunda (`next dev`) ölçüldü, `next start` ile ölçülmedi.

## Açık sorular

- `totalEcContributionEur` alanı EUR tam sayı mı kalsın, yoksa kural 9'a uyup cent'e mi çevrilsin? (Karar sahibi: ürün/mimari.)
- `origin/dev` üzerinde tam birim paketinin temiz olup olmadığı — ayrı bir koşu gerekir.

## Sonraki adım

- ROADMAP E6 "liderler < 2 s" satırı ölçüm sonucu ve commit hash'iyle güncellenecek (ayrı commit).
- PR `--base dev` ile açılacak; merge edilmeyecek.
- Kart `review` + `merge_state: isolated` olarak işaretlenecek.
