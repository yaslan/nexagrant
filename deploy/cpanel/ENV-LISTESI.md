# FonBridge: cPanel ortam değişkenleri listesi

Paket: `fonbridge-app-3d63de7b.zip` (dev @ 3d63de7b) · Uygulama kökü: `/home/fonbridge/fonbridge-app`
Kaynaklar: `docs/RELEASE_CHECKLIST.md` §2, `src/lib/env.ts`, `.env.example`. Hazırlayan: devop-fb, TASK-MUST2PP2NHP6L.

> **Bu dosyada değer yok, yalnız değişken adları var.** Değerleri (şifre, anahtar, bağlantı adresi) yalnız cPanel ekranına yazın. Bu dosyaya, sohbete ya da e-postaya yazmayın.

## Değişkenler iki yere girilir

| Nereye | Kim okur | Nasıl girilir |
|---|---|---|
| **A. cPanel → Setup Node.js App → (uygulama) → Environment variables** → `ADD VARIABLE` → `SAVE` → `RESTART` | web uygulaması (Passenger) | ekranda, tek tek |
| **B. `/home/fonbridge/.fonbridge-worker.env`** (izin **600**, uygulama kökünün DIŞINDA) | zamanlanmış işler (worker, cPanel Cron) | File Manager → Settings → "Show Hidden Files" → `+ File` → satır başına `AD=değer` |

cPanel Cron, A'daki değişkenleri **görmez**. Worker çalışacaksa B dosyası ayrıca gerekir (KURULUM.md §7).
Sütun "W" = B dosyasına da yazılacak değişkenler.

Biçim örneklerinde `<...>` yazan yerler sizin değerinizdir. Örnekler gerçek değer değildir.

---

## 1. Zorunlu: boşsa uygulama başlamaz ya da çekirdek işlev çalışmaz

| Değişken | W | Örnek biçim (değer değil) | Açıklama |
|---|---|---|---|
| `NODE_ENV` | ✓ | `production` | `app.js` ve `worker.sh` bunu zaten ayarlar. Yine de girin. "Application mode = Production" da aynı işi görür. |
| `DATABASE_URL` | ✓ | `postgresql://fabrika_app.<proje-ref>:<şifre>@aws-0-eu-west-1.pooler.supabase.com:5432/postgres?sslmode=verify-full&sslrootcert=/home/fonbridge/fonbridge-app/certs/supabase-prod-ca-2021.crt` | **Web için rol `fabrika_app` olmalı** (BYPASSRLS yok). Sahip rolünü ya da `postgres`'i kullanmayın. Sondaki `sslmode=verify-full&sslrootcert=...` kısmı **aynen** yazılır; CA dosyası pakettedir (`certs/`). `sslmode=require` tek başına kullanılmaz (bağlanmaz). `rejectUnauthorized`/`uselibpqcompat` eklenmez. |
| `AUTH_URL` | | `https://nexagrant.com` | **Zorunlu.** Sitenin dışarıdan görünen adresi. Sonunda `/` olmaz. Passenger, isteğin `Host` bilgisini `localhost:3000` yapar. Bu değişken yoksa Auth.js girişten sonra `https://localhost:3000/...` adresine yönlendirir ve oturum açılmaz. Davet ve hata yönlendirmeleri de bu değeri kullanır (`src/lib/public-url.ts`, PR #29). TASK-MUTP1R1C13GE3. |
| `AUTH_SECRET` | | 44 karakterlik rastgele dize (`openssl rand -base64 32` çıktısı) | Oturum imza anahtarı. En az 32 karakter. Eksik, kısa ya da eski (git geçmişinde yayımlanmış) anahtar → **uygulama başlamaz** (`src/instrumentation.ts`). Bir kez üretin, değiştirirseniz herkesin oturumu düşer. |
| `NEXT_PUBLIC_APP_URL` | ✓ | `https://nexagrant.com` | Sonunda `/` olmaz. Yanlışsa davet ve e-posta bağlantıları bozulur. Uygulama açılır, log'a uyarı düşer. Paket bu değerle derlendi. |
| `AUTH_GOOGLE_ID` | | `<istemci-no>.apps.googleusercontent.com` | Google ile giriş. **Yeni `fonbridges` GCP istemcisi.** Google Console'da izinli yönlendirme adresi: `https://nexagrant.com/api/auth/callback/google` |
| `AUTH_GOOGLE_SECRET` | | `GOCSPX-<...>` | Aynı istemcinin gizli anahtarı. |
| `DEMO_LOGIN_ENABLED` | ✓ | **boş bırakın** ya da `false` | `true` girilirse uygulama **başlamaz** (bilinçli kilit; test edildi). Şifresiz demo girişi canlıda kapalıdır. |
| `SMTP_HOST` | ✓ | `mail.nexagrant.com` | Boşsa hiç e-posta gitmez, panelde `SystemAlert` görünür. |
| `SMTP_PORT` | ✓ | `465` | |
| `SMTP_SECURE` | ✓ | `true` | |
| `SMTP_USER` | ✓ | `info@nexagrant.com` | **PATRON KARARI S-1:** `info@` mi, ayrı `bildirim@` mi (`docs/SMTP-SUNUCU.md` §8 madde 4). |
| `SMTP_PASS` | ✓ | `<kutunun şifresi>` | cPanel → Email Accounts'taki kutunun şifresi. |
| `SMTP_FROM` | ✓ | `FonBridge <info@nexagrant.com>` | |
| `ANTHROPIC_API_KEY` | ✓ | `sk-ant-<...>` | Yapay zekâ özellikleri. |
| `OPENAI_API_KEY` | ✓ | `sk-<...>` | Embedding (`text-embedding-3-large`). **Sohbette açığa çıkan anahtarı kullanmayın.** Yenisini üretin, eskisini iptal edin, OpenAI panelinde aylık harcama limiti koyun (RELEASE_CHECKLIST madde 7). |

## 2. İşlevsel: boşsa site açılır ama ilgili özellik kapalı kalır

| Değişken | W | Örnek biçim | Boşsa ne olur |
|---|---|---|---|
| `R2_ACCOUNT_ID` | ✓ | `<32 hane hex>` | **Dosya yükleme KAPALI olur.** Kullanıcı "dosya deposu yapılandırılmamış" mesajını görür, log'a hata düşer. Dosya sessizce kaybolmaz. **PATRON KARARI:** R2 hesabı açılacak mı (RELEASE_CHECKLIST madde 8). |
| `R2_ACCESS_KEY_ID` | ✓ | `<...>` | R2_ACCOUNT_ID ile birlikte. |
| `R2_SECRET_ACCESS_KEY` | ✓ | `<...>` | R2_ACCOUNT_ID ile birlikte. |
| `R2_BUCKET` | ✓ | `fonbridge-evidence` | Boşsa kod `fonbridge-evidence` kullanır. `.env.example`'daki `fabrika` eskidir, kullanmayın. |
| `R2_PUBLIC_BUCKET` | | `fonbridge-public` | **Blog kapak görseli yüklenemez** (form "dosya deposu yapılandırılmamış" der, 503). Herkese açık okunan **ayrı** bir bucket olmalı; `R2_BUCKET` ile aynı ad verilirse kod onu reddeder (kanıt bucket'ı gizli kalır). TASK-MVCH99A54WALG. |
| `R2_PUBLIC_HOST` | | `https://files.nexagrant.com` ya da `https://pub-<id>.r2.dev` | `R2_PUBLIC_BUCKET`'ın herkese açık adresi, `https://` ile, sonda `/` yok. Boşsa blog görseli yüklenemez. **Paket bu değerle DERLENİR** (`R2_PUBLIC_HOST=… deploy/cpanel/build-package.sh …`): cPanel'deki değer derlemedekinden farklıysa yükleme çalışır ama görsel sitede **görünmez** (`/_next/image` 400). Değişirse paket yeniden derlenir. Hangi değerle derlendiği `BUILD-INFO.txt` → `images.remotePatterns` satırında. |
| `R2_ENDPOINT` | ✓ | boş | Yalnız R2 dışında S3 uyumlu bir depo kullanılırsa doldurulur. Boşsa R2 adresi otomatik kurulur. |
| `R2_REGION` | | `auto` | `src/lib/storage.ts` okur; boşsa `auto`. R2 bölgeyi yok sayar; yalnız R2 dışı S3 uyumlu depo (ör. Supabase Storage) kendi bölgesini ister. Cloudflare R2 için boş bırakın. |
| `JOBS_CRON_ENABLED` | **yalnız W** | `false`, sonra `true` | **Yalnız worker dosyasına yazılır, web ekranına değil.** Boşsa üretim worker'ı başlamaz. Açılış sırası KURULUM.md §7'de. |
| `JOBS_DATABASE_URL` | yalnız W | boş = `DATABASE_URL` | Worker ilk açılışta `graphile_worker` şemasını kurar. Bu yüzden bu rolün DB'de şema oluşturma yetkisi olmalı. `fabrika_app`'te bu yetki yoksa ayrı bir rol gerekir (ADR-0008 §6.6; canlı DB'de **ölçülmedi**). |
| `JOBS_CONCURRENCY` | yalnız W | `2` | Bir worker'ın aynı anda koştuğu iş sayısı. Paylaşımlı sunucuda `1` daha güvenlidir. |
| `WORKER_URL`, `WORKER_TOKEN` | W | boş | Ayda bir koşan `k2-monthly-cordis` işi Python CORDIS servisine gider. Servis yoksa iş düşer ve alarm verir. **PATRON KARARI:** pilotta gerekli mi? |
| `FEEDBACK_DIGEST_TO` | W | `info@nexagrant.com` | Haftalık geri bildirim özeti hesaplanır ama gönderilmez. |
| `BETA_SUPPORT_EMAIL`, `BETA_FEEDBACK_EMAIL` | ✓ | boş (varsayılan `info@nexagrant.com`) | |
| `BETA_MEETING_URL` | ✓ | `https://meet.google.com/<...>` | Beta davetindeki toplantı bağlantısı. |
| `CALENDAR_ENCRYPTION_KEY` | ✓ | `openssl rand -base64 32` | Takvim bağlantısı özelliği. **Boş değer YAZMAYIN.** Kullanılmayacaksa değişkeni hiç eklemeyin. Değiştirilirse kullanıcılar takvimi yeniden bağlar. |
| `TRUSTED_PROXY_HOPS` | | `1` | Önünüzdeki ters vekil sayısı. Ölçüm (17.10.2026, `curl -sI https://nexagrant.com`): `77.92.144.187` önünde tek LiteSpeed, CDN başlığı yok → **`1`**. Ziyaretçi formunun IP sınırı buna göre çalışır. Bir fazla ya da eksik olursa sınır sahte başlıkla aşılır. |
| `NEXT_PUBLIC_POSTHOG_KEY`, `NEXT_PUBLIC_POSTHOG_HOST` | | boş | Analitik kapalı (zararsız). **Not:** tarayıcı tarafı bu anahtarı **derleme anında** okur. Bu paket anahtarsız derlendi. cPanel'e girmek analitiği açmaz; açmak için yeniden derleme gerekir. |
| `CSP_MODE` | | boş | Boş = içerik güvenlik politikası uygulanır. `report-only` yalnız sorun ararken kullanılır. |
| `K1_EMBEDDING_MAX_USD_PER_RUN` | W | `0.05` | Gece embedding işinin koşu başına dolar tavanı. |
| `ALERTS_SWEEP_FAILURE_THRESHOLD` | W | boş | Varsayılan yeterli. |

## 3. Pilotta BOŞ kalmalı (ADR-0007, ücretsiz pilot)

Hiçbirini eklemeyin: `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `STRIPE_PUBLISHABLE_KEY`, `IYZICO_API_KEY`, `IYZICO_SECRET_KEY`, `IYZICO_BASE_URL`, `BILLING_ACTIVE_TIER`, `EFATURA_INTEGRATOR_*`, `INVOICE_SUPPLIER_*`, `TCMB_BASE_URL`.

## 4. Eklemeyin (kodda okunmuyor ya da eski ad)

`AI_PROVIDER`, `APIFY_TOKEN`, `CORDIS_*_ZIP_URL`, `DATABASE_URL_MIGRATE`, `DEFAULT_LOCALE`, `EMBEDDING_*`, `SEDIA_*`, `UPSTASH_*`, `REDIS_URL`. Bunlar hiçbir şeyi değiştirmez.
`NEXTAUTH_SECRET`, `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` eski adlardır. Yalnız `AUTH_*` adlarını kullanın.
`PORT`, `HOSTNAME`: girmeyin. Passenger kendi soketini kullanır. `app.js` gerisini ayarlar.

## 5. Migration (şema) için ayrı URL: uygulamaya GİRİLMEZ

Şema kurulumu **sahip rolüyle** yapılır (`postgres` değil, tabloların sahibi). O URL ne cPanel'e ne de worker dosyasına yazılır. Yalnız migration koşusunda, o anda kullanılır (KURULUM.md §8).

## Worker dosyası örnek iskeleti (`/home/fonbridge/.fonbridge-worker.env`, izin 600)

```
NODE_ENV=production
DATABASE_URL=<web ile aynı fabrika_app URL'i, sslmode=verify-full&sslrootcert=/home/fonbridge/fonbridge-app/certs/supabase-prod-ca-2021.crt>
JOBS_CRON_ENABLED=false
JOBS_CONCURRENCY=1
NEXT_PUBLIC_APP_URL=https://nexagrant.com
SMTP_HOST=mail.nexagrant.com
SMTP_PORT=465
SMTP_SECURE=true
SMTP_USER=<...>
SMTP_PASS=<...>
SMTP_FROM=FonBridge <info@nexagrant.com>
ANTHROPIC_API_KEY=<...>
OPENAI_API_KEY=<...>
FEEDBACK_DIGEST_TO=<...>
# R2_* (varsa), WORKER_URL/WORKER_TOKEN (varsa), CALENDAR_ENCRYPTION_KEY (varsa)
```

Değerde boşluk ya da `#` varsa çift tırnak içine alın: `SMTP_FROM="FonBridge <info@nexagrant.com>"`.

**Değerin sonunda boşluk bırakmayın.** cPanel ekranı sondaki boşluğu silmez. `DATABASE_URL`'in sonunda boşluk kalırsa sertifika yolu `…crt ` olur ve uygulama `ENOENT` verir (KURULUM.md §10).
