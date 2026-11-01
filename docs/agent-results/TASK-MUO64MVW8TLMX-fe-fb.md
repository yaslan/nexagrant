# TASK-MUO64MVW8TLMX — fe-fb — Kanıt confirm yarışı (İNCELEME-82 Y-1 / T-1 / T-2)

**Durum:** TAMAM
**Dal:** `fe-fb/muo64m-confirm-race` (dev `47c96594` üzerinden). Kapılar yeşil olunca dev'e merge edildi, push yapılmadı.
**Ortam:** izole Postgres `fefb64-pg` (127.0.0.1:55164) ve kendi MinIO'm `fefb64-minio` (127.0.0.1:59164). Kurulum CI sırasıyla yapıldı: `db push` → `db:rls-role` → `apply-migrations` ×2 → `db:rls` → `db:seed`. Paylaşılan :5433'e yazılmadı.
**Devam notu:** Önceki koşu ~17:05'teki ağ kesintisiyle yarıda kaldı. Geriye dal ya da worktree kalmamıştı, bu yüzden iş dev'den sıfırdan yapıldı.

**Platform beyanı:** mac'te doğrulandı (Darwin 27, Node 26.5, vitest 4.1.11, `pgvector/pgvector:pg16`, `bitnamilegacy/minio` 2025-05-24). Linux ve Windows'ta koşulamadı, çünkü bu makinede yalnız mac var. Koddan çıkarımlar:
- Kilit Postgres'te (`pg_advisory_xact_lock`), süre sınırı SDK'da (`AbortSignal.timeout`). İkisi de platformdan bağımsız.
- Dev deposu kodu değişmedi (`copyFile` + `rename`). Dev deposu da artık aynı kilit altında, çünkü kilit depo türünden bağımsız confirm akışında duruyor.
- Windows'taki `rename` davranışı crw-fb raporunda anlatıldığı gibi.

## 1. Ne yapıldı

### Y-1: iki confirm üst üste binince kayıtlı dosya değişebiliyordu
Önce koşullu yazmayı denedim (`CopyObject` + `If-None-Match: *`). MinIO bu başlığı CopyObject'te **yok sayıyor**: ikinci kopya v2'yi yine yazdı (`{first:'ok', second:'ok', dst:'v2'}`). R2'deki davranışı da doğrulayamadım. Bu yüzden bu yolu bıraktım ve DB kilidini seçtim.

`confirmEvidenceUploadAction` artık üç adımı tek bir `withTenant` transaction'ında, final anahtar başına alınan bir kilit altında yapıyor: "zaten kayıtlı mı?", "kontrol et ve kopyala", "satırı yaz".
- Kilit: `pg_advisory_xact_lock(sha256("evidence-confirm:"+finalKey))`.
- İkinci confirm, birincisi commit edene kadar bekler. Sonra satırı görür, `already_confirmed` döner ve **hiçbir şey kopyalamaz**.
- B-1 garantisi korunuyor: tx içinde hiçbir şey silinmiyor. Staging nesnesi yalnız commit'ten sonra siliniyor. Bir hata olursa staging yerinde kalıyor ve aynı confirm yeniden denenebiliyor.

Kilidin bekleme ve süre sınırları şöyle ayarlandı:
- **Kilidi bekleme sınırı:** `lock_timeout = 10s`. Süre dolarsa `save_failed` döner; yeniden denenebilir ve staging korunur.
- **Kopyanın süre sınırı:** `EVIDENCE_COPY_DEADLINE_MS = 15 s`. `copyIncomingObject` içindeki dört S3 çağrısı tek bir `AbortSignal.timeout` paylaşıyor; süre dolarsa `storage_unavailable` döner.
- **Tx süresi:** 10 + 15 + 15 = 40 sn (`CONFIRM_TX_TIMEOUT_MS`). Bu, kilidin açılabileceği her an kopyanın zaten bitmiş ya da iptal edilmiş olmasını sağlıyor.
- `withTenant` ve `withTenantOn`, Prisma'nın `{ timeout, maxWait }` seçeneğini alabiliyor. Bu isteğe bağlı üçüncü bir argüman; diğer tüm çağıranlar değişmeden varsayılanı kullanıyor.

### T-1
`tests/evidence-incoming-key.test.ts` dosyasına crw-fb'nin iki red girdisi eklendi:
- `…/incoming/incoming/org-default/…`
- `…/incoming/zzz/incoming/org-default/…`

### T-2
Üç test eklendi:
- **Dev deposu:** `evidence-dev-store.live` içinde satır kaydı başarısız olursa `save_failed` dönüyor, staging dosyası aynen duruyor ve yeniden deneme başarılı oluyor.
- **Ön-kontrol DB hatası:** "zaten kayıtlı mı?" okuması başarısız olursa `save_failed` dönüyor, **hiç kopya yapılmıyor**, staging korunuyor ve yeniden deneme başarılı oluyor.
- **Satır kaydı hatası:** 5,5 sn bekleyen create testinin yerini aldı, çünkü tx artık 40 sn. Kopya yapıldıktan sonra create hata verirse `save_failed` dönüyor ve yeniden deneme başarılı oluyor.

### Arıza suite'ine eklenen diğer testler
`tests/evidence-confirm-store-faults.live.test.ts`:
- **RACE-2 regresyon testi**, crw-fb'nin zamanlamasıyla: A'nın final HEAD'i 1,5 sn, C'nin kopyası 2,5 sn sürüyor ve arada aynı imzalı PUT ile v2 yükleniyor. Beklenen sonuç: A `success`, C `already_confirmed`, final nesne v1 ve tek bir CopyObject.
- **Kilit bekleme sınırı:** A'nın kopyası 11 sn sürerken C 10 sn içinde `save_failed` döndürüyor ve hiç kopyalamıyor. A başarılı oluyor; C yeniden gönderilince `already_confirmed` alıyor.
- **Kopya süre sınırı:** depo kopyayı 18 sn tutuyor. Confirm yaklaşık 15 sn'de `storage_unavailable` dönüyor, hiçbir şey kaybolmuyor ve yeniden deneme başarılı oluyor.
- **5 eşzamanlı confirm:** 1 satır, 1 CopyObject, final nesne yüklenen baytlarla aynı.

## 2. Kanıt

**Evidence suite'leri** (`evidence-suites.txt`). Gerçek MinIO ve RLS rolüyle, `CI=true` altında da atlanmadan koştu:
```
Test Files  10 passed (10)
     Tests  120 passed (120)        (öncesi: 112)
```

**crw-fb'nin saldırı suite'i yeni koda karşı** (`attack-lines-fefb64.txt`, suite `zz-fefb64-attack.live.test.ts.txt`). Portlar ve kap adı benim ortamıma çevrildi. withTenant mock'u tx seçeneğini ve yeni dönüş şeklini geçirecek biçimde uyarlandı. Suite repoya test olarak girmedi.
```
RACE   → A=success C=already_confirmed rows=1   final==v1: true  final==v2: false  download serves: % ORIGINAL certificate, valid until 2027
RACE-2 → A=success C=already_confirmed rows=1 rowId==A: true
         final==v1: true  final==v2: false  download of A's row serves: % ORIGINAL certificate, valid until 2027
   (İNCELEME-82'de: final==v1: false  final==v2: true  "% FORGED certificate, valid until 2099")
slow-after-copy (12047 ms) → success=true rows=1 finalEqUpload=true staging=false
docker PAUSE 8s → success=true ms=8080 · docker STOP → storage_unavailable → start → retry success
10 depo arıza noktası + findFirst/create DB hatası → hata, rows=0, stagingIntact=true → retry success
5x confirm → ok + already_confirmed×4 rows=1 finalEqUpload=true
Tests  1 failed | 22 passed (23)
```
Tek kırmızı olan testin adı "create blocked by a lock past the 5 s tx (P2028) → save_failed". Bu test eski 5 sn tx'e göre yazılmıştı. Yeni kodda confirm, başka bir tx'in 7 sn tuttuğu satır kilidini bekliyor. O tx geri alınınca confirm **başarılı** oluyor (6,7 sn, rows=1, final baytları doğru). Beklenen bir davranış değişikliği, hata değil.

**Mutantlar** (`mutants-all.txt`, `mut64.py`), 10 evidence suite'ine (120 test) karşı. **10/10 KILLED**:
```
K1  advisory lock satırı silinir                 → RACE-2, kilit-bekleme, 5x kırmızı
K2  lock_timeout yok                             → kilit-bekleme kırmızı
K3  tx süresi varsayılan 5 sn                    → slow-after-copy, süre sınırı, kilit-bekleme kırmızı
K4  kopya süre sınırı yok                        → süre sınırı testi kırmızı
K5  ön-kontrol DB hatası yutulur (crw-fb N5)     → T-2 ön-kontrol kırmızı
K6  dev deposu staging'i taşır (crw-fb N9)       → T-2 dev deposu kırmızı
K7  desende ^ yok (crw-fb N7)                    → T-1'in iki girdisi kırmızı
K8  kilit anahtarı her çağrıda farklı            → RACE-2, kilit-bekleme, 5x kırmızı
K9  kayıtlıysa staging silinmez                  → D-1 A1 (S3 + dev) kırmızı
K10 "zaten kayıtlı" dalı yok                     → RACE-2, 5x, D-1 kırmızı
```
Her mutanttan sonra `git status` ve grep ile kaynağın geri yazıldığı doğrulandı. Bir not: mutant koşusu K7'de dışarıdan kesildi (exit 144) ve K7 değişikliği dosyada kaldı. Bunu fark edip geri aldım ve doğruladım, sonra K7–K10'u temiz ağaçta yeniden koştum.

**Kapılar** (`gates.txt`, `build-tail.txt`, `full-vitest-summary.txt`):
```
typecheck rc=0 · lint rc=0 · i18n ✅ both catalogs agree · build rc=0
CI=true npx vitest run (izole DB + MinIO env):
  Test Files 293 passed | 2 skipped (295) · Tests 3622 passed | 9 skipped (3631) · rc=0
```
**Birleşik ağaç** (dev `12fa4b1e` dalıma merge edildikten sonra, `gates-merged.txt`). Dev'deki 45 dosyalık değişiklik benim dosyalarıma ve şemaya dokunmuyor.
```
typecheck rc=0 · lint rc=0 · i18n ✅ · build rc=0
CI=true npx vitest run: Test Files 294 passed | 2 skipped (296) · Tests 3696 passed | 9 skipped (3705) · rc=0
```
İlk tam koşuda 3 dosya import anında kırmızıydı: `auth-jwt-membership-refresh`, `invitation-accept` ve `oauth-registration`. Hepsi "refusing to skip in CI — AUTH_SECRET is not set" hatası veriyordu; bu benim ortamımdaki bir eksikti, kodla ilgisi yok. Test için ayrı bir `AUTH_SECRET` ile üç dosya 46/46 geçti (`rerun-3.txt`). Ardından tam koşu baştan tekrarlandı ve yukarıdaki temiz sonucu verdi.

## 3. Değişen dosyalar
- `src/app/[locale]/(app)/[workspace]/evidence/actions.ts`: confirm akışı kilit altında tek tx'te. Kilit anahtarı ve süre sabitleri eklendi.
- `src/lib/storage.ts`: `EVIDENCE_COPY_DEADLINE_MS` ve `copyIncomingObject` S3 çağrılarına `abortSignal` eklendi.
- `src/lib/db.ts`: `TenantTxOptions` tipi; `withTenant` ve `withTenantOn` isteğe bağlı `options` alıyor.
- `tests/evidence-confirm-store-faults.live.test.ts`: `dbFault` ve istek `hook`'u eklendi. RACE-2, kilit bekleme, süre sınırı, 5x, T-2 ön-kontrol ve satır kaydı hatası testleri eklendi.
- `tests/evidence-dev-store.live.test.ts`: T-2 dev deposu testi ve `failCreate` eklendi.
- `tests/evidence-incoming-key.test.ts`: T-1'in iki girdisi eklendi.
- `tests/evidence-object-key.live.test.ts`, `tests/evidence-upload-s3.live.test.ts`: mock artık tx seçeneğini geçiriyor.
- `docs/agent-results/TASK-MUO64MVW8TLMX-fe-fb.md` ve `…-ekler/`

## 4. Riskler
- **Bağlantı tutma:** Confirm süresince bir havuz bağlantısı tutuluyor. Normalde bu 1 sn'nin altında; yavaş depoda en fazla ~40 sn. Confirm seyrek bir işlem, ama çok sayıda yavaş confirm aynı anda gelirse havuz daralabilir. Aynı anahtarı bekleyen confirm'ler de bağlantı tutuyor, en fazla 10 sn.
- **Kalan dar pencere:** Kopya süre sınırında istemci isteği iptal ediyor ve tx kilidi bırakıyor. Depo iptal edilmiş CopyObject'i sunucu tarafında yine de tamamlarsa, bu geç kopya, arada kilidi alıp commit etmiş bir sonraki confirm'in dosyasının üzerine inebilir. Bunun için deponun 15 sn'yi aşıp istemci gittikten sonra kopyayı bitirmesi ve o sırada bir başka confirm'in kontrol + kopya + commit'i bitirmiş olması gerekir. Bu dosya da kontrolden geçmiş bayt olur. Tamamen kapatmak için depo tarafında koşullu yazma gerekiyor; MinIO CopyObject'te bunu desteklemiyor, R2'de doğrulanmadı.
- **Davranış değişikliği:** Aynı anahtarla satır kilidi tutan başka bir tx varsa confirm artık 5 sn'de `save_failed` dönmüyor, 40 sn'ye kadar bekleyip sonucu buna göre veriyor.
- **R2:** Prod'da `AbortSignal` ile R2 davranışı MinIO dışında denenmedi. SDK düzeyinde bir özellik olduğu için farklı davranması beklenmez.

## 5. Açık sorular
- Kalan dar pencere (Risk 2) için R2'nin CopyObject'te `If-None-Match` desteği prod'da bir kez denensin mi? Destekliyorsa ek bir koruma katmanı olarak eklenebilir. Ancak yeniden denemede yetim final nesneyle 412 alınacağı için akışta ayrıca ele alınması gerekir.

## 6. Sonraki adım
- crw-fb'den yeniden inceleme: RACE-1 ve RACE-2 ile kilit bekleme ve süre sınırı senaryoları.
- D-3 yetim final kopya süpürücüsü ayrı kartta kalıyor.
- Temizlik: `fefb64-pg` ve `fefb64-minio` kapları ile worktree rapordan sonra kaldırıldı.
