# İNCELEME-55 — TASK-MUN7C48UHPOGI (se-fb) K1 embedding doldurma — fe-fb

**Sprint:** FB-GAP-1 · **İncelenen:** kod `784836b7`, rapor `docs/agent-results/TASK-MUN7C48UHPOGI-se-fb.md` · **İnceleme HEAD'i:** `dev` @ `f25463e2` (temiz, ayrık worktree; `784836b7` sonrası `src/lib/scoring`, `src/lib/jobs`, `prisma` altında değişiklik yok)
**Kod değiştirilmedi.** Tüm deneyler scratchpad worktree'sinde ve bana ait bir Postgres konteynerinde (`fefb-i55-pg`, pgvector:pg16, :55455, DB `fefb_i55`) yapıldı. Paylaşılan `fabrika-postgres`'e yalnızca bir salt-okunur SELECT atıldı (B-1, katalog profili).

## Karar: **ONAY** (merge engeli yok) + 4 engellemeyen bulgu

Kartın istediği her özellik gerçek OpenAI ile ve gerçek SQL/RLS altında doğrulandı:
- İkinci koşu 0 çağrı yapıyor.
- Hash değişince yalnızca o satır yeniden embed ediliyor.
- Tavan çağrıdan ÖNCE kesiyor.
- Kiracı kapsamı ve pilot kapısı doğru.
- Tek sağlayıcı yolu `embedText`.
- `k1-topic-match` gerçek ve anlamlı eşleşme üretiyor.

Bulgular merge'i engellemiyor ama takip kartı gerektiriyor. En önemlisi **B-1**: bugünkü katalogda tetiklenmiyor, ama tetiklendiğinde bütün hattı sessizce kilitliyor.

## Bulgular

**B-1 (orta, gizli risk) — Token sınırını aşan satır her gece yeniden deneniyor; 3 tanesi ardışıksa koşu HER GECE iptal oluyor.**
- **Kök neden:** `MAX_EMBED_CHARS = 16_000` (`src/lib/scoring/embeddings.ts:43-48`) şu varsayıma dayanıyor: "karakter başına kötümser 2 karakter/token ile bile 8191 altında kalır". Yunanca metinde bu varsayım yanlış.
- **Ölçüm:** 16 000 karakterlik Yunanca bir konu OpenAI'dan `400` aldı (gerçek çağrı, S1 `EST ellong … NO-CALL/FAILED`, `errors:["OpenAI embeddings error 400: {"]`).
- **Kalıcı başarısızlık:** Satır hash'siz kaldığı için her koşu onu yeniden deniyor (S2: `failed 1`).
- **Kilitlenme:** Sıra `id`'ye göre ve `MAX_CONSECUTIVE_FAILURES = 3` (`:54`). Böyle 3 satır art arda gelirse koşu her gece `aborted` ile bitiyor. Arkalarındaki konular ve TÜM profiller hiç embed edilmiyor:
  ```
  [i55b] STALL run1 {"emb":0,"failed":3,"aborted":true,"est":0.00208}
  [i55b] STALL run2 {"emb":0,"failed":3,"aborted":true,"est":0.00208}   ← arkadaki 2 normal konu iki gecede de vektörsüz
  ```
- **Bugünkü katalog:** Paylaşılan DB'de salt-okunur ölçtüm: 1301 açık konu, 15'i ≥15k karakter. En yüksek ASCII-dışı oran %18, HTML yok. Bu İngilizce ağırlıklı katalog bugün tetiklemez. Katalog Yunanca, Bulgarca veya Kiril alfabeli bir kaynak eklenince tetiklenir. Uyarı her gece yalnızca `k1-embeddings:failed` (warn) olarak görünür.
- **Öneri:** Aşağıdakilerden biri ya da birkaçı:
  - Kesmeyi token-güvenli bir sınıra indirmek (≈8000 karakter).
  - Bağlam uzunluğu 400'ünde metni yarıya indirip tek sefer yeniden denemek.
  - Deterministik 400'ü ardışık-hata sayacına katmamak ya da o hash'i "başarısız" diye işaretleyip atlamak.

**B-2 (düşük) — Tahmin Türkçe uzun metinde gerçeğin ALTINDA kalıyor.** Kod yorumu (`:50`) "3 karakter/token … Türkçeyi fazla sayar" diyor. se-fb raporu da tahminin "gerçeğin ≈1,6 katı" olduğunu yazıyor. Gerçek ölçüm:

| metin | karakter | tahmin (tok) | gerçek (tok) | karakter/token |
|---|---|---|---|---|
| EN kısa (h2) | 147 | 49 | 30 | 4,90 |
| EN kısa (med) | 149 | 50 | 28 | 5,32 |
| **TR uzun** | 16 000 | **5334** | **5667** | **2,82** |
| EL uzun | 16 000 | 5334 | >8191 (400) | <1,95 |

- İngilizce ağırlıklı bugünkü katalogda tavan ihtiyatlı. Türkçe metinde tahmin ≈%6 düşük kalıyor, yani fiilî harcama tavanı ≈%6 aşabilir.
- Mutlak etki küçük: 0,05 USD tavanda ≈0,003 USD.
- Öneri: `CHARS_PER_TOKEN_ESTIMATE = 2.5` ya da yorumu ve raporu düzeltmek.

**B-3 (düşük, test boşluğu) — Tahminin ihtiyatlılığını hiçbir test sabitlemiyor.**
- K5 (4 karakter/token) ve K6 (40 karakter/token, yani tahmin ≈13 kat düşük; tavan fiilen 13 kat gevşer) mutantları 39 testin tamamından **sağ çıktı**.
- Sebep: tavan testleri beklentiyi yine `estimateEmbeddingUsd()` ile hesaplıyor (`embeddings.test.ts:265`). Sabit ne olursa olsun testler kendi kendine tutarlı kalıyor.
- Öneri: bilinen token sayılı bir fikstürle `estimate ≥ gerçek` tabanı koyan bir test. Örneğin bu rapordaki ölçümler: TR 16k = 5667 tok, EN 147 karakter = 30 tok.

**B-4 (düşük, rapor düzeltmesi) — Backfill sürecinde K1 "kısmi" değil, SIFIR çalışır.**
- se-fb raporundaki R-2, backfill sürerken K1'in "kısmi" çalışacağını söylüyor.
- Kodda profiller konulardan SONRA işleniyor (`:298` `await embedTopics…`, ardından `:300` `while (!run.stopped)`). Tavan konu taramasında dolunca `run.stopped` doğru olur ve profil döngüsü hiç girmez.
- Sonuç: yaklaşık 4 gecelik backfill boyunca (varsayılan 0,05 USD) gece taramasında hiçbir profil embed edilmez, `k1-topic-match` 0 satır yazar. Tek istisna payload'lı profil işi, ama o kanca henüz bağlı değil (Ö-1).
- Üretimde bugün 0 `TenantProfile` olduğu için etkisi yok.
- Öneri: profilleri önce işlemek (ucuz, profil başına < 0,0001 USD) ya da R-2 metnini düzeltmek.

## Kontrol listesi (kartın maddeleri)

| # | Kontrol | Sonuç | Kanıt |
|---|---|---|---|
| 1 | İkinci koşuda 0 çağrı | ✅ | S2: `calls 0 embedded 0`. Daraltmasız tam koşu (20 seed konusu + benimkiler). `failed 1`, B-1'deki 400 satırı |
| 2 | Hash değişince yeniden embed | ✅ | S3: bir konunun açıklaması değişti → `calls 1 topicsEmbedded 1` |
| 3 | Tavan çağrıdan önce kesiyor | ✅ | S4a `cap=0` → `calls 0, budgetExhausted true`. CAP testi `1.5×est(b)` → AiUsageLog'da **tam 1 çağrı**, `budgetExhausted true`. Sonraki koşu kalanları aldı (S4c `calls 2`). Mutant K1 (kontrol yok) ve K2 (kontrol çağrıdan sonra) ÖLDÜ |
| 4 | Profil kaydında istekte senkron embedding yok | ✅ | `src` içinde `TenantProfile` yazan istek yolu yok. `embedText` çağıranlar yalnızca `rag.ts:298` ve `embeddings.ts`. `enqueueTenantProfileEmbedding` kuyruğa `k1-embeddings:profile:<id>` anahtarıyla iş ekliyor. Kanca bağlı değil (se-fb Ö-1, kabul) |
| 5 | Kiracı kapsamı | ✅ | S1: profil AiUsageLog satırları kendi kiracılarında (`["t-i55-en-…","t-i55-tr-…"]`), konular `__platform__`'da (3). S6 `{tenantId}` → yalnızca o kiracı, `topicsScanned 0`. Kod `fabrika_app` (NOBYPASSRLS) olarak koştu. Mutant K4 (profil → platform) ÖLDÜ |
| 6 | undefined where yok | ✅ | `tenantIds` verilince `{in, gt}`, verilmeyince `{gt: cursor}`. Boş liste "hiçbiri" demek. Boş `tenantId`, `isPresentId` ile reddediliyor (`embedProfile`, `enqueueJob`) |
| 7 | Pilot kapısı | ✅ | Süresi dolmuş pilot ve silinmiş kiracı için AiUsageLog satırı **0** (`pilot/deleted AiUsageLog rows 0`). S5 `pilotExpired: 1`. Mutant K7 ÖLDÜ |
| 8 | `embedText` tek yol mu | ✅ | Kod tabanında `api.openai.com/v1/embeddings` tek yerde geçiyor: `llm.ts:692`. `embeddings.ts` yalnızca `embedText` kullanıyor. `options.embed` enjeksiyonunu yalnızca testler kullanıyor, iş dosyası geçmiyor |
| 9 | k1-topic-match gerçek eşleşme üretiyor mu | ✅ | Gerçek vektörlerle `created: 6`. **Türkçe** profil (hidrojen tankı): TR-hidrojen 65,45 · EN-hidrojen 55,39 · tıp 10,74. EN tıp profili: tıp 62,15 · hidrojen 17,84. Diller arası da doğru sıralıyor |
| 10 | Maliyet tahmini doğruluğu | ⚠️ | EN'de ihtiyatlı (1,6–1,8 kat). TR uzun metinde %6 düşük (B-2). EL'de modele sığmıyor (B-1) |
| 11 | ≥3 mutant | ✅ | 9 mutant: 7 öldü, 2 sağ (B-3) |

## Kanıt

**Kurulum** (temiz ayrık worktree, `git status` boş, `pnpm install --frozen-lockfile` 0). CI sırası:
```
prisma db push → "in sync" · db:generate 0 · db:rls-role "fabrika_app connects as fabrika_app"
apply-migrations.sh ×2 → mig1=0 mig2=0 (k1-embedding-hash uygulandı) · db:rls "Policies 28 → 112" · db:seed 0
columns: TenantProfile.embeddingHash, Topic.embeddingHash
```
Not: İlk DB adım `fabrika` olduğu için canlı süitler kendilerini korumaya aldı ve **atladı** (`SHARED` koruması doğru çalışıyor). DB'yi `fefb_i55` olarak yeniden adlandırıp tekrar koştum.

**Hedefli testler** (izole DB, `fabrika_app`):
```
embeddings.test + k1-embeddings job test + k1-embeddings.live + topic-match-nightly.live + jobs-schedule + src/lib/scoring
Test Files  6 passed (6) · Tests  83 passed | 1 skipped (84)
```
**Kapılar:** `pnpm typecheck` → 0 · `pnpm lint` → 0 (scratch testleri çıkarıldıktan sonra, `git status` boş).

**Gerçek OpenAI, bağımsız betik** (`scratchpad/zz-i55-real.live.test.ts`, commit'lenmedi). Anahtar `.env`'den process env'e okundu, hiçbir yere yazılmadı:
```
[i55] S1 {"topicsScanned":24,"topicsEmbedded":3,"topicsUpToDate":20,"profilesScanned":3,"profilesEmbedded":2,"profilesPilotExpired":1,"failed":1,"estimatedUsd":0.00141,"maxUsd":0.05,"budgetExhausted":false,"aborted":false,"errors":["OpenAI embeddings error 400: {"]} calls 5 tokens 5790 realUsd 0.000753
[i55] EST h2 chars 147 estTok 49 realTok 30 chars/tok 4.90
[i55] EST med chars 149 estTok 50 realTok 28 chars/tok 5.32
[i55] EST trlong chars 16000 estTok 5334 realTok 5667 chars/tok 2.82
[i55] EST ellong chars 16000 estTok 5334 realTok NO-CALL/FAILED
[i55] S1 attribution ["t-i55-en-jnb5u1","t-i55-tr-jnb5u1"] platform topics 3
[i55] S2 calls 0 embedded 0 failed 1 estUsd 0.000693
[i55] S3 calls 1 topicsEmbedded 1
[i55] S4a cap=0 calls 0 budgetExhausted true
[i55] S4c next run calls 2 embedded 2
[i55] S5 match {"created":6,"pilotExpired":1}
[i55] S5 en med 62.15 · en h2 17.84 · en trlong 12.14
[i55] S5 tr trlong 65.45 · tr h2 55.39 · tr med 10.74
[i55] S6 calls 1 ["t-i55-en-jnb5u1"] topicsScanned 0 profilesEmbedded 1
[i55] pilot/deleted AiUsageLog rows 0
[i55b] CAP 1.5×est(b) {"emb":1,"budgetExhausted":true,"est":0.000003,"cap":0.0000041} AiUsageLog calls 1
```
S4b'yi (bir önceki satır) kanıt saymadım. Karışıktı: id sırasında önde duran, B-1'deki başarısız EL satırının tahmini tavandan büyüktü ve koşu onda durdu. Bu da B-1'in bir başka yüzü: tahmini tavanı aşan tek bir satır, arkasındaki her şeyi bekletiyor. Temiz tavan kanıtı `i55b CAP` satırıdır.

**Harcama:** AiUsageLog K1 toplamı 39 çağrı, 17 615 token ≈ **0,0023 USD**. Temizlikte silinen profil satırları ≈ +0,00001 USD. 400 alan çağrılar ücretlendirilmiyor. Tavan 0,3 USD idi.

**Mutantlar** (`scratchpad/mut.py`; hedef `embeddings.ts`; 3 test dosyası; her mutanttan sonra orijinal geri yazıldı, `git diff --stat` boş):
```
OLDU    K1 tavan kontrolü yok                    | 3 failed
OLDU    K2 tavan kontrolü çağrıdan SONRA         | 3 failed
OLDU    K3 hash yok sayılır                      | 4 failed
OLDU    K4 profil platforma yazılır              | 2 failed
HAYATTA K5 tahmin iyimser (4 karakter/token)     | 38 passed      ← B-3
HAYATTA K6 tahmin 13× iyimser (40 karakter/token)| 38 passed      ← B-3
OLDU    K7 pilot kapısı yok                      | 6 failed
OLDU    K8 CLOSED dahil                          | 1 failed
OLDU    K9 kesme 64k                             | 1 failed
```
(K2'nin ilk sürümü hatalıydı: ön kontrolü de yerinde bırakmıştım, dolayısıyla eşdeğer bir mutanttı. Düzeltip yeniden koştum, öldü.)

**Paylaşılan katalog profili** (salt-okunur, `fabrika-postgres`):
```
open topics 1301 | ≥15k chars 15 | non-ASCII >%5: 38 | max non-ASCII oranı 0.180 | HTML 0
```

## Değişen dosyalar
Yalnızca bu rapor. Kod değişikliği yok.

## Riskler
- B-1 katalog kaynağı genişleyince (Yunanca, Bulgarca vb.) sessiz ve kalıcı bir kilitlenmeye dönüşür.
- İlk backfill süresince K1 0 satır yazar (B-4).

## Açık sorular
- **Yol çelişkisi:** Görev sarmalayıcısı sonucu `/Users/macbook/alan/docs/agent-results/TASK-MUN7C48UHPOGI-se-fb.md` yoluna yazmamı istiyordu. Bu yol repo dışında ve incelenen ajanın rapor adı. Görev gövdesindeki SONUÇ DOSYASI yolu esas alındı; se-fb'nin raporuna dokunulmadı.
- B-1..B-4 için takip kartı açılsın mı, yoksa se-fb'nin Ö-1 kartına mı eklensin? Karar lider/sahibin.

## Sonraki adım
- se-fb: B-1 (token-güvenli kesme + deterministik 400'ü sayaç dışı tutma), B-3 (sabit fikstürlü tahmin testi), B-2/B-4 (sabit ya da yorum/rapor düzeltmesi).
- Temizlik: `fefb-i55-pg` konteyneri ve scratch worktree bu inceleme sonunda silindi.

**Platform beyanı:** Doğrulama **macOS**'ta yapıldı (Darwin 27, Node, Docker'da Postgres 16 + pgvector). İncelenen kod platformdan bağımsız: saf TS, SQL ve `fetch`; süreç, dosya yolu ya da kabuk kullanmıyor. Linux worker ve CI'da aynı davranmalı. Windows ve Linux'ta **koşulamadı**, çünkü bu makinede o ortamlar yok. Kullandığım psql sarmalayıcısı ve scratch betikleri yalnızca bu makineye özgü, kodun parçası değil.
