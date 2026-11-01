# TASK-MUO823LSVGKD — devop-fb — FB İNCELEME-92: kanıt confirm yarışı düzeltmesi (42032e20)

**Durum:** TAMAM
**Karar:** **ONAY (koşullu), Y-1 kapandı.** Ancak düzeltme yeni bir **kiracılar arası erişilebilirlik regresyonu** getiriyor (**B-1, ORTA**). Merge'ü geri almayı gerektirmiyor, ama canlıya çıkmadan önce ayrı bir kartla kapatılmalı. Ayrıca iki düşük bulgu (Y-2, Y-3) ve test boşlukları (T-3..T-5) var.

**İncelenen:** TASK-MUO64MVW8TLMX (fe-fb) `42032e20`. Denemeler dev `90c4bc8e` üzerinde, ayrı worktree'de yapıldı. Karşılaştırma için düzeltme öncesi `47c96594` (= `42032e20^`) ikinci bir worktree'de koşuldu.
**Ortam:** izole Postgres `devopfb92-pg` (127.0.0.1:55192, `pgvector/pgvector:pg16`) ve MinIO `devopfb92-minio` (127.0.0.1:59192, `bitnamilegacy/minio`). Kurulum CI sırasıyla yapıldı: `db push` → `db:rls-role` → `apply-migrations` ×2 (psql kabın içinde, sarmalayıcıyla) → `db:rls` → `db:seed`. Paylaşılan :5433'e yazılmadı. Kod değiştirilmedi. Saldırı suite'i repoya test olarak girmedi, yalnız ekte duruyor.

**Platform beyanı:** mac'te doğrulandı (Darwin 27, Node 26.5, vitest 4.1.11). Linux ve Windows'ta koşulamadı, çünkü bu makinede yalnız mac var. Koddan çıkarımlar:
- Kilit (`pg_advisory_xact_lock`), `lock_timeout` ve havuz davranışı Postgres/`pg.Pool` tarafında, platformdan bağımsız.
- SIGKILL/SIGSTOP denemesi POSIX sinyali. Windows'ta SIGSTOP karşılığı yok, ama asıl mesele "donmuş istemci / ağ bölünmesi" ve bu her platformda aynı: Postgres, bağlantının öldüğünü TCP keepalive ile anlayana kadar kilidi tutar.
- Prod Dockerfile ile uzun ömürlü bir Node süreci olarak çalışıyor. Havuz süreç başına `pg.Pool` varsayılanı olan **10 bağlantı** (`src/lib/db.ts`, `max` verilmemiş, `connectionTimeoutMillis: 1000`).

## 1. Ne yapıldı

Kendi saldırı suite'imi yazdım (`…-ekler/zz-devopfb92-attack.live.test.ts.txt`). fe-fb'nin fault suite'indeki proxy'yi temel aldım ve ikinci kiracı, AsyncLocalStorage ile oturum, geç kopya iletimi, `findFirst` gecikmesi ve kopya günlüğü ekledim. Bu suite'i düzeltme sonrası koda karşı canlı koştum. Havuz ve kapsam testlerini düzeltme öncesi koda karşı da koştum. Ardından 12 mutant denedim: önce 10 evidence suite'ine karşı, sonra hayatta kalanları kendi suite'ime karşı. Son olarak tam kapıları koştum.

### Bulgular

#### B-1 — ORTA (canlıya çıkmadan kapatılmalı): yavaş depo tüm kiracıların DB erişimini düşürüyor
Confirm artık depo çağrılarının (HEAD, ranged GET, CopyObject, HEAD) tamamında bir havuz bağlantısını tx içinde tutuyor. Bu süre 15 sn'ye kadar çıkabiliyor; kilit bekleyenlerde buna 10 sn daha ekleniyor. Havuz süreç başına 10 bağlantı. Dolayısıyla depo yavaşladığında 10 eşzamanlı confirm havuzun tamamını tutuyor. Bu sırada **başka bir kiracının sıradan sorgusu** `connectionTimeoutMillis` (1 sn) içinde bağlantı alamıyor ve hata veriyor. Düzeltme öncesinde depo çağrıları tx dışındaydı, bu yüzden aynı senaryo diğer kiracıları etkilemiyordu.

Canlı kanıt (`attack1.txt` ile `attack-pre.txt`). Aynı test iki koda karşı koştu: A kiracısı 10 confirm yapıyor, her kopya 12 sn tutuluyor; B kiracısı bu sırada `withTenant(B, evidence.count())` çağırıyor.
```
42032e20 sonrası: POOL: confirms=ok×10 | B-probes: FAIL 1001ms timeout exceeded when trying to connect | FAIL 1001ms … | FAIL 1001ms …
47c96594 öncesi : POOL: confirms=ok×10 | B-probes: ok 81ms | ok 5ms | ok 13ms
```
- **Tetikleyici:** R2'nin yavaşlaması ya da takılması (depo kesintisi) veya aynı anda gelen ≥10 yavaş confirm. Tek bir kiracının kullanıcısı da bunu büyütebilir: confirm'de hız sınırı yok ve aynı anahtara gönderilen confirm'ler kilit beklerken de bağlantı tutuyor.
- **Etki alanı:** Yalnız confirm değil, o süreçteki **her** DB çağrısı etkileniyor: sayfalar, API, cron. Böylece depo arızası tüm uygulamanın arızasına dönüşüyor.
- **fe-fb raporu** bu riski "Bağlantı tutma" başlığıyla anmış, ama "confirm seyrek" diye düşük görmüş. Ölçüm, etkinin kısmi değil **tam** olduğunu gösteriyor.
- **Öneri** (en küçükten büyüğe):
  - (a) Süreç başına confirm eşzamanlılık sınırı. Örneğin en fazla 3 confirm aynı anda tx'e girsin, fazlası beklemeden `storage_unavailable` ya da `save_failed` alsın. Tek dosya, küçük değişiklik.
  - (b) Kilidi ayrı ve küçük bir `pg.Pool` üzerinde tutmak, uygulama havuzunu paylaşmamak.
  - (c) Uzun vadede crw-fb'nin (a) seçeneği: kısa tx'lerde rezervasyon satırı, depo çağrıları tx dışında.
- **Regresyon testi:** ekteki "havuz" testi. Beklenen: B'nin sorgusu başarılı olmalı.

#### Y-2 — DÜŞÜK: donmuş istemci kilidi süresiz tutuyor (`idle_in_transaction_session_timeout = 0`)
Canlı kanıt: kilidi tutan ayrı bir Node süreci önce SIGSTOP, sonra SIGKILL ile durduruldu.
```
SIGSTOP: confirm={"success":false,"error":"save_failed"} in 10010 ms; holder backend state=idle in transaction for 12s; advisory granted=1; idle_in_transaction_session_timeout=0
SIGKILL: advisory lock released after 54 ms
after SIGKILL retry: success
```
- **Süreç ölünce kilit hemen bırakılıyor** (54 ms). Kilit türü doğru seçilmiş: xact kilidi, oturum kilidi değil.
- **Süreç donarsa ya da ağ bölünürse** kilit, Postgres TCP keepalive ile bağlantının öldüğünü anlayana kadar tutuluyor. Linux varsayılanıyla bu 2 saati aşabilir. O süre boyunca aynı yükleme her denemede 10 sn bekleyip `save_failed` alıyor. Etki yalnız o tek yüklemede (anahtar yüklemeye özgü) ve veri kaybı yok: staging korunuyor.
- **Öneri:** confirm tx'inde `SET LOCAL idle_in_transaction_session_timeout = '60s'`, ya da `fabrika_app` rolüne `ALTER ROLE … SET idle_in_transaction_session_timeout`.

#### Y-3 — DÜŞÜK: kilidin "kopya bitmeden bırakılmaz" varsayımı DB gecikmesine bağlı
- `CONFIRM_TX_TIMEOUT_MS = 40 sn` hesabı yalnız kilit beklemesini (10 sn) ve kopyayı (15 sn) sayıyor. Kilit alındıktan sonraki DB çağrılarının (`findFirst`, `create`) bir süre sınırı yok (`statement_timeout` yok).
- Canlı kanıt: `findFirst`'e 27 sn gecikme eklendi, kopya 14 sn tutuldu.
  ```
  TXTIME: A=save_failed took=41038ms rows=0 finalExists=true stagingKept=true
  ```
  Prisma 40. saniyede tx'i geri aldı ve kilidi bıraktı; kopya ise 41. saniyede final anahtara indi. Veri kaybı yok. Ama bu pencerede bir sonraki confirm kilidi alabiliyor, yani Y-1 penceresi teorik olarak geri açılıyor.
- **Öneri:** `SET LOCAL statement_timeout = '5s'`, ya da AbortSignal süresinin tx'in kalan süresinden türetilmesi.

#### Geç kopya (fe-fb Risk 2) — DÜŞÜK, fe-fb'nin anlattığından **daha dar**
Proxy'yi, istemci vazgeçtikten sonra da CopyObject'i depoya ileten biçimde ayarladım. Bu, "depo iptal edilen isteği sonra tamamlar" durumunu modelliyor (`attack-late.txt`).
```
LATE(a): staging v2'ye döndü, C v2'yi kaydetti → geç kopya 404 (C staging'i sildi) → final==v2 (kayıtlı) ✓
LATE(b): C success'ten sonra saldırgan A'nın baytlarını (v1) aynı imzalı PUT ile geri yükledi → geç kopya 200 → final==v1, final==kayıtlı(w2) false
```
- `CopySourceIfMatch` sayesinde final anahtara yalnız **A'nın zaten kontrol ettiği baytlar** (aynı ETag) inebiliyor, başka hiçbir şey inemiyor.
- Bunun için üç koşul birlikte gerekiyor: deponun 15 sn'yi aşması, iptal edilen isteği yine de tamamlaması ve saldırganın aynı baytları tam o anda geri yüklemesi.
- Satırın boyutu kontrol edilmiş içerikle tutarsız olabilir, ama boyut da aynı olmak zorunda (aynı uzunlukta dosya). Kontrolsüz bir tür ya da içerik giremiyor. Bloke etmez.

### Doğrulanan (sorun yok)
- **RACE-1/2 ve RACE-N canlı.** 3 tur; her turda 6 eşzamanlı confirm ve araya 6 farklı içerikli PUT:
  ```
  RACE-N r0: storage_unavailable×2,success,already_confirmed×3 rows=1 copies=3 lateCopiesAfterSuccess=0 finalUnchanged=true size==row=true
  RACE-N r1: storage_unavailable×3,success,already_confirmed×2 rows=1 copies=4 lateCopiesAfterSuccess=0 finalUnchanged=true size==row=true
  RACE-N r2: storage_unavailable×3,success,already_confirmed×2 rows=1 copies=4 lateCopiesAfterSuccess=0 finalUnchanged=true size==row=true
  ```
  `success` dönen confirm'den sonra final nesneye hiç kopya inmedi. `storage_unavailable` olanlar, staging kontrol ile kopya arasında değiştiği için `CopySourceIfMatch` 412'si aldı; bu beklenen davranış.
- **Kilit kapsamı:** B kiracısının confirm'ü, A'nın 8 sn tutulan kopyası sırasında 25 ms'de tamamlandı. Kilit anahtar başına, kiracıyı bekletmiyor (havuz dışında; bkz. B-1).
- **Deadlock:** 5 anahtar üzerinde 30 eşzamanlı confirm → `{"success":5,"already_confirmed":25}`, anahtar başına 1 satır, `pg_stat_database.deadlocks 0→0`. Kilit sırası "advisory → satır" ve advisory kilidi başka hiçbir yol almıyor, bu yüzden döngü oluşamıyor.
- **`lock_timeout` sızmıyor:** Confirm'lerden sonra havuzdaki 12 bağlantının hepsinde `lock_timeout=0`. `set_config(…, true)` tx'e yerel.
- **Kilit anahtarı:** `sha256("evidence-confirm:"+finalKey)` ilk 8 bayt. finalKey kiracı önekli, diğer advisory kullanıcılarıyla (iyzico, k3 import, lead) çakışma olasılığı ~2⁻⁶⁴.
- **T-1:** iki red girdisi desende `^` yoksa kırmızı oluyor (fe-fb K7). İç içe `incoming` kontrolü kaldırılınca 3 test kırmızı (benim M11).
- **T-2:** ön-kontrol DB hatası ve dev deposu create hatası testleri fe-fb'nin K5/K6 mutantlarını öldürüyor. Tam suite'te yeşil.

## 2. Kanıt

**Mutantlar** (`mutants92.txt`), 10 evidence suite'ine (120 test) karşı: **7/12 KILLED.** Hayatta kalanlar sonra kendi suite'ime karşı koşuldu (`mutants92-attack.txt`).
```
KILLED   M1  kilit findFirst'ten SONRA               → RACE-2, 5x
SURVIVED M2  lock_timeout oturum düzeyi (sızar)       → benim "lock_timeout sızmaz" testim KILLED  → T-3
KILLED   M3  oturum kilidi pg_advisory_lock           → 5x (10 sn)
KILLED   M4  pg_try_advisory_xact_lock (beklemez)     → RACE-2, kilit-bekleme, 5x
SURVIVED M5  kilit anahtarı kiracı geneli             → benim süreç testim KILLED (dolaylı)          → T-4
KILLED   M6  lock satırında await yok                 → RACE-2, kilit-bekleme, 5x
KILLED   M7  süre sınırı çağrı başına (toplam 60 sn)  → kopya süre sınırı
SURVIVED M8  HEAD/GET süre sınırsız (yalnız kopya)    → benim suite'im de SURVIVED                   → T-5
SURVIVED M9  P2002 dalında staging silinmez           → kilit varken ulaşılamaz dal (ekvivalan sayılabilir)
SURVIVED M10 desende $ yok                            → T-1 kapsamı dışı, önceden var olan (O-1)
KILLED   M11 iç-içe incoming kontrolü yok             → evidence-incoming-key ×2, mock-upload-gate
SURVIVED M12 tx süresi = kilit + kopya (pay yok)      → benim suite'im de SURVIVED (Y-3 ile ilgili)
restored: git status src clean   (her mutanttan sonra doğrulandı)
```

**Saldırı suite'i** (`attack1.txt`, düzeltme sonrası): `Tests 7 passed (7)`. Satırlar yukarıda.

**Kapılar** (`gates92.txt`):
```
typecheck rc=0 · lint rc=0 · i18n rc=0 (✅ i18n check passed: both catalogs agree…) · build rc=0
CI=true npx vitest run (izole DB + MinIO env, AUTH_SECRET test değeri):
 Test Files  294 passed | 2 skipped (296)
      Tests  3696 passed | 9 skipped (3705)
vitest rc=0
```

## 3. Değişen dosyalar
Kod değişmedi. Yalnız şunlar eklendi:
- `docs/agent-results/TASK-MUO823LSVGKD-devop-fb.md`
- `docs/agent-results/TASK-MUO823LSVGKD-devop-fb-ekler/`: `zz-devopfb92-attack.live.test.ts.txt`, `attack1.txt`, `attack-pre.txt`, `attack-late.txt`, `mutants92.txt`, `mutants92-attack.txt`, `mut92.py`, `gates92.txt`

## 4. Riskler
- **B-1:** prod'da R2 yavaşladığında uygulamanın tamamı DB bağlantısı alamaz hale gelebilir. İzleme notu: `pg_stat_activity` içinde `state='idle in transaction'` sayısı ve pg havuzundaki "timeout exceeded when trying to connect" logları için bir uyarı kuralı konmalı.
- **Y-2 / Y-3:** düşük; veri kaybı yok.

## 5. Açık sorular
- B-1 için hangi yol: (a) eşzamanlılık sınırı mı, (b) ayrı kilit havuzu mu? Ben hızlı kapatmak için (a)'yı öneriyorum. Karar liderin.
- Prod'da `DATABASE_URL`'de `connection_limit` ya da PgBouncer var mı? Varsa B-1'in eşiği farklı olur, ama davranış aynı kalır.

## 6. Sonraki adım
- **fe-fb için kart (B-1 + testler):**
  - Confirm eşzamanlılık sınırı ya da ayrı kilit havuzu.
  - Ekteki "havuz" testi regresyon testi olarak (B'nin sorgusu başarılı olmalı).
  - T-3: `lock_timeout` sızma testi.
  - T-4: aynı kiracıda iki farklı anahtar birbirini beklemiyor.
  - T-5: HEAD ve GET çağrılarında süre sınırı testi.
  - Y-2 ve Y-3 için `SET LOCAL idle_in_transaction_session_timeout` ve `statement_timeout`.
- **O-1:** `INCOMING_KEY_SHAPE` sonundaki `$`'ı koruyan bir test yok (M10). Ayrı küçük bir kart.
- **Temizlik:** `devopfb92-pg` ve `devopfb92-minio` kapları ile iki worktree rapordan sonra kaldırıldı.
