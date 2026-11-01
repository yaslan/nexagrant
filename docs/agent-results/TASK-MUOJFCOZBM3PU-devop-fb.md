# TASK-MUOJFCOZBM3PU — evidence live testleri gerçek MinIO ile (dev 0779e8f8)

**Hüküm: YEŞİL.** 4 test dosyası geçti, 4 başarısız dosya yok. 57 test geçti, 0 atlandı.

**Platform beyanı:** Testleri macOS'ta (Darwin 27.0, arm64) Docker Desktop ile koştum. Konteynerler Linux arm64 imajları: `bitnamilegacy/minio:latest` (MinIO DEVELOPMENT.2025-05-24T17-08-30Z) ve `pgvector/pgvector:pg16`. Windows ve Linux'ta koşmadım, gerek de yok. Bu iş kod değiştirmiyor; testler Node, S3 HTTP ve Postgres kullanıyor, platforma bağlı bir kod yolu yok. Tek fark port seçimi: `41000 + pid % 15000` (T-7 proxy'si). Bu formül her işletim sisteminde aynı çalışır.

## 1. Ne yapıldı
- **Registry sorununun kökü:** `docker pull minio/minio:latest` şu hatayı veriyor: `pull access denied for minio/minio, repository does not exist or may require 'docker login'`. MinIO, Docker Hub'daki topluluk imajını artık yayınlamıyor. Makinede yerel olarak `bitnamilegacy/minio:latest` imajı vardı; onu kullandım. CI iş akışında (`.github/workflows/ci.yml`) MinIO servisi tanımlı değil. Tek servis `pgvector/pgvector:pg16`.
- **Ayrı çalışma kopyası:** Scratchpad'e `git clone --no-checkout` ile klonladım, ardından `0779e8f8` üzerinden `devop-fb/muojfc-minio` dalını açtım. `/Users/macbook/alan/FONBRIDGE` ana checkout'unda hiçbir komut koşmadım. O checkout'taki `devop-fb/muoibd-gates` dalına ve üstündeki be-fb `57e13bc0` commit'ine dokunmadım; hâlâ orada duruyorlar. dev ref'ine dokunmadım, push yapmadım.
- **Ayrı konteynerler** (`:5433` fabrika-postgres'e dokunmadım):
  - `devopfb-muojfc-pg` → `127.0.0.1:55931` (pgvector:pg16, fabrika/fabrika/fabrika)
  - `devopfb-muojfc-minio` → `127.0.0.1:59100` (S3), `:59101` (konsol); bucket adı `fb-evidence-test`, `mc anonymous get` sonucu `private`. İmzasız GET 403 döndü.
- **DB hazırlığı CI sırasıyla yapıldı:** `prisma db push` → `db:rls-role` → `apply-migrations.sh` ×2 (her geçiş "41 files applied") → `db:rls` ("Policies in public: 28 → 112") → `db:generate` → `db:seed`. Çıkış kodu 0.
- **Değişkenler:** `EVIDENCE_S3_TEST_ENDPOINT=http://127.0.0.1:59100`, `_ACCESS_KEY`/`_SECRET_KEY` atılabilir test kimlik bilgileri, `_BUCKET=fb-evidence-test`, `DATABASE_URL`/`DATABASE_URL_RLS_TEST` → :55931. Klonda `.env` yok; tüm değerler süreç ortamından geldi.

## 2. Kanıt
Komut: `pnpm exec vitest run --reporter=verbose tests/evidence-confirm-store-faults.live.test.ts tests/evidence-dev-store.live.test.ts tests/evidence-object-key.live.test.ts tests/evidence-upload-s3.live.test.ts` (exit=0)

```
 Test Files  4 passed (4)
      Tests  57 passed (57)
   Start at  23:10:01
   Duration  167.13s (transform 647ms, setup 0ms, import 1.49s, tests 168.55s, environment 0ms)
```
Atlanan test sayısı **0**. Logda `skip`/`↓` geçmiyor (`grep -ciE 'skip'` → 0). 57 satırın hepsi `✓`.

T-7 (crw-fb) ve eskiden kırmızı olan durumlar bu koşuda geçti. Seçilmiş satırlar:
```
✓ … T-7: a store that holds the HEAD of the final object after the copy is given up on within the deadline 1832ms
✓ … T-5 (final key HEAD): a confirm whose store holds the HEAD of the copied object answers storage_unavailable within the time left to it 15265ms
✓ … crw-fb's case: every store call after the copy takes 6 s — the confirm is slow, and it succeeds 12144ms
✓ … Y-2: a process that freezes inside confirm's transaction loses the lock after 20 s, not hours; the retry succeeds 24098ms
✓ … RACE-2: a second confirm that starts before the first one saved its row cannot change the file the first one recorded 1556ms
```
Dosya başına dağılım: confirm-store-faults 24, upload-s3 20, dev-store 8, object-key 5. Toplam 57.

## 3. Değişen dosyalar
Yalnız bu rapor. Kod ve test değişmedi.

## 4. Riskler
- `bitnamilegacy/minio` 16 aylık, bakımı yapılmayan bir imaj. Yerelde yeterli, ama CI'da buna yaslanmak kırılgan olur. Docker Hub'dan `minio/minio` çekilemiyor.
- CI'da bu 4 dosyanın S3'e bağlı kısmı hâlâ atlanıyor, çünkü CI'da S3 servisi yok. Bu koşunun yeşil olması tek seferlik, elle alınmış bir kanıt; kalıcı bir kapı değil.

## 5. Açık sorular
- CI'a MinIO servisi eklenecek mi? Bir karar gerekiyor: sabitlenmiş bir imaj mı (ör. `quay.io/minio/minio` ya da kendi registry'mizde bir ayna), yoksa atlamaya devam mı?

## 6. Sonraki adım
- CI'a MinIO servisi ekleyen ayrı bir kart açılabilir; geri alma yolu servis bloğunu silmek olur. Bu karta dahil değil.
- Konteynerleri koşudan sonra kaldırdım (`docker rm -f devopfb-muojfc-pg devopfb-muojfc-minio`).
