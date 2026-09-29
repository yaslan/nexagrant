# TASK-MUN7C48UHPOGI — K1 embedding doldurma (se-fb)

**Sonuç:** `Topic.embedding` ve `TenantProfile.embedding` artık `k1-embeddings` işiyle doluyor. Kod commit'i `784836b7`. İzole DB'de gerçek OpenAI çağrısıyla uçtan uca doğrulandı: gerçek worker'da enqueue → `k1-embeddings` → `k1-topic-match` çalıştı ve **2 gerçek K1 satırı** yazıldı. Bu görevde harcanan toplam: ≈ 314 token ≈ **0,00004 USD** (tavan 0,5 USD idi).

Kalan tek açık uç **profil kaydı kancası**. `enqueueTenantProfileEmbedding` yazıldı ve test edildi, ama onu çağıracak gerçek bir kayıt yolu yok: `settings/profile/page.tsx` hâlâ sahte kayıt yapıyor (§5 Ö-1). Bu süre boyunca gece taraması her profili hash ile yakalıyor, yani değişen bir profil en geç 24 saatte embed ediliyor.

## 1) Ne yapıldı

**Keşif:**
- `Topic` üç yerden yazılıyor: `k1-daily-calls` (02:00), `api/cagrilar` upsert ve seed'ler. `TenantProfile` için üretimde hiçbir yazma yolu yok; yalnız `seed-g0-e2e` yazıyor.
- İki sütun da `vector(1536)`. `embedText` (src/lib/llm.ts), `text-embedding-3-large` ile `dimensions: 1536` gönderiyor. `AiUsageLog`'a yazan tek yol bu; yeni bir sağlayıcı yolu açılmadı.

**Yapılanlar:**
- **Şema + migration.** Nullable `embeddingHash TEXT` sütunu eklendi: `prisma/migrations/k1-embedding-hash.sql` ve `.down.sql`, sıra `apply-order.txt` içinde. Değer, gönderilen metnin, modelin ve boyutun sha256'sı.
- **`src/lib/scoring/embeddings.ts` → `runK1Embeddings()`:**
  - Konular: CLOSED olmayanlar, 200'lük sayfalarla, platform kapsamında.
  - Profiller: silinmemiş her kiracı için `withTenant(tenantId)` altında (RLS). AiUsageLog'a o kiracı adına yazılır, çünkü bu kiracının verisini işlemek demek (GDPR md. 30).
  - Satır yalnız iki durumda embed edilir: vektör yoksa ya da hash metinle uyuşmuyorsa. Hash'i olmayan eski bir vektör bir kez yeniden üretilir.
  - **Harcama tavanı:** `K1_EMBEDDING_MAX_USD_PER_RUN`, varsayılan 0,05 USD. Her çağrıdan önce karakter/3 ile tahmin yapılır; bu tahmin gerçeğin ≈1,6 katı çıkıyor, yani ihtiyatlı. Tavanı aşacak çağrıda koşu durur, kalan satırlar sonraki koşuya kalır.
  - **İyimser yazma:** `WHERE … "updatedAt" = <okunan>`. Koşu sırasında metni değişen satıra eski vektör yazılmaz (`raced`), sonraki koşu yeni metni alır.
  - Girdi 16 000 karakterde kesilir. Modelin sınırı 8191 token; katalogda 36k karakterlik bir açıklama var ve bugün 27 konu bu sınıra takılıyor.
  - Pilot kapısı: süresi dolmuş pilotun profili ne embed edilir ne ücretlenir. Yazmadan önce `assertTenantWritable` yeniden çağrılır. Gerekçe: k1-topic-match bu kiracıyı zaten atlıyor, dolayısıyla salt-okunur bir kiracı için para harcamak anlamsız.
  - Silinmiş kiracı okunmaz. Boş `tenantId` reddedilir; `undefined` bir where ile okuma yapılmaz.
  - Arka arkaya 3 sağlayıcı hatasında koşu durur (kötü anahtar ya da kesinti). `AiUsageLogWriteError` asla yutulmaz.
  - `topicIds` / `tenantIds` daraltması: canlı testler yalnız kendi fikstürlerine dokunsun diye. Boş liste "hiçbiri" anlamına gelir, "hepsi" değil.
- **İş `k1-embeddings`** (src/lib/jobs/tasks/k1-embeddings.ts): 02:15 UTC'de çalışır, yani `k1-daily-calls` (02:00) ile `k1-topic-match` (02:30) arasında. Kendi kuyruğu var, 5 deneme, fill 6h.
  - Payload `{tenantId}` gelirse yalnız o profili embed eder.
  - Uyarılar yalnız sayı taşır: `k1-embeddings:failed` (warn), `:budget` (info), `:no-api-key` (warn, yalnız production).
  - Çıktı şemasında `errors` alanı yok, dolayısıyla sağlayıcı mesajı iş günlüğüne düşmez.
- **`enqueueTenantProfileEmbedding(tenantId)`** (src/lib/jobs/enqueue.ts): kiracı başına anahtar `k1-embeddings:profile:<id>`, mod `unsafe_dedupe`. Aynı profil beş kez kaydedilse de kuyrukta tek iş olur. İstek içinde embedding çağrısı yok.
- **`topic-match.ts`:** `candidatePage` / `recompute*` fonksiyonlarına isteğe bağlı `topicIds` eklendi (§4 R-3 gerekçesi). Başlık yorumu güncellendi.
- **Paylaşılan `fabrika` DB:** yalnız eklemeli migration uygulandı (`embeddingHash text YES` ×2); başka hiçbir satır yazılmadı. Önceki eklemeli migration'larla aynı kural. Gerekçe: istemciyi yeniden üreten bir ajanın `Topic`/`TenantProfile` sorgusu, sütun olmazsa düşerdi.

## 2) Kanıt

**Fiyat, resmi kaynaktan** (https://developers.openai.com/api/docs/pricing, 30.09.2026): `text-embedding-3-large` **0,13 USD / 1M token**.

**Maliyet**

Paylaşılan katalog salt-okunur olarak ölçüldü: 1301 açık/yakında konu, metin toplamı 3 882 542 karakter (ortalama 2984, medyan 1073, 16k tavanında 27 konu).

| | Token | USD |
|---|---|---|
| Tek seferlik backfill (≈4 karakter/token) | ≈ 0,97 M | **≈ 0,13** |
| Tek seferlik, ihtiyatlı (3 karakter/token) | ≈ 1,29 M | ≈ 0,17 |
| Aylık, gerçekçi (değişen/yeni konu %10–30) | 0,1–0,4 M | **≈ 0,01–0,05** |
| Aylık, en kötü durum (tüm katalog her ay değişir) | ≈ 1–1,3 M | ≈ 0,13–0,17 |
| Profil kaydı başına (50–500 token) | — | < 0,0001 |
| Tavanın mutlak aylık üst sınırı (30 gece × 0,05) | — | 1,50 |

Varsayılan 0,05 tavanıyla backfill yaklaşık 4 gecede biter. Tek gecede bitirmek için worker'da bir kez `K1_EMBEDDING_MAX_USD_PER_RUN=0.25` verilebilir. Tüm konular Eylül 2026'da çekildiği için aylık değişim oranı henüz ölçülemedi; tablodaki aylık satırlar varsayım.

**Gerçek OpenAI, uçtan uca** (izole DB `sefb_mun7c4`; kod `fabrika_app` (NOBYPASSRLS) olarak çalıştı):
```
[k1-embeddings REAL] calls=5 inputTokens=111 usd=0.000014 estimatedUsd=0.000023
A(hydrogen)   × h2   → 65.03      B(cardio-AI) × med  → 63.25
B(cardio-AI)  × agri → 29.2       B(cardio-AI) × h2   → 22.48
A(hydrogen)   × agri → 22.29      A(hydrogen)  × med  → 20.69
```
Her kiracının kendi konusu açık farkla ilk sırada. AiUsageLog satırları beklendiği gibi: 3 konu `__platform__` altında, 2 profil kendi kiracısı altında.

**Gerçek worker koşusu.** `pnpm jobs:worker` şu ortamla başlatıldı: `JOBS_CRON_ENABLED=false`, DATABASE_URL=fabrika_app@sefb_mun7c4, tavan 0.01.
```
[jobs] queued: k1-embeddings job=1 key=k1-embeddings:profile:t-wr-a
[k1-embeddings] DONE job=1 {"success":true,"topicsScanned":0,…,"profilesEmbedded":1,…,"estimatedUsd":0.000003,"maxUsd":0.01,…}
[k1-embeddings] DONE job=2 {… "profilesEmbedded":0,"profilesUpToDate":1,"estimatedUsd":0 …}       ← ikinci kayıt: 0 çağrı
[k1-embeddings] DONE job=3 {"topicsScanned":2,"topicsEmbedded":2,…}                                ← CLOSED konu taranmadı
[k1-topic-match] DONE job=4 {"success":true,"tenants":1,"done":1,…,"scored":2,"created":2,…,"topicsWithoutEmbedding":0}
TopicMatch: tp-wr-h2 69.75 (cos 0.6975) · tp-wr-med 12.8 · tp-wr-closed vektörsüz
AiUsageLog: t-wr-a k1_profile_embedding 15 tok · __platform__ k1_topic_embedding 32/23/22 tok
```
Önceki durumla karşılaştırma: `TASK-MULQL2NYKRGJX` raporunda üretimde `created 0` ve `no-embeddings` uyarısı vardı.

Worker'ı SIGTERM ile kapattım; graceful shutdown tamamlandı ve iki pid de kayboldu. Fikstürleri id ile sildim.

**Daraltmasız (NULL dalı) gerçek SQL**, sahte sınır embed'iyle: `{"first":{"t":2,"p":1},"second":{"t":0,"p":0,"upToDate":2},"match":{"created":2}}`

**Migration.** Sütunu olmayan `sefb_mulql2` üzerinde denendi:
- İleri: rc=0; tekrar: rc=0 (NOTICE skipping).
- Geri: rc=0 ve sütunlar gitti; geri tekrar: rc=0.
- Boş DB'de (`migrate diff` + `apply-migrations.sh` 37/37, `db:rls` 28→112, `db:rls-role`) de temiz geçti.

**Testler:**
- Birim, `src/lib/scoring/embeddings.test.ts`: 23 test. `fetch` stub'lanıyor; aradaki `embedText` GERÇEK, veritabanı sahte ve RLS'i taklit ediyor. Kapsam:
  - İlk koşuda 5 çağrı; ikinci koşuda **0 çağrı**.
  - Değişen metin → yalnız o satır yeniden embed edilir.
  - Hash'siz vektör bir kez yeniden üretilir.
  - Sayfalama; boş konu; 16k kesme.
  - Tavan: ikinci satırda durur ve sonraki koşu devam eder; 0 tavan → 0 çağrı; tavan env'den okunur.
  - Kiracı kapsamı; süresi dolmuş pilot (ne yazma ne AiUsageLog); silinmiş kiracı; `{tenantId}` yalnız o profil; boş id reddi.
  - Yarış koruması.
  - Anahtar yok → atla; tek 400 hatası sayılır ve koşu sürer; 3×401 → koşu durur (hata mesajında anahtar yok).
  - `AiUsageLogWriteError` yayılır; 2 boyutlu vektör reddedilir.
- İş + enqueue, `src/lib/jobs/tasks/__tests__/k1-embeddings.test.ts`: 9 test (tick, payload, uyarılar, günlükte sır yok, kiracı başına anahtar, boş id reddi).
- Canlı, `tests/k1-embeddings.live.test.ts`: 6 test sahte sınır embed'iyle + 1 gerçek OpenAI testi. Gerçek test yalnız `K1_EMBEDDINGS_REAL_OPENAI=1` ile koşar, CI'da harcama olmasın diye.

**Mutantlar** (`scratchpad/mut.py`; her mutanttan sonra dosya `.bak`'tan geri kondu). **17/17 ÖLDÜ:**
```
M1 idempotentlik yok →7  M2 hash metni yok sayar →3  M3 tavan yok →3  M4 dolmuş pilot embed →6
M5 updatedAt koruması yok →14  M6 CLOSED embed →1  M7 profil platforma yazılır →2  M8 AiUsageLogWriteError yutulur →1
M9 kesme yok →1  M10 silinmiş kiracı okunur →1  M11 hata serisinde durma yok →1  M12 profil işi manual anahtarı →1
M13 anahtar kontrolü yok →1  M14 boş tenantId kabul →1  M15 profil yazımı kiracı kapsamı dışında (RLS) →16
M16 yanlış boyutlu vektör saklanır →1  M17 topicIds daraltması yok →19
```
M6 ilk turda **hayatta kaldı**: birim fake'i CLOSED satırları kendisi süzüyordu ve canlı testte CLOSED konu yoktu. Canlı fikstüre bir CLOSED konu ekledim ve mutant öldü.

**Kapılar, temiz worktree** (`784836b7`, `git status` boş):
```
pnpm install --frozen-lockfile → 0 · db:generate → 0
pnpm typecheck → tc=0 · pnpm lint → lint=0
pnpm i18n:check → ✅ i18n check passed
pnpm rls:bypass-check → ✅ SUCCESS: no new tenant bypass
pnpm build → BUILD_EXIT=0
```
**Hedefli vitest, izole DB, 3 koşu üst üste:** `Test Files 17 passed (17) · Tests 175 passed | 1 skipped`. Kapsam: scoring, jobs tasks, k1-embeddings.live, topic-match-nightly.live, stale-relationship.live, jobs-schedule, jobs-enqueue, where-guard ×2, llm.embed, rag.

**Tam süit (izole DB, temiz worktree):** `Test Files 5 failed | 242 passed | 2 skipped · Tests 8 failed | 2891 passed | 14 skipped`. Hataların hiçbiri bu işten gelmiyor. Aynı 5 dosyayı aynı DB'de iki commit'te koştum:
```
784836b7 (benim)                        → Test Files 4 failed | 1 passed · Tests 7 failed | 55 passed | 5 skipped
6ea3f0a7 (üst commit, değişikliğim yok) → Test Files 4 failed | 1 passed · Tests 7 failed | 55 passed | 5 skipped
```
- Kalıcı kırmızılar önceden var ve boş DB'ye bağlı: `cron-tenant-scope` (alerts-daily), `plan-admin` ×2, `double-charge-prevention`, `stripe-webhook-tenant-scope.live`. Aynı aile TASK-MULQL2NYKRGJX raporunda da kayıtlı.
- `agency-invite.live` "scope is not left open" testi tek başına iki commit'te de geçiyor; yalnız tam süitin yükü altında düştü. Kararsız bir test, fe-fb'nin kartına ait.
- Tam süitte k1/embedding/topic-match dosyalarının hepsi yeşil.

## 3) Değişen dosyalar
Kod commit'i `784836b7`:
- Yeni: `src/lib/scoring/embeddings.ts` (+ `.test.ts`), `src/lib/jobs/tasks/k1-embeddings.ts` (+ `__tests__/k1-embeddings.test.ts`), `tests/k1-embeddings.live.test.ts`, `prisma/migrations/k1-embedding-hash{,.down}.sql`
- Değişen: `prisma/schema.prisma`, `prisma/migrations/apply-order.txt`, `.env.example`, `src/lib/env.ts`, `src/lib/jobs/{enqueue,events,schedule}.ts`, `src/lib/jobs/tasks/index.ts`, `src/lib/scoring/topic-match.ts`, `tests/jobs-schedule.test.ts`, `tests/topic-match-nightly.live.test.ts`

cs-fb'nin dosyalarına (`src/app/api/admin/documents`, `src/lib/rag*`) dokunulmadı. Paylaşılan ağaçtaki başkasına ait `src/modules/m11/*` değişiklikleri commit'e girmedi.

## 4) Riskler
- **R-1 (orta, ürün):** profil kaydı kancası bağlı değil (§5 Ö-1). Profil ancak gece taramasında embed ediliyor. Bugün üretimde zaten 0 `TenantProfile` satırı var.
- **R-2 (düşük):** varsayılan tavanla ilk backfill ≈4 gece sürer; bu sürede K1 kısmi çalışır. Sıra konu id'sine göre olduğu için hangi konuların önce embed edileceği rastgele değil ama önceliksiz. Tek gecede bitirmek için env yükseltilir.
- **R-3 (test kararlılığı, düzeltildi):** `Topic` global bir katalog. Embedding taraması ile topic-match canlı testi paralel koşunca birbirinin fikstürünü skorluyordu; yerelde ilk tam koşuda 8 kırmızı test gördüm. İki fonksiyona da `topicIds` daraltması ekledim ve iki canlı testi de kendi konularına sabitledim; ardından 3/3 yeşil. Aynı katalogu okuyan yeni bir canlı test yazan da daraltmayı kullanmalı (fe-fb'nin kararlılık kartıyla ilgili).
- **R-4 (düşük):** bir satırın metni her gece değişirse (ör. sağlayıcı açıklamaya tarih gömüyorsa) her gece yeniden embed edilir. Tavan bunu sınırlar ve `topicsEmbedded` sayısında görünür.
- **R-5 (bilgi):** tahmin, gerçek token sayısını değil karakter/3'ü kullanıyor, çünkü `embedText` token sayısını döndürmüyor. Tahmin gerçeğin ≈1,6 katı; yani tavan fiilen gerçek harcamanın üstünde tutuyor, altında değil.
- **R-6 (önceden var):** önceki raporun R-2'si, yani boş DB'de TopicMatch indeksinin NULLS NOT DISTINCT'siz kurulması, açık duruyor.
- **Üretime dağıtım sırası:** `k1-embedding-hash.sql` worker imajından ÖNCE uygulanmalı. Worker'da `OPENAI_API_KEY` tanımlı olmalı; tanımlı değilse iş `no_api_key` ile atlar ve production'da uyarı yazar.

## 5) Açık sorular
- **Ö-1:** profil formu (`settings/profile/page.tsx`) gerçek bir server action'a bağlanmalı; kayıt commit'lendikten sonra `enqueueTenantProfileEmbedding(tenantId)` çağrılmalı. Bu ayrı bir UI + yetki kartı (kim düzenleyebilir, i18n). Kapsamı şişirmemek için yazmadım.
- **Ö-2:** profil metnine `naceCodes` / `preferredRoles` da girmeli mi? Şu an yalnız `capabilities` ve `keywords` giriyor. Değiştirilirse hash değişir ve her profil bir kez yeniden embed edilir; bunun maliyeti ihmal edilebilir.
- **Ö-3:** kalıcı varsayılan tavan 0,05 mi kalsın? Backfill için tek seferlik 0,25 önerim var; sahibin onayı gerekiyor.

## 6) Sonraki adım
- Ö-1 kartı (profil kaydı + kanca).
- Dağıtımda: migration → worker imajı → `pnpm jobs:enqueue -- k1-embeddings` (backfill) → ertesi gece `k1-topic-match`.
- İnceleme (crw-fb / be-fb).

**Platform beyanı:** doğrulama **macOS**'ta yapıldı (Darwin 27, Postgres 16 + pgvector Docker konteynerinde, Node 26). Dokunulan kod platformdan bağımsız: saf TS, SQL ve `fetch`; süreç, dosya yolu ya da kabuk kullanmıyor. Linux worker/CI'da aynı davranmalı. Windows ve Linux'ta **koşulamadı**, çünkü bu makinede o ortamlar yok. Test sırasında kullandığım psql sarmalayıcısı yalnız bu makineye özgü, kodun parçası değil.
