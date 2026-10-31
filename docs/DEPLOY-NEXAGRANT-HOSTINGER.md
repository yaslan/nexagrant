# NexaGrant → nexagrant.com (Hostinger): dağıtım hazırlığı

Kart: FO-275 (TASK-MVWT5NUHYLW5A) · Hazırlayan: se-fb · Tarih: 2026-10-31 · Kaynak: patron talimatı "sunucu Node.js destekliyor, adı NexaGrant yap, nexagrant.com'da dağıtılacak şekilde hazırla".

**Bu belge hiçbir şey dağıtmaz.** Hostinger'a yalnız salt-okunur sorgu yapıldı (alan adı, DNS, hosting siparişi, VPS listesi, abonelikler). Yükleme, DNS ve veritabanı değişikliği yok; her biri patron onayı ister.

## 1. Ölçülen durum (Hostinger, 31.10.2026)

| Kalem | Değer | Kaynak |
|---|---|---|
| Alan adı | `nexagrant.com`, aktif, 29.10.2027'ye kadar | Hostinger domain listesi |
| Hosting planı | `cloud_economy_v7`, sipariş 1010267304, aktif | Hostinger hosting siparişleri |
| Site kaydı | `nexagrant.com`, addon vhost, etkin, kök `/home/u605628300/domains/nexagrant.com/public_html`, algılanan tür `other` | Hostinger hosting siteleri |
| VPS | yok | Hostinger VPS listesi |
| DNS `@`, `www` | Hostinger CDN'ine (`*.cdn.hstgr.net`) gidiyor | DNS bölgesi |
| Posta | MX/SPF/DKIM Hostinger mail'e kurulu; DMARC `p=none` | DNS bölgesi |
| Node.js desteği | patron beyanı ("sunucu Node.js destekliyor"). **Sürüm ve çalıştırma modeli doğrulanmadı.** | patron |

## 2. Koddan yana durum

- Ürün adı tek yerden okunur: `src/lib/brand.ts` → `PRODUCT_NAME = 'NexaGrant'` (commit `c433d3e3`).
- Alan adı koda zaten taşınmıştı (FO-233, `071cc341`): `AUTH_URL`, `NEXT_PUBLIC_APP_URL`, `SMTP_*` örnekleri `nexagrant.com`.
- Üretim paketi hazır araçla çıkar: `deploy/cpanel/build-package.sh` (Next `output: 'standalone'`, Linux x86_64, Docker gerekir) + Passenger uyumlu `app.js` + worker için `worker.sh`.
- **Bilerek adı değişmeyenler** (değişirse veri/oturum bozulur): cookie ve localStorage anahtarları, HMAC anahtar etiketleri, R2 kovası `fonbridge-evidence`, yedek dosya kalıbı `fonbridge-*.dump`, `fabrika_app` DB rolü. Tüzel kişi unvanı (Fonbridge Eğitim, Proje ve Danışmanlık Ltd. Şti.) ve KEP adresi şirket gerçeğidir, ürün adı değildir.

## 3. Eski rehberle (`deploy/cpanel/*`, `docs/RELEASE_CHECKLIST.md`, `docs/SMTP-SUNUCU.md`) çelişenler

Bu belgeler **Vulut cPanel** (`srv.iyisunucu.com.tr`, `/home/fonbridge`) için yazıldı. Hedef şimdi Hostinger.

| Eski varsayım | Şimdi | İş |
|---|---|---|
| Barındırma Vulut, NS `ns1/ns2.iyisunucu.com.tr` | Hostinger, DNS Hostinger'da | `RELEASE_CHECKLIST.md` §0, §1.1–1.2 ve `SMTP-SUNUCU.md` güncellenmeli (bu kartta değiştirilmedi: patron kararı sonrası) |
| Uygulama kökü `/home/fonbridge/fonbridge-app` | `/home/u605628300/...` (kesin yol hPanel'de belli olur) | `ENV-LISTESI.md` içindeki `sslrootcert=/home/fonbridge/...` yolları, `worker.sh` crontab satırı |
| "Setup Node.js App" (cPanel Selector + Passenger) | Hostinger'ın Node.js uygulama aracı | `app.js` Passenger içindir. Hostinger'ın aracı Passenger kullanıyorsa aynen çalışır; kullanmıyorsa doğrudan `app/server.js` başlatılır (`PORT`/`HOSTNAME` ile). **Doğrulanmadı** |
| SMTP `mail.nexagrant.com` (Vulut Exim) | Hostinger mail (`smtp.hostinger.com`, 465/SSL, kutu şifresi hPanel'de) | `SMTP_HOST` değişir; MX/SPF/DKIM zaten Hostinger'da. Sunucu adı Hostinger belgesinden teyit edilmeli |
| `TRUSTED_PROXY_HOPS=1` (tek LiteSpeed) | Hostinger CDN + LiteSpeed olabilir | Canlıda `curl -sI` ile ölçülmeli; yanlışsa ziyaretçi formu IP sınırı yanlış IP'yi görür |
| `SMTP_FROM` `FonBridge <...>` | `NexaGrant <info@nexagrant.com>` | `.env.example` bu kartta düzeltildi; `deploy/cpanel/ENV-LISTESI.md` satır 39 ayrıca düzeltilecek |

## 4. Barındırmanın taşıyamadıkları (paylaşılan plan)

- **Postgres 16 + pgvector:** Hostinger'da yok. Önceki karar Supabase (`ENV-LISTESI.md`, `RELEASE_CHECKLIST.md` §3). Bu geçerli kalır; yeni bir şey gerekmez.
- **Worker (graphile-worker):** uzun yaşayan süreç. Hostinger cron'u varsa `worker.sh` (flock'lı) her dakika başlatır, tıpkı cPanel'deki gibi. Cron'un dakikalık aralığı ve Node sürümü (worker ≥ 22.18) **doğrulanmadı**.
- **Dosya yükleme:** R2 hesabı gerekir (PATRON KARARI K-2). Yoksa yükleme kapalı, site açılır.

## 5. Patrondan gereken kararlar

1. **Node.js sürümü ve modeli:** hPanel'de uygulamayı oluştururken hangi Node sürümleri listeleniyor (22.18+ mı)? Yoksa web çalışır, worker çalışmaz.
2. **Worker nerede koşacak:** Hostinger cron mu, ayrı makine mi (KURULUM.md K-1).
3. **R2 (dosya deposu)** açılacak mı (K-2).
4. **SMTP kutusu:** `info@` mi, ayrı `bildirim@` mi (K-3).
5. **Canlı veritabanı:** Supabase prod projesi hazır mı; migration koşma onayı ve yedek (KURULUM.md §2).
6. **Google OAuth:** izinli yönlendirme adresi `https://nexagrant.com/api/auth/callback/google` eklenmeli.

## 6. Önerilen sıra (hiçbiri bu kartta koşulmadı)

1. FO-191 ve FO-275 `dev`'e merge (gate yeşil).
2. `deploy/cpanel/build-package.sh <commit> <çıktı-dizini>` ile paket (Docker, `R2_PUBLIC_HOST` ya da `FB_NO_PUBLIC_ASSETS=1`). Gizlilik bildirimi kapısı (`privacy:publish-check`) kırmızıysa paket çıkmaz: bilerek.
3. Staging: `staging.nexagrant.com` alt alan adı + ayrı uygulama; DB için ayrı Supabase dalı. Migration ve `pnpm rls:verify --require-db` orada.
4. Yedek → canlı migration (patron onayı) → paket yükleme → ortam değişkenleri → başlatma.
5. DNS'e dokunma: `@` ALIAS ve `www` CNAME zaten Hostinger'ı gösteriyor; MX/SPF/DKIM bozulmamalı.
6. Doğrulama: `curl -sI https://nexagrant.com`, giriş, e-posta gönderimi, ziyaretçi formu. Repoda `/api/health` ucu **yok** (`src/app/api/health` bulunmuyor); dış kalp atışı/izleme için eklenmesi ayrı iş.

## 7. Bilinmeyenler (varsayım)

- Hostinger Node.js aracının Passenger kullanıp kullanmadığı, desteklenen sürümler, cron aralığı, süreç ve bellek sınırları (Cloud Economy planı).
- `public_html` şu an ne yayınlıyor (okunmadı).
- Bu planda dış Postgres'e (Supabase pooler) çıkış bağlantısının serbest olup olmadığı.
