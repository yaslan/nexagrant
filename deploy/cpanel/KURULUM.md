# FonBridge cPanel kurulum rehberi (Setup Node.js App)

**Paket:** `fonbridge-app-3d63de7b.zip` · **Kod:** `dev` @ `3d63de7b` (start-mode E2E 215/0) · **Hedef:** Linux x86_64, cPanel hesabı `/home/fonbridge`, LiteSpeed + Passenger
**Uygulama kökü:** `/home/fonbridge/fonbridge-app` (patron kararı 03.10.2026)
**Hazırlayan:** devop-fb, TASK-MUST2PP2NHP6L. Paketi hazırlayan taraf sunucuya hiçbir şey yüklemedi, canlı veritabanına dokunmadı, DNS ya da cPanel ayarı değiştirmedi. Yükleme ve onay patrondadır.

Bu rehberde iki işaret var:

- 🟥 **PATRON KARARI**: devam etmeden önce sizin karar vermeniz gerekir.
- 🟧 **PATRON ONAYI**: biz hazırlarız, ama sizin açık "evet"iniz olmadan koşulmaz.

---

## 0. Paketin içinde ne var

Zip, `fonbridge-app` klasörünün **içine** açılır. İçinde ayrı bir üst klasör yoktur.

```
fonbridge-app/
├── app.js            ← Startup file (cPanel'e bu ad yazılır)
├── package.json      ← bağımlılık listesi BOŞ (bilerek)
├── worker.sh         ← zamanlanmış işler için cron betiği (§8)
├── BUILD-INFO.txt    ← hangi commit, ne zaman, hangi platformda derlendi
├── certs/            ← Supabase CA sertifikası (açık sertifika, gizli değil)
└── app/              ← Next.js sunucusu: server.js, node_modules, .next, public, jobs-worker.cjs
```

- **"Run NPM Install" GEREKMEZ, basmayın.** Sunucunun bütün modülleri `app/node_modules` içinde, Linux x86_64 için derlenmiş olarak gelir. Kök `package.json`'da bağımlılık yoktur. Yanlışlıkla basılırsa bir şey bozulmaz, ama gereksizdir.
- Kökte bilerek `node_modules` klasörü **yoktur**. cPanel'in Node.js seçicisi bu adı kendi sanal ortamına bağlantı için kullanır. Klasör zaten varsa uygulamayı reddeder.
- Pakette `.env`, şifre ya da özel anahtar **yoktur** (taranıp kanıtlandı). Bütün değerleri siz cPanel ekranına girersiniz (`ENV-LISTESI.md`).
- İndirdiğiniz dosyanın bozulmadığını `SHA256SUMS` ile kontrol edin. Mac'te: `shasum -a 256 fonbridge-app-3d63de7b.zip`. Çıktı `SHA256SUMS` dosyasındaki satırla aynı olmalı.

## 1. Başlamadan önce: kararlar

| # | Konu | Neden önemli | İşaret |
|---|---|---|---|
| K-1 | **Zamanlanmış işler (worker)** nasıl çalışacak: cPanel Cron mu, başka makine mi? (§8) | Gece çağrı güncellemesi, e-posta özetleri, hesap silme ve veri saklama süresi temizliği bu işlere bağlı | 🟥 PATRON KARARI |
| K-2 | **Dosya yükleme deposu (R2)** açılacak mı? | Açılmazsa kullanıcılar kanıt dosyası yükleyemez. Site yine de açılır. | 🟥 PATRON KARARI |
| K-3 | **SMTP_USER** `info@` mi, ayrı `bildirim@` mi (S-1) | e-posta gönderimi | 🟥 PATRON KARARI |
| K-4 | **Canlı veritabanı şeması** (migration) ne zaman koşulacak (§2) | Web uygulaması şema olmadan açılmaz | 🟧 PATRON ONAYI |
| K-5 | **CORDIS aylık yenileme** (`WORKER_URL`) pilotta gerekli mi? | Gerekmiyorsa ayda bir alarm görürsünüz | 🟥 PATRON KARARI |
| K-6 | Sunucunun **Node.js sürümü** 22.18 ya da üstü mü? (§3) | Worker 22.18 ister. Web 20.9+ ile de çalışır. | kontrol |

Ayrıca hazır olması gerekenler: `nexagrant.com` DNS'i bu sunucuyu göstermeli (RELEASE_CHECKLIST madde 1.1), AutoSSL sertifikası çıkmış olmalı, OpenAI anahtarı yenilenmiş olmalı (madde 7).

## 2. Canlı veritabanı (Supabase) hazırlığı: 🟧 PATRON ONAYI

Web uygulaması açılmadan **önce** canlı veritabanında şema kurulu olmalıdır. Bu adım **cPanel'de yapılmaz**. Supabase sunucuya bağlı değildir ve şema araçları (psql, prisma, tsx) bu pakette yoktur. Adım bizim makinemizden, Linux konteynerinden koşulur (macOS'taki Prisma, Supabase sertifikasını reddediyor: P1011). Bu paketi hazırlarken bu adım **koşulmadı**.

Sıra `docs/RELEASE_CHECKLIST.md` §3.1'dedir. Kısaca, **sahip rolüyle** (`fabrika_app` ile değil):

1. **Yedek.** Supabase panelinden yedek alın ya da `pg_dump` koşulsun. Geri dönüşün tek güvenli yolu budur. (§4: repoda yedek betiği yok. 🟥 nasıl yedek alınacağı da bir karardır.)
2. **R-1 ön kontrolü** (TASK-MUOG51GJ3PUOG): `psql "$URL" -v ON_ERROR_STOP=1 -f scripts/golive/r1-topicmatch-check.sql`. Son satır `R1_SONUC | TEMIZ` ya da `DB_PUSH_ONCESI` ise devam edilir. `DUR_MUKERRER` ise durulur ve karar sizindir.
   - **`drop-evidence-reminder.sql` paketteyse, adım 3'ten ÖNCE `EvidenceReminder` satır sayısına bakın.** Şemada bu tablo artık yok; `prisma db push` tablo doluysa `There might be data loss … Use the --accept-data-loss flag` diyerek durur (exit 1, hiçbir şey değişmez), boşsa tabloyu kendisi siler. Yani dolu tabloda migration'daki koruma hiç devreye girmez; karar burada verilir. Kontrol (tablo `FORCE ROW LEVEL SECURITY` olduğu için sahip rol bile politikasız 0 görür; FORCE yalnız bu işlem içinde kapatılır ve geri alınır):
     `psql "$URL" -c 'BEGIN; ALTER TABLE "EvidenceReminder" NO FORCE ROW LEVEL SECURITY; SELECT count(*) FROM "EvidenceReminder"; ROLLBACK;'`
     Sonuç 0 ise ya da tablo yoksa adım 3'e geçilir. 0'dan büyükse durulur: satırlar kalıcı silinir (`.down.sql` yalnız boş tabloyu geri kurar). Silmeye onay verilirse, adım 3'ten önce yalnız bu dosya o oturum için koşulur: `PGOPTIONS='-c app.allow_evidence_reminder_drop=on' psql "$URL" -v ON_ERROR_STOP=1 -f prisma/migrations/drop-evidence-reminder.sql`. Dosya idempotenttir; adım 5 onu yeniden koşunca `already absent` der. 🟧 PATRON ONAYI
3. `pnpm exec prisma db push` (**`--accept-data-loss` verilmez**)
4. `pnpm db:rls-role` → `fabrika_app` rolü
5. `scripts/apply-migrations.sh` → son satır **`apply-migrations: N files applied as <sahip rol>`** olmalı. N sabit değildir: paketin commit'indeki `prisma/migrations/apply-order.txt` dosyasının yorum dışı satır sayısıdır (`grep -v '^\s*#' apply-order.txt | grep -c .`). Beklenen N, onay talebinde ve paketin notunda yazılır. Betik idempotenttir; ikinci koşu aynı N'yi verir. Bir dosya hata verirse betik orada durur; ondan önceki dosyalar uygulanmış kalır (hepsi idempotent, yeniden koşmak güvenlidir).
6. `pnpm db:rls`
7. `pnpm rls:verify --require-db`, `fabrika_app` URL'iyle → exit 0
8. **Supabase'e özel:** projede `ensure_rls` olay tetikleyicisi var (`public.rls_auto_enable()`). `public` şemasında yeni açılan **her** tabloda RLS'i açar. Kiracı tabloları için zararsızdır, çünkü `pnpm db:rls` zaten açar ve politikaları kurar. Kiracısız (SYSTEM_WIDE, `scripts/rls-models.ts`) yeni bir tablo için tablo açıldıktan sonra `ALTER TABLE "<Tablo>" DISABLE ROW LEVEL SECURITY;` koşulur. Koşulmazsa uygulama o tabloda 0 satır görür. Ölçüm: TASK-MUTP1R1C13GE3 (BlogPost).

Bu adımları biz (devop-fb) yaparız. Sizden istenen: **onay + sahip rolü URL'i** (güvenli kanaldan, sohbete değil) ve bir **zaman** (düşük trafik; ilk kurulumda boş DB olduğu için önemsiz). İlk kurulumda "eski worker" yoktur. RELEASE_CHECKLIST'teki 2a adımı yalnız "bu DB'ye bağlı başka worker yok" kontrolüdür.

## 3. cPanel'de uygulamayı oluşturma

1. cPanel → **Software** bölümü → **Setup Node.js App** → **CREATE APPLICATION**.
2. Alanları şöyle doldurun:

| Alan | Değer |
|---|---|
| **Node.js version** | listedeki en yüksek **22.x** (22.18 ya da üstü). 22 yoksa 20.x web için yeter, ama worker çalışmaz. Bize haber verin. |
| **Application mode** | `Production` |
| **Application root** | `fonbridge-app` (yani `/home/fonbridge/fonbridge-app`). **`public_html` DEĞİL.** |
| **Application URL** | `nexagrant.com`, yol kısmı **boş** |
| **Application startup file** | `app.js` |
| **Passenger log file** | `/home/fonbridge/logs/fonbridge-app.log` (sorun çıkınca ilk bakılacak yer) |

3. **CREATE**'e basın. cPanel klasörü açar, içine örnek bir `app.js` koyar ve uygulamayı başlatır. Örneği bir sonraki adımda bizimkiyle değiştireceğiz.
4. Sayfanın üstünde şuna benzer bir satır çıkar: `source /home/fonbridge/nodevenv/fonbridge-app/22/bin/activate && cd /home/fonbridge/fonbridge-app`. **Not alın.** Worker için gerekecek (§8).
5. **STOP APP**'e basın.

## 4. `public_html` içindeki eski dosyalar

LiteSpeed, `public_html` içinde gerçekten var olan bir dosyayı (ör. `index.html`) uygulamaya sormadan kendisi sunar. Eski bir `index.html` kalırsa ana sayfa yerine o görünür.

1. File Manager → `public_html` → içindekileri **yedekleyin**: hepsini seçin → **Compress** → `public_html-yedek-AAAAGG.zip`. Zip'i `public_html`'in dışına, `/home/fonbridge`'e taşıyın.
2. `public_html` içinde yalnız şunlar kalsın: **`.htaccess`** (cPanel'in yazdığı `PassengerAppRoot …` satırlarını taşır, **silmeyin**), **`.well-known/`** (SSL doğrulaması, **silmeyin**) ve `cgi-bin/` varsa o.
3. File Manager'da gizli dosyaları görmek için: sağ üst **Settings** → **Show Hidden Files (dotfiles)**.

## 5. Paketi yükleme ve açma

1. File Manager → `/home/fonbridge/fonbridge-app` klasörüne girin.
2. cPanel'in koyduğu örnek dosyaları silin: `app.js`, varsa `package.json`, `public/`, `tmp/`. (`node_modules` adlı bir **bağlantı** varsa ona dokunmayın. O cPanel'indir.)
3. **Upload** → `fonbridge-app-3d63de7b.zip` (~**41 MB**; açılınca ~135 MB, 4.095 dosya). Yükleme bitince geri dönün.
4. Zip'e sağ tık → **Extract** → hedef `/home/fonbridge/fonbridge-app` → **Extract File(s)**.
5. Klasörde artık `app.js`, `package.json`, `worker.sh`, `BUILD-INFO.txt`, `certs/`, `app/` görünmeli. `BUILD-INFO.txt`'yi açın: ilk satır `commit: 3d63de7b…` olmalı.
6. Zip'i silmeyin. `/home/fonbridge/surumler/` adında bir klasör açıp oraya taşıyın. **Geri alma için gerekir** (§9).
7. `worker.sh`'e sağ tık → **Change Permissions** → `755`.

## 6. Ortam değişkenleri

Setup Node.js App → `nexagrant.com` satırındaki kalem (edit) → **Environment variables** → her değişken için **ADD VARIABLE** → ad + değer → ✓. Bitince sayfanın üstündeki **SAVE**.

Hangi değişkenler, hangi biçimde: **`ENV-LISTESI.md`** §1 (zorunlu) ve §2 (işlevsel). En sık yapılan üç hata:

- `DATABASE_URL`'in sonundaki `?sslmode=verify-full&sslrootcert=/home/fonbridge/fonbridge-app/certs/supabase-prod-ca-2021.crt` kısmını unutmak. Unutulursa veritabanına bağlanmaz.
- `DEMO_LOGIN_ENABLED=true` girmek. Uygulama bu durumda **bilerek açılmaz**.
- `AUTH_SECRET` boş ya da 32 karakterden kısa olmak. Uygulama açılmaz.

## 7. Başlatma ve doğrulama

1. **START APP** (ya da **RESTART**). İlk açılış 10-30 saniye sürebilir.
2. Tarayıcıda ya da kendi bilgisayarınızın terminalinde:
   ```
   curl -I https://nexagrant.com/            → 307, location: /tr   (dil yönlendirmesi, doğru davranış)
   curl -IL https://nexagrant.com/           → son satır 200 (/tr)
   curl -I https://nexagrant.com/robots.txt  → 200
   curl -I https://nexagrant.com/tr/giris    → 200
   ```
   Bu adresler, aynı zip Linux x86_64 konteynerlerinde (Debian 12 ve CloudLinux 8 tabanıyla aynı glibc'ye sahip AlmaLinux 8) açılarak denendi. Sonuçlar yukarıdakiyle aynı çıktı (rapor: `docs/agent-results/TASK-MUST2PP2NHP6L-devop-fb.md`). Passenger'ın kendisi o testte yoktu. Onu ilk açılışınız ölçecek.
3. `/tr/giris` sayfasında yalnız **Google ile giriş** düğmesi görünmeli. E-posta kutusu ("demo giriş") görünmemeli.
4. Bir hesapla Google girişi yapın. Hesap oluşmalı ve panele geçmelisiniz.
5. Sorun varsa önce **Passenger log**'a bakın (`/home/fonbridge/logs/fonbridge-app.log`) ve §10'a geçin.

## 8. Zamanlanmış işler (worker): 🟥 PATRON KARARI (K-1)

Uygulamanın bir **web** parçası, bir de sürekli çalışan **worker** parçası vardır (graphile-worker, ADR-0008). Passenger yalnız web'i çalıştırır. Worker'ın çalıştırdığı işler (`src/lib/jobs/schedule.ts`, saatler UTC):

| İş | Ne zaman | Ne yapar |
|---|---|---|
| `k1-daily-calls`, `k1-embeddings`, `k1-topic-match` | her gün 02:00 / 02:15 / 02:30 | AB çağrılarını günceller, eşleştirir |
| `stripe-event-cleanup` | her gün 02:00 | (pilotta boş iş) |
| `users-scheduled-deletion` | her gün 03:00 | **silme isteyen hesapları siler (KVKK)** |
| `invitation-cleanup` | her gün 03:30 | süresi geçen davetler |
| `public-lead-cleanup` | her gün 03:45 | **ziyaretçi formlarını 12 ay sonra siler (KVKK)** |
| `alerts-sweep` | her gün 04:15 | uyarı temizliği |
| `m4-stale-relationships` | her gün 07:00 (İstanbul 10:00) | ilişki hatırlatma e-postası |
| `alerts-daily` | her gün 08:00 | günlük uyarı özeti |
| `job-queue-health` | her saat :05 | kuyruk sağlık kontrolü |
| `m4-weekly-summary`, `feedback-weekly-digest` | pazartesi 09:00 / 06:00 | haftalık özetler |
| `credits-monthly-grant`, `agency-monthly-report` | ayın 1'i 06:00 | aylık kredi, ajans raporu |
| `k2-monthly-cordis` | ayın 1'i 04:00 | CORDIS yenileme (`WORKER_URL` ister, K-5) |

Kaçan bir saat felaket değildir: worker açılınca kaçan işleri 6 saat (aylıklarda 1 gün) geriye kadar telafi eder.

**Seçenekler:**

- **A. cPanel Cron ile (pakette hazır, sunucuda denenmedi).** cPanel servis çalıştıramaz. Bu yüzden Cron her dakika `worker.sh`'i çağırır. Worker zaten çalışıyorsa betik hemen çıkar. Çalışmıyorsa (sunucu öldürdüyse) yenisini başlatır.
  - **Risk:** paylaşımlı sunucular (CloudLinux) uzun süren süreçleri ya da bellek aşımını öldürebilir. Bu sunucuda **ölçülmedi**. Kurduktan 10 dakika ve 1 gün sonra log'a bakarak anlaşılır (aşağıda). Ayrıca Vulut'a "cron'dan başlayan sürekli bir Node süreci kalabilir mi, bellek/süreç sınırı nedir?" diye sorulabilir.
- **B. Worker başka bir makinede.** Bir VPS ya da sürekli açık bir makinede Docker ile: `docker build --target worker .` (Dockerfile'da hazır). Aynı veritabanına bağlanır. En sağlam yol budur. Ek makine ister.
- **C. Şimdilik worker yok.** Site açılır, ama yukarıdaki işlerin hiçbiri koşmaz. **KVKK silme işleri (hesap silme, 12 ay sonra form silme) de koşmaz.** Bu yüzden yalnız birkaç günlük geçiş için kabul edilebilir.

**A seçilirse kurulum:**

1. File Manager → `/home/fonbridge` → **Show Hidden Files** açık → **+ File** → `.fonbridge-worker.env`. İçine `ENV-LISTESI.md` sonundaki iskeleti doldurun. **İlk satırlarda `JOBS_CRON_ENABLED=false`** olsun.
2. Dosyaya sağ tık → **Change Permissions** → `600` (yalnız sahibi okur).
3. cPanel → **Advanced** → **Cron Jobs** → **Add New Cron Job**:
   - Common Settings: **Once Per Minute (\* \* \* \* \*)**
   - Command: `/bin/bash /home/fonbridge/fonbridge-app/worker.sh >/dev/null 2>&1`
4. 2 dakika sonra File Manager → `/home/fonbridge/fonbridge-logs/worker.log`. Görülmesi gereken satır: `[jobs] worker up (pid …): k1-daily-calls, …` ve `JOBS_CRON_ENABLED=false` uyarısı. Hata varsa log'un son satırları ne olduğunu söyler.
5. `.fonbridge-worker.env` içinde `JOBS_CRON_ENABLED=true` yapın ve kaydedin. Çalışan worker yeni değeri kendiliğinden okumaz, yeniden başlatılması gerekir: Cron Jobs → **Add New Cron Job** → bir kerelik, 2 dakika sonrasının saat/dakikası → Command: `/bin/bash /home/fonbridge/fonbridge-app/worker.sh stop >/dev/null 2>&1`. (cPanel'de **Terminal** varsa aynı komutu orada koşmak da olur.) Worker elindeki işi bitirip kapanır. Her dakikalık satır onu yeniden başlatır. Log'da `stop requested` ve ardından yeni bir `worker up` görünmeli, `JOBS_CRON_ENABLED=false` uyarısı görünmemeli. Sonra bir kerelik satırı silin.
6. Ertesi gün (02:00 UTC'den sonra) uygulamanın **/tr/admin/alerts** sayfasında `job-queue` kaynaklı kırmızı uyarı olmamalı.

**Worker'ı durdurmak (A):** önce her dakikalık Cron satırını silin, sonra `worker.sh stop`'u bir kez koşun (bir kerelik Cron satırıyla ya da Terminal'de). Worker elindeki işi bitirip kapanır.

## 9. Güncelleme ve geri alma

**Sonraki sürüm (yeni zip geldiğinde):**

1. Yeni zip'i `SHA256SUMS` ile kontrol edin. Notunda migration varsa önce §2'yi yapın (🟧 onay).
2. Setup Node.js App → **STOP APP**. Worker A ile çalışıyorsa Cron satırını silin ve worker'ı durdurun.
3. File Manager → `/home/fonbridge/fonbridge-app` içinde `app/`, `certs/`, `app.js`, `package.json`, `worker.sh`, `BUILD-INFO.txt`'yi silin. `node_modules` bağlantısına ve `tmp/` klasörüne dokunmayın.
4. Yeni zip'i yükleyin ve §5'teki gibi açın. `worker.sh` → `755`.
5. **START APP**. §7'deki üç `curl` ile kontrol edin. Sonra worker Cron'unu geri ekleyin.

**Geri alma (yeni sürüm kötü çıkarsa):** aynı adımlar, ama 4. adımda `/home/fonbridge/surumler/` içindeki **bir önceki zip** açılır. Ortam değişkenleri cPanel'de kaldığı için yeniden girilmez.
- Yeni sürüm şema değişikliği getirdiyse, eski koda dönmek yetmeyebilir. Veritabanı geri dönüşü **yedekten** yapılır (RELEASE_CHECKLIST §3.2, §4). Bunu bize bırakın.
- **İlk kurulumdan geri dönmek:** **STOP APP**, sonra `public_html-yedek-….zip`'i `public_html`'e geri açın. Site eski haline döner. Sorun çözülene kadar cPanel'deki uygulamayı silmeyin, durdurun.

## 10. Sorun giderme

| Belirti | Bakılacak yer / olası neden |
|---|---|
| "Incomplete response" / 503 / uygulama hemen kapanıyor | Passenger log. `AUTH_SECRET is not set` / `too short` → §6. `DEMO_LOGIN_ENABLED` hatası → değişkeni silin ya da `false` yapın. |
| Sayfa açılıyor ama 500 | Passenger log'da `DatabaseNotReachable` / `self-signed certificate` / `ENOENT …crt` → `DATABASE_URL` sonundaki `sslrootcert` yolu yanlış ya da §2 yapılmamış. |
| Passenger log'da `connect ENETUNREACH 2a05:…` | `DATABASE_URL`'de `db.<proje-ref>.supabase.co` doğrudan adresi var. Bu adresin yalnız IPv6 kaydı var, sunucunun IPv6 çıkışı yok. Session pooler adresini kullanın: `aws-0-eu-west-1.pooler.supabase.com:5432`, kullanıcı `fabrika_app.<proje-ref>` (ENV-LISTESI.md §1). |
| Passenger log'da `ENOENT: no such file or directory, open '…/supabase-prod-ca-2021.crt '` (tırnaktan önce boşluk var) | cPanel'deki `DATABASE_URL` değerinin sonunda boşluk kalmış. Değeri açın, sondaki boşluğu silin, **SAVE**, **RESTART**. Sertifika dosyası pakette vardır, taşımayın. |
| Passenger log'da `P1000: Authentication failed … fabrika_app` | Pooler'da kullanıcı adı **`fabrika_app.<proje-ref>`** olmalı. Yalnız `fabrika_app` yazılırsa pooler hangi projeye gideceğini bilemez ve giriş reddedilir. Şifre, devop-fb'nin güvenli kanaldan verdiği `SUPABASE_APP_URL` içindeki şifredir. **Şifreyi sıfırlamayın.** Sıfırlama sorunu çözmez ve aynı şifreyi kullanan worker ile migration bağlantısını bozar. |
| `/tr/blog` açılıyor ama yazı yok; `/admin/blog`'da kaydetmek `row-level security policy` hatası veriyor | Supabase projesinde `ensure_rls` olay tetikleyicisi var. Yeni tablolarda RLS'i kendisi açar. `BlogPost` herkese açık içeriktir ve bilerek RLS'siz tasarlandı. RLS açılınca `fabrika_app` hiçbir satırı göremez. Düzeltme (sahip rolüyle, 🟧 onayla): `ALTER TABLE "BlogPost" DISABLE ROW LEVEL SECURITY;`, sonra blog içeriği yüklenir. Ayrıntı: `docs/agent-results/TASK-MUTP1R1C13GE3-devop-fb-2.md`. |
| Ana sayfa yerine eski site görünüyor | `public_html` içinde eski `index.html` kalmış (§4). |
| Ana sayfa açılıyor, ama CSS/JS yüklenmiyor | Zip yanlış yere açılmış. `/home/fonbridge/fonbridge-app/app/.next/static` var olmalı. |
| Google girişi "redirect_uri_mismatch" | Google Console'da yönlendirme adresi `https://nexagrant.com/api/auth/callback/google` olmalı. |
| Dosya yüklerken "dosya deposu yapılandırılmamış" | R2 değişkenleri yok (K-2). Beklenen davranış. |
| Passenger log'da `[app.js] restored link …` satırları | Sorun değil. Zip açılırken 5 kısayol (symlink) kaybolmuş, `app.js` onları yeniden kurdu. Bu yol test edildi. |
| "Run NPM Install" hata verdi | Basılması gerekmiyordu. Bir şey bozulmaz. |
| Worker log'u boş | Cron satırı yok ya da yanlış. `worker.sh` izni 755 değil. `.fonbridge-worker.env` yok. Log'da `no node binary` → Cron'a `FB_NODE=/home/fonbridge/nodevenv/fonbridge-app/22/bin/node /bin/bash …` yazın. |

Teknik ayrıntı: paket nasıl üretilir, yeniden üretmek için `deploy/cpanel/build-package.sh <commit> <klasör>` (Docker, linux/amd64).

Paket, gizlilik metni (/privacy) yayına hazır değilse **üretilmez** (FO-180): derleme `pnpm privacy:publish-check` ve `tests/privacy-notice.test.ts`'i paketlenen commit üzerinde koşar; yer tutucu ya da demo değer kaldıkça betik `privacy:publish-check — N blocker(s)` yazıp durur, zip çıkmaz. Çözüm metni doldurmaktır (hukuk + patron), kapıyı atlamak değil. Kapı yalnız `build-package.sh`'da; elle üretilen zip bu kapıdan geçmez.
