# TASK-MUO9IFMMVRUDJ — fe-fb — FB DÜZELTME: confirm kilidi havuzu tüketmesin (İNCELEME-92 B-1, Y-2, Y-3, T-3/T-4/T-5)

**Durum:** TAMAM
**Dal:** `fe-fb/muo9if-confirm-pool` → dev'e merge edildi, push yok.
**Ortam:** kendi worktree'm, izole Postgres `fefb9i-pg` (127.0.0.1:55109, `pgvector/pgvector:pg16`) ve kendi MinIO'm `fefb9i-minio` (127.0.0.1:59109, `bitnamilegacy/minio`). Kurulum CI sırasıyla yapıldı: `db push` → `db:rls-role` → `apply-migrations` ×2 → `db:rls` → `db:seed`. Paylaşılan :5433'e yazılmadı.

**Platform beyanı:** mac'te doğrulandı (Darwin 27, Node 26.5, vitest 4.1.11). Linux ve Windows'ta koşulamadı, çünkü bu makinede yalnız mac var. Koddan çıkarımlar:
- Değişiklik platforma bağlı değil. Havuz (`pg.Pool`), `set_config(…, true)`, `statement_timeout`, `idle_in_transaction_session_timeout` ve `pg_advisory_xact_lock` Postgres ve Node tarafında çalışıyor. Dosya yolu, kabuk ya da sinyal kullanılmıyor.
- `AbortSignal.timeout` Node'un kendi zamanlayıcısı, her platformda aynı çalışır.
- Y-2 testi süreci dondurmak için sinyal kullanmıyor. Donmayı, işlem içindeki bağlantıyı JS tarafında bekleterek canlandırıyor, bu yüzden Windows'ta da aynı biçimde koşar.

## 1. Ne yapıldı

İnceleme iki yol önermişti:
- (a) kısa tx'lerle "confirming" durumu tutmak,
- (b) kilidi havuz dışı, kısa ömürlü ve süre sınırlı bir bağlantıda tutmak.

**(b)'yi seçtim.** (a) yeni bir durum sütunu ya da tablo istiyor. Ayrıca süreç ölürse "confirming" satırı takılı kalıyor ve bunun için bir temizlik işi gerekiyor. (b) ise İNCELEME-77/82 garantilerini **aynı tx semantiğiyle** koruyor: kilit, "kayıtlı mı?" okuması ve satır tek tx'te kalıyor. Değişen yalnız hangi havuzda koştuğu ve tx'in hangi sınırlar içinde yaşadığı.

- **B-1:** `src/lib/db.ts` içine `withTenantLockPool` eklendi. `withTenantOn`'u ayrı, tembel kurulan bir Prisma istemcisi üzerinde çalıştırıyor. Bu istemcinin havuzu en fazla `LOCK_POOL_MAX = 3` bağlantı açıyor. Boş bağlantı için kuyruk beklemesi `LOCK_POOL_QUEUE_MS = 5 sn`, sonra `save_failed` dönüyor (yeniden denenebilir). Havuzun bağlantıları `pg_stat_activity` içinde `application_name = 'fonbridge-lock-pool'` olarak görünüyor; bu, izleme notu için de kullanılabilir. Confirm artık bu havuzda koşuyor. Uygulama havuzu (süreç başına 10 bağlantı) yavaş depodan etkilenmiyor. `createDbClient` isteğe bağlı havuz seçeneklerini (`max`, `connectionTimeoutMillis`, `application_name`) de kabul ediyor.
- **Y-2:** confirm tx'inde `idle_in_transaction_session_timeout = 20 s` tanımlandı (tx'e yerel). Donmuş süreç ya da ağ bölünmesi kilidi artık 20 sn'de bırakıyor; önceden TCP keepalive devreye girene kadar, saatlerce tutuyordu.
- **Y-3:**
  - Kilitten sonraki her ifadeye `statement_timeout = 5 s` (tx'e yerel). Kilidin önüne konmadı; öyle olsaydı kilit beklemesi 5 sn'ye düşerdi.
  - Kopya süresi artık sabit 15 sn değil, kalan zamandan türetiliyor: `min(15 sn, boşta-kalma penceresinin kalanı − 2 sn, tx zaman aşımının kalanı − satır yazımı − 2 sn)`. Boşta-kalma saati, son ifadenin **gönderildiği** andan başlatılıyor. Postgres saati ifade bittiğinde başlatır ve bu an gönderimden önce olamaz; dolayısıyla hesap güvenli tarafta kalıyor ve olay döngüsü takılması da sayılıyor. İlk sürümde saati `findFirst` döndükten sonra başlatıyordum; test bunu yakaladı (N5).
  - Kalan süre 1 sn'nin altındaysa kopya hiç denenmiyor ve `storage_unavailable` dönüyor.
  - Sonuç: kopya, kilidi tutan tx'ten önce bitiyor. Tx zaman aşımı `10 + 5 + 15 + 5 + 5 = 40 sn`.
- **Süre sınırı:** `copyIncomingObject(incomingKey, finalKey, deadlineMs?)`. HEAD, ranged GET, CopyObject ve geri-okuma HEAD'i tek bir `AbortSignal` paylaşıyor. Dev deposu (yerel dosya) yolu süreyi yok sayıyor, çünkü dosya işlemleri iptal edilemiyor.
- **Testler** (`tests/evidence-confirm-store-faults.live.test.ts`, yeni describe "İNCELEME-92"): B-1 havuz, T-4, T-3, Y-2 donma, Y-3 boşta-pay, Y-3 tx-pay, Y-3 statement_timeout, T-5 HEAD ve T-5 GET. Kilit-bekleme testine alt sınır eklendi (≥9 sn). Yeni `tests/lock-pool.live.test.ts` gerçek `withTenantLockPool`'u sınıyor, çünkü evidence suite'leri bu fonksiyonu test istemcisine yönlendiriyor.
- Diğer üç evidence suite'inin `@/lib/db` mock'una `withTenantLockPool` eklendi.

## 2. Kanıt

### Ölçüm: MinIO 10 sn `docker pause`, A kiracısı 10 confirm, B kiracısı 500 ms'de bir sorgu + `pg_stat_activity`
Dosyalar: `…-ekler/olcum-sonra.txt` ve `…-ekler/olcum-once.txt`. "Önce" koşusunda aynı kod kullanıldı, yalnız confirm geçici olarak `withTenant`'a (uygulama havuzu) döndürüldü; sonra geri alındı. B'nin sorgusu üretimle aynı biçimde kurulmuş 10 bağlantılı uygulama havuzundan geçiyor.

| | B kiracısının sorguları (depo durmuşken) | uygulama havuzu fabrika_app bağlantıları | kilit havuzu | confirm'ler |
|---|---|---|---|---|
| **Önce** (confirm uygulama havuzunda) | 6/6 **FAIL** "timeout exceeded when trying to connect", her biri 1001–1003 ms; depo dönünce ilk sorgu 586 ms | **10 idle in transaction** (havuzun tamamı) | — | 10 ok @ ~10.1 sn |
| **Sonra** | **18/18 ok, 4–9 ms** | 0 idle in transaction | **3 idle in transaction** (üst sınır) | 3 ok @ 10.25 sn, 7 `save_failed` @ 5.0 sn → 7 yeniden deneme de ok |

Satır satır tablo `olcum-sonra.txt` dosyasında. İlk satırlar:
```
| 0.5 | ok | 9 | 0 / 3 / 0 | 0 / 0 / 10 |
| 5.1 | ok | 5 | 0 / 3 / 0 | 0 / 0 / 1 |
| 9.2 | ok | 5 | 0 / 3 / 0 | 0 / 0 / 1 |
confirms: ok@10251ms, save_failed@5014ms, ok@10250ms, … 
[MEASURE] retries: all 7 succeeded
```

### Yeni testler (`yeni-testler.txt`)
```
[B-1] confirms=…,ok×3,save_failed×7 probes=ok 15ms | ok 5ms | ok 4ms | ok 5ms lockPoolConnections(peak)=3
[Y-2] lock released after 20077 ms; confirm={"success":false,"error":"save_failed"}   (sonra yeniden deneme success)
[Y-3 idle] copy given up after 18005 ms; lock held until confirm answered
[Y-3 tx] copy given up after 33006 ms; lock held until confirm answered
✓ Y-3 statement_timeout 5057ms · ✓ T-3 · ✓ T-4 · ✓ T-5 HEAD 4808ms · ✓ T-5 GET 4765ms
```

### İNCELEME-77/82 garantileri hâlâ geçerli
Aynı suite'teki şu testlerin hepsi yeşil:
- eski B-1 senaryoları: yavaş depo, kopyadan sonra kapanan depo, satır hatası, ön-kontrol hatası, süre aşımı, kapalı depo, kontrol ile kopya arasında değişen staging;
- RACE-2, kilit-bekleme ve "beş confirm birden" (tek satır, tek kopya);
- 9 evidence suite'inin tamamı.

### Mutantlar (`mutants.txt`, `mut9i.py`): **15/15 KILLED**
Her mutanttan sonra kaynak geri yüklendi ve kontrol edildi. Eski İNCELEME-92 listesinde hayatta kalan M2, M5, M8 ve M12 artık ölüyor.
```
KILLED N1  confirm uygulama havuzunda (withTenant)          → B-1
KILLED N2  idle_in_transaction_session_timeout yok          → Y-2
KILLED N3  statement_timeout yok                            → Y-3 statement_timeout
KILLED N4  kopya süresi boşta-kalma payını saymıyor         → Y-3 idle
KILLED N5  boşta saati findFirst DÖNÜNCE ölçülüyor          → Y-3 idle
KILLED N6  lock_timeout oturum düzeyi (sızar) [eski M2]     → T-3
KILLED N7  kilit anahtarı kiracı geneli [eski M5]           → T-4
KILLED N8  HEAD süre sınırsız [eski M8]                     → T-5 HEAD
KILLED N8b ranged GET süre sınırsız [eski M8]               → T-5 GET
KILLED N9  kopya çağıranın süresini yok sayıyor             → Y-3 idle
KILLED N10 kopya süresi tx kalanını saymıyor                → Y-3 tx
KILLED N11 tx süresi = kilit + kopya, pay yok [eski M12]    → Y-3 tx
KILLED N12 statement_timeout kilitten ÖNCE                  → kilit-bekleme (≥9 sn)
KILLED N13 kilit havuzu sınırsız (max 20)                   → B-1 + lock-pool
KILLED N14 withTenantLockPool uygulama havuzunu kullanıyor  → lock-pool
```

### Kapılar (`gates.txt`)
```
typecheck rc=0 · lint rc=0 · i18n rc=0 (✅ i18n check passed…) · build rc=0
CI=true npx vitest run (izole DB + MinIO):
 Test Files  297 passed | 2 skipped (299)
      Tests  3797 passed | 9 skipped (3806)
```
Merge sonrası kapılar §6'da.

## 3. Değişen dosyalar
- `src/lib/db.ts`: `createDbClient(url, poolOptions?)`, `DbPoolOptions`, `LOCK_POOL_*`, `withTenantLockPool`
- `src/lib/storage.ts`: `copyIncomingObject(…, deadlineMs?)`
- `src/app/[locale]/(app)/[workspace]/evidence/actions.ts`: confirm kilit havuzunda koşuyor; tx'e yerel süre sınırları ve `copyTimeLeft`
- `tests/evidence-confirm-store-faults.live.test.ts`: yeni 9 test ve düzenek
- `tests/lock-pool.live.test.ts`: yeni
- `tests/evidence-upload-s3.live.test.ts`, `tests/evidence-object-key.live.test.ts`, `tests/evidence-dev-store.live.test.ts`: mock'a `withTenantLockPool` eklendi
- `docs/agent-results/TASK-MUO9IFMMVRUDJ-fe-fb.md` ve `…-ekler/`

## 4. Riskler
- **Yavaş depo sırasında 4. ve sonraki eşzamanlı confirm 5 sn sonra `save_failed` alıyor** (süreç başına). Veri kaybı yok: staging korunuyor, yeniden deneme başarılı (ölçümde 7/7). Arayüz tek dosya confirm ediyor (`evidence-client.tsx`), bu yüzden normal yükte kuyruk hiç dolmuyor. Diğer kiracıların confirm'leri de bu 3 bağlantıyı paylaşıyor. Ancak depo zaten yavaşsa onların confirm'ü de beklerdi; bilinçli bir takas.
- **Postgres bağlantı bütçesi:** süreç başına en fazla 10 + 3 bağlantı. Prod'da `max_connections` ya da PgBouncer varsa bu hesaba katılmalı.
- **Geç kopya** (İNCELEME-92 "fe-fb Risk 2"): İptal edilen CopyObject'i depo sonradan tamamlarsa, kilit bırakıldıktan sonra final'e yine yalnız **kontrol edilmiş ETag'in baytları** inebilir (`CopySourceIfMatch`). Bu davranış değişmedi; kapsam dışı.
- **Kilit ancak Postgres dışı bir sebeple bağlantı koparsa** (DB yeniden başlaması, yönetici `pg_terminate_backend`) kopya sürerken bırakılabilir. Bu durum her tx-kilidi tasarımında var. `CopySourceIfMatch` yine yalnız kontrol edilmiş baytları geçiriyor.
- **İzleme önerisi** (inceleme §4'e ek): `pg_stat_activity` içinde `application_name='fonbridge-lock-pool'` ve `state='idle in transaction'` sayısının sürekli 3'te kalması depo yavaşlığının erken işaretidir. `timeout exceeded when trying to connect` logları artık yalnız kilit havuzundan gelmeli.

## 5. Açık sorular
- `LOCK_POOL_MAX = 3` ve kuyruk 5 sn şimdilik sabit. Prod'da süreç ve replika sayısına göre ortam değişkenine taşınmalı mı? Bence şimdilik gerekmiyor.
- İNCELEME-92 O-1'i (`INCOMING_KEY_SHAPE` sonundaki `$` için test, M10) bu kartta ele almadım; ayrı küçük kart olarak kalıyor.

## 6. Sonraki adım / merge
- **Merge öncesi birleşik ağaç** (dal + güncel dev `829dbf4b`, `f4471a84`): dev'in yeni commit'leri bu dosyalara dokunmuyor. Dev `prisma/schema.prisma`'da küçük bir değişiklik getirdi (+5/−3); izole DB'ye `db push` yapılmadı, süit yine de yeşil.
  ```
  tsc=0 · lint=0 · i18n=0 · build=0
  CI=true npx vitest run: Test Files 297 passed | 2 skipped (299) · Tests 3836 passed | 9 skipped (3845)
  ```
- dev'e `--no-ff` merge edildi, push yok.
- Temizlik: `fefb9i-pg` ve `fefb9i-minio` kapları ile worktree rapordan sonra kaldırıldı.
