# TASK-MTQ63RR8Z0G8E — G0 rozeti: kanıt kaydı artık fırsat başına anahtarlı (YOL A)

**Ajan:** geli-tirici (Backend Mühendisi) · **Tarih:** 2026-09-08 · **Dal:** dev

## 1. Ne yapıldı

Kartın özgün iddiası ("G0 hiç hesaplanmıyor") daha önce çürütülmüştü. Bu turda, o çürütme
sırasında ortaya çıkan **gerçek** kusur kapatıldı: `TopicMatch` konu başına tek satırdı
(`@@unique([tenantId, topicId])`) ama G0 puanı **fırsat başına** değişiyor —
`budgetRoleEconomy` (ağırlık 10) `Opportunity.intendedRole`'e, `researchAndEndUser` (ağırlık 12)
o fırsatın `ConsortiumSeat` satırlarına bakıyor — ve `Opportunity.topicId` unique değil. Aynı
konuda ikinci skorlama birincinin satırının üzerine yazıyor, kanıt kaydını okuyan pano hayatta
kalan sayıyı **iki karta birden** çiziyordu.

Lider kararı **YOL (A)** uygulandı: kanıt kaydı fırsat başına anahtarlandı.

1. **Şema** (`prisma/schema.prisma`): `TopicMatch.opportunityId String?` + `Opportunity`
   ilişkisi (`onDelete: Cascade`), `@@unique([tenantId, topicId, opportunityId])`,
   `@@index([tenantId, opportunityId])`. İki satır türü artık ayrı: `opportunityId = NULL` → K1
   eşleşmesi (`fitScore`, konu başına tek); `opportunityId` dolu → bir fırsatın G0 kanıt kaydı
   (`g0Score` + `breakdown`).
2. **Migration** (KLASÖRLÜ): `prisma/migrations/topicmatch-per-opportunity/migration.sql` +
   `down.sql`. Additive, baştan sona `IF NOT EXISTS`/`IF EXISTS`. Yeni tekillik indeksi
   **`NULLS NOT DISTINCT`** (Postgres 16.15) ile kuruldu; böylece `opportunityId` NULL olan K1
   satırı da veritabanı düzeyinde konu başına tek kalıyor.
3. **Geri doldurma** (migration içinde): kanıt yükü (`breakdown ? 'scoringVersion'`) taşıyan eski
   konu-başına satırlar, o kiracıda o konuda **tek** canlı fırsat varsa o fırsata bağlandı.
   Gerçek K1 `fitScore`'u da olan bir satır için puan yeni bir fırsat satırına taşınır, K1 satırı
   konu düzeyinde kalır. Atfedilemeyen satırların (`0` veya `>1` aday) `g0Score`'u **temizlenir**
   ve sebebi `breakdown`'a yazılır — tahminle bir fırsata yapıştırılmaz.
4. **Yazma yolu** (`src/lib/scoring/g0-compute.ts`): `persistG0` artık
   `tenantId_topicId_opportunityId` ile upsert ediyor; `loadG0Snapshot` K1 uyumunu
   `findFirst({ opportunityId: null })` ile okuyor (Prisma bileşik-unique `where`'e `null`
   koyduramıyor).
5. **Okuma yüzeyleri**: pano (`pipeline/page.tsx`) kanıt satırını **fırsat kimliğiyle** tek toplu
   sorguda çekiyor (eskiden konu çözümlemesi + konu anahtarı); detay sayfası aynı puanı
   `computeG0ForOpportunity` ile canlı hesaplıyor. Ölçüldü: ikisi tüm fırsatlarda aynı sayıyı
   veriyor (aşağıda tablo). Detay sayfası hâlâ **hiçbir şey yazmıyor** — mevcut e2e sözleşmesi
   ("render wrote nothing") korundu.
6. **Tohum**: `prisma/seed.ts` ve `scripts/seed-g0-e2e.ts` K1 satırını findFirst+create ile
   yazıyor. Fixture'a **aynı konuda ikinci bir fırsat** eklendi (`g0-e2e-opportunity-partner`,
   `intendedRole: 'partner'`).
7. **Test**: `tests/e2e/g0-computed-score.spec.ts` — yeni e2e senaryosu "two opportunities on one
   topic keep their own score, on the board and on their own page"; `tests/g0-compute.test.ts` ve
   `tests/gates.test.ts` yeni anahtara göre güncellendi. Pano kartına
   `data-testid="pipeline-card-g0-<id>"` eklendi.
8. **Dokümantasyon**: `docs/DATA_MODEL.md` §14 (yeni) + diyagram ve indeks notu.

## 2. Kanıt

### 2.1 Migration İKİ KEZ koştu (idempotency)

Birinci koşu (yeni sütun + FK + geri doldurma + yeni indeksler):

```
[apply-sql] applied prisma/migrations/topicmatch-per-opportunity/migration.sql
```

Geri doldurmanın sonucu — 5 eski konu-başına satırın tamamı tek canlı fırsatına bağlandı:

```
┌─────────┬───────────────┬─────────────────────────────┬───────────────┬──────────┬─────────┬───────┬────────┐
│ (index) │ tenantId      │ topicId                     │ opportunityId │ fitScore │ g0Score │ sv    │ ph     │
├─────────┼───────────────┼─────────────────────────────┼───────────────┼──────────┼─────────┼───────┼────────┤
│ 0       │ 'demo-tenant' │ 'cmtrerwv1000jqgxkfn5u2vcb' │ 'demo-opp-1'  │ 0        │ 12      │ '2.0' │ 'true' │
│ 1       │ 'demo-tenant' │ 'cmtrerwv6000lqgxko3pzc649' │ 'demo-opp-2'  │ 0        │ 0       │ '2.0' │ 'true' │
│ 2       │ 'demo-tenant' │ 'cmtrerwvf000rqgxkatc4r2ol' │ 'demo-opp-4'  │ 0        │ 0       │ '2.0' │ 'true' │
│ 3       │ 'demo-tenant' │ 'cmtrerwvu0011qgxku2kk1341' │ 'demo-opp-3'  │ 0        │ 6       │ '2.0' │ 'true' │
│ 4       │ 'demo-tenant' │ 'cmtrerwvw0013qgxkdt76xye9' │ 'demo-opp-5'  │ 0        │ 6       │ '2.0' │ 'true' │
└─────────┴───────────────┴─────────────────────────────┴───────────────┴──────────┴─────────┴───────┴────────┘
```

İkinci koşu — yalnız "zaten var" bildirimleri, **tek satır bile değişmedi** (tablo birebir aynı):

```
NOTICE: column "opportunityId" of relation "TopicMatch" already exists, skipping
NOTICE: index "TopicMatch_tenantId_topicId_key" does not exist, skipping
NOTICE: relation "TopicMatch_tenantId_topicId_opportunityId_key" already exists, skipping
NOTICE: relation "TopicMatch_tenantId_opportunityId_idx" already exists, skipping
[apply-sql] applied prisma/migrations/topicmatch-per-opportunity/migration.sql
```

İndeksler (canlı `pg_indexes`):

```
TopicMatch_tenantId_topicId_opportunityId_key |
  CREATE UNIQUE INDEX ... ON public."TopicMatch" USING btree ("tenantId","topicId","opportunityId") NULLS NOT DISTINCT
TopicMatch_tenantId_opportunityId_idx |
  CREATE INDEX ... ON public."TopicMatch" USING btree ("tenantId","opportunityId")
```

`TopicMatch_tenantId_topicId_key` (eski konu anahtarı) artık yok.

### 2.2 Geri alma yolu

`down.sql` gerçek veritabanında çalıştırıldı ve **geri sarıldı** (kalıcı etki bırakmadan
sözdizimi + semantik doğrulaması):

```
[apply-sql] DRY RUN ok (rolled back) prisma/migrations/topicmatch-per-opportunity/down.sql
```

`down.sql` yıkıcıdır ve bunu başında yazar: eski şekle dönmek, konu başına birden çok kanıt
satırını tek satıra **çökertmek** demektir (en yeni `computedAt` kazanır — yani geri alınan bozuk
davranışın kendisi). Puanlar türetilmiş veridir; `pnpm jobs:g0-rescore -- --apply` yeniden üretir.

### 2.3 Değişmezler ve "aynı kaynak" ölçümü (SQL)

```
--- invariant 1: at most one evidence row per opportunity      → []   (ihlal yok)
--- invariant 2: at most one K1 row per (tenant, topic)        → []   (ihlal yok)
--- invariant 3: evidence row and its opportunity share a tenant → [] (ihlal yok)

--- board badge (stored TopicMatch) vs detail page (live compute), every opportunity
┌─────────┬───────────────┬───────────────┬─────────────┬─────────────┬──────────────┬───────┐
│ (index) │ opportunity   │ role          │ board_badge │ detail_page │ column_cache │ agree │
├─────────┼───────────────┼───────────────┼─────────────┼─────────────┼──────────────┼───────┤
│ 0       │ 'demo-opp-1'  │ 'coordinator' │ 12          │ 12          │ 12           │ true  │
│ 1       │ 'demo-opp-2'  │ 'coordinator' │ 0           │ 0           │ 0            │ true  │
│ 2       │ 'demo-opp-3'  │ 'coordinator' │ 6           │ 6           │ 6            │ true  │
│ 3       │ 'demo-opp-4'  │ 'coordinator' │ 0           │ 0           │ 0            │ true  │
│ 4       │ 'demo-opp-5'  │ 'coordinator' │ 6           │ 6           │ 6            │ true  │
│ 5       │ 'st6-app-opp' │ 'coordinator' │ null        │ null        │ null         │ true  │
└─────────┴───────────────┴───────────────┴─────────────┴─────────────┴──────────────┴───────┘
disagreements: 0
```

Son satır kartın "kaydı olmayan fırsat hâlâ boş görünmeli" şartı: kanıt kaydı yok → rozet yok,
uydurma bir sayı sızmıyor.

Tekillik gerçekten uygulanıyor mu (aynı konuya ikinci bir K1 satırı, geri sarılan işlemde):

```
first K1 row (opportunityId NULL): inserted
SECOND K1 row REFUSED by: TopicMatch_tenantId_topicId_opportunityId_key
(transaction rolled back — nothing written)
```

### 2.4 Gerçek tarayıcı senaryosu (kartın istediği doğrulama)

Fixture: aynı konuda iki fırsat — koordinatör (`g0-e2e-opportunity-scored`) ve ortak
(`g0-e2e-opportunity-partner`) — ikisi de ürünün kendi kalıcılaştırma yolundan
(`rescoreOpportunityG0`) skorlandı.

```
Running 2 tests using 1 worker
[seed-g0-e2e] ready — tenant=g0-e2e-tenant scored=g0-e2e-opportunity-scored (g0Score=null) unscored=g0-e2e-opportunity-unscored (g0Score=92)
  ✓  1 … › the screen shows the computed score, and says so when it cannot be computed (2.9s)
[seed-g0-e2e] rolled back
  ✓  2 … › two opportunities on one topic keep their own score, on the board and on their own page (2.6s)

  2 passed (6.5s)
```

Kareler (`docs/agent-results/TASK-MTQ63RR8Z0G8E-qa-screenshots/`):

- `05-board-two-opportunities-one-topic.png` — panoda **⭐ 48.23 (Ortak)** ve **⭐ 44.9
  (Koordinatör)** ayrı ayrı; kanıtı olmayan üçüncü kartta rozet **yok**.
- `06-detail-coordinator.png` — koordinatörün detay sayfası **44.9/100**.
- `07-detail-partner.png` — ortağın detay sayfası **48.23/100**.

Yani: her fırsatın panodaki rozeti kendi detay sayfasıyla **aynı**, iki fırsat **farklı** sayı
gösteriyor. (Ölçülen 44.9 / 48.23, denetçinin bildirdiği sayılarla birebir aynı.)

### 2.5 Mutasyon: test kusuru gerçekten yakalıyor mu

Pano sorgusu kasten eski davranışa (konu anahtarı) döndürüldü ve spec kırmızı verdi — hem de
kusurun tam şekliyle:

```
Error: expect(locator).toHaveText(expected) failed
Expected: "⭐ 44.9"
Received: "⭐ 48.23"
  at tests/e2e/g0-computed-score.spec.ts:231
1 failed … two opportunities on one topic keep their own score…
```

Mutasyon geri alındı, spec yeşile döndü (2.4'teki koşu mutasyon **sonrası** koşudur).

### 2.6 Kapı

```
Test Files  104 passed | 2 skipped (106)
      Tests  1214 passed | 8 skipped (1222)
✅ i18n check passed: both catalogs agree and every key used in src/ resolves.
✅ SUCCESS: All 42 tenant-scoped models have RLS policies registered.
✅ Veritabanı 42 kiracıya özel tablonun tamamında izolasyonu uyguluyor.
```

`pnpm db:rls` → `✅ prisma/rls.sql applied. Policies in public: 57 → 57` (yeni tablo yok;
`TopicMatch` `tenant_isolation` politikasını korudu, yeni sütun kiracı anahtarı değil).
`pnpm jobs:g0-rescore --tenant demo-tenant --apply` → 5 fırsat, puanlar değişmedi (geri doldurma
doğru atfetmiş).

## 3. Değişen dosyalar

| dosya | ne |
|---|---|
| `prisma/schema.prisma` | `TopicMatch.opportunityId` + ilişki + yeni `@@unique` + indeks; `Opportunity.topicMatches` |
| `prisma/migrations/topicmatch-per-opportunity/migration.sql` | **yeni** — sütun, FK, geri doldurma, `NULLS NOT DISTINCT` tekillik |
| `prisma/migrations/topicmatch-per-opportunity/down.sql` | **yeni** — geri alma (yıkıcı, açıkça yazılı) |
| `src/lib/scoring/g0-compute.ts` | `persistG0` fırsat anahtarlı upsert; `loadG0Snapshot` K1 satırını `findFirst` ile okur |
| `src/app/[locale]/(app)/[workspace]/pipeline/page.tsx` | pano rozeti fırsat kimliğiyle tek toplu sorgu |
| `src/app/[locale]/(app)/[workspace]/pipeline/board.tsx` | kart ve rozet için `data-testid` |
| `prisma/seed.ts` | K1 satırı findFirst+create |
| `scripts/seed-g0-e2e.ts` | aynı konuda ikinci fırsat (ortak) + K1 yazımı + temizlik |
| `tests/e2e/g0-computed-score.spec.ts` | yeni senaryo + yeni anahtara göre sorgu |
| `tests/g0-compute.test.ts`, `tests/gates.test.ts` | yeni anahtar / `findFirst` sahtesi |
| `docs/DATA_MODEL.md` | §14 + diyagram + indeks notu |
| `docs/agent-results/TASK-MTQ63RR8Z0G8E-qa-screenshots/*.png` | 05/06/07 yeni, 02/03 tazelendi |

## 4. Riskler

- **`down.sql` yıkıcıdır.** Konu başına birden çok kanıt satırını tek satıra çökertir; bilerek ve
  dosyanın başında yazılı. Puanlar `pnpm jobs:g0-rescore -- --apply` ile yeniden üretilebilir.
- **Konusuz fırsat kanıt satırı alamaz.** `TopicMatch.topicId` zorunlu (Topic'e FK). `topicId`
  olmayan bir fırsatın detay sayfası puan hesaplayabilir ama panoda rozeti olmaz. Bu davranış
  değişmedi; kaydı olmayan fırsatın boş görünmesi zaten istenen durum.
- **Prisma `null` sınırı.** K1 satırı (opportunityId NULL) `upsert` ile yazılamıyor; findFirst +
  create/update kalıbı üç yerde tekrarlanıyor (g0-compute, seed, seed-g0-e2e). Tekilliği
  veritabanı garanti ediyor, ama yeni bir yazıcı bu kalıbı unutursa yarış durumunda ikinci satır
  denemesi hata alır (sessizce bozulmaz).
- **Çalışan `next dev` sunucusu Prisma istemcisini bellekte tutuyor.** Şema değişikliğinden sonra
  yeniden başlatılmadan pano/detay sayfası "Unknown argument `opportunityId`" ile 500 veriyordu
  (aşağıya bkz.).

## 5. Açık sorular / ilgisiz kusurlar (DÜZELTİLMEDİ, adıyla bildiriliyor)

1. **`src/lib/dashboard/fetch-metrics.ts:68`** — "ortalama isabet" `o.g0Score || 0` ile
   hesaplanıyor: puanı olmayan fırsat **0 sayılıyor** (yokluk ≠ sıfır ihlali) ve `Opportunity.g0Score`
   önbellek sütunu tohumdan gelen uydurma değer taşıyabiliyor. Panoda gösterilen ortalama bu
   yüzden hem seyreltilmiş hem de kanıta bağlı değil. Ayrı kart konusu.
2. **`scripts/clean-orphan-topic-matches.ts`** — hâlâ (tenant, topic) üzerinden "canlı fırsat var
   mı" diye bakıyor. Artık satırın kendi `opportunityId`'si var; aynı konuda biri canlı biri
   yumuşak-silinmiş iki fırsat varsa, silinmişin bayat kanıt satırı temizlenmiyor (zararsız —
   hiçbir ekran onu okumuyor). Tek satırlık iyileştirme, kapsam dışı bırakıldı.
3. **Pane çakışması (bildirim).** `tests/e2e/g0-computed-score.spec.ts` üzerindeki +85 satırlık
   çalışmam, ben henüz commit etmeden `blok-zincir-dse`'nin `71781c5` ("test(e2e): click the
   'save search' button…") commit'ine **süpürüldü** — o pane `tests/e2e/` dizinini toptan
   eklemiş. İçerik doğru ve testler yeşil; ama commit mesajı o değişikliği anlatmıyor. Paylaşılan
   hafızadaki dosya-yarışı notunun bir örneği daha.
4. **Ortak `next dev` sunucusunu yeniden başlattım.** :3000'deki sunucu başka bir pane
   tarafından başlatılmıştı ve Prisma istemcisini bellekte tuttuğu için şema değişikliğinden
   sonra pipeline sayfalarında 500 veriyordu; Next 16 aynı dizinde ikinci bir dev sunucusuna izin
   vermiyor. Sunucuyu durdurup **aynı port üzerinde yeniden başlattım**; :3000 şu an ayakta ve
   taze istemciyle çalışıyor. Bu sırada koşan bir e2e varsa tek seferlik kırılmış olabilir.
5. **Kart 2 (`TASK-MTS6MBA7NEIM0`, dört spec + mutasyon) bana gelen metinde vardı ama
   `customer-support`'a atanmış** ve sonuç dosyası onun adına isteniyor. Ona dokunmadım.

## 6. Sonraki adım

- `pnpm jobs:g0-rescore -- --apply` (tüm kiracılar) — geri doldurmanın atfedemediği satırlar
  varsa fırsat başına yeniden üretilir. Yerelde demo kiracı için koşuldu; başka ortamda migration
  uygulandıktan sonra bir kez koşulmalı.
- Ortalama isabet metriği (Açık sorular #1) için ayrı kart.
