> **YÖNLENDİRME (NG-262, 19.11.2026): bu belgenin yerini alacak belgeler `deploy/vps/RUNBOOK.md` ve `docs/adr/ADR-0012-hosting-hostinger-cloud-to-vps.md`.**
> Patron barındırmayı Hostinger Cloud'dan VPS'e çevirdi (K-584192 = C, K-584515 = A: Hostinger KVM 2, Frankfurt; veritabanı Supabase'te kalır).
> **Taşıma YAPILMADI; planlı** (NG-261, adım adım patron onayı bekliyor). Bu belge, taşıma tamamlanana kadar ve taşımadan sonraki 14 günlük geri dönüş süresince geçerlidir. Belge silinmez.
> Aşağıdaki "Hedef (K-574987 = A)" ve "VPS alınmaz" ifadeleri, ADR-0012 ile yerine geçilen eski karardır.

# NexaGrant → nexagrant.com (Hostinger Cloud hosting): dağıtım belgesi

**Hedef (patron kararı K-574987 = A, 01.11.2026):** NexaGrant, Hostinger'daki **hazır** `nexagrant.com` sitesine
(Cloud Economy, sipariş 1010267304, addon vhost, kullanıcı `u605628300`, kök
`/home/u605628300/domains/nexagrant.com/public_html`) **Node.js uygulaması** olarak yüklenir.
**VPS alınmaz**; `deploy/vps/` (FO-244 KVM 2 paketi, `deploy/vps/RUNBOOK.md`) bu hedef için **kullanılmıyor**.
Veritabanı Supabase Postgres + pgvector. Worker (graphile-worker) Hostinger cron + `flock` ile.

Kart: FO-260 (TASK-MVVMJ9T2LKSJ) · Hazırlayan: devop-fb · Ölçüm: 01.11.2026 (salt-okunur).
**Bu belge hiçbir şey dağıtmaz.** Yükleme, ortam değişkeni, migration, cron ve DNS işlemleri patron onayıyla (✋) yapılır.

İlgili: `deploy/cpanel/ENV-LISTESI.md` (değişkenler), `deploy/cpanel/build-package.sh` (paket),
`deploy/cpanel/worker.sh` (cron worker), `deploy/cpanel/KURULUM.md` (eski cPanel rehberi, kavramlar geçerli).

---

## 1. Ölçülen durum (Hostinger API, 01.11.2026, salt-okunur)

| Kalem | Değer | Kaynak (API işlemi) |
|---|---|---|
| Site | `nexagrant.com`, addon, etkin, tür `other`, kök `/home/u605628300/domains/nexagrant.com/public_html` | `hosting_websites_list` |
| `public_html` içeriği | yalnız `default.php` (Hostinger karşılama sayfası, 42 585 B) | `hosting_files_list-website-and-directories` |
| Node.js build/çalıştırma | Bu sitede henüz Node.js build'i yok (`build: null`) | `hosting_get-deployment` |
| Node sürümleri | API yalnız **ana sürüm** kabul eder: 18, 20, 22, 24. Alt sürüm (22.x) API'de görünmez | `hosting_nodejs_start-build` şeması |
| Çalıştırma modeli | Arşivden (`source_type: archive`) ya da Git'ten build; `app_type` (`next`, `other`…), `root_directory`, `entry_file`, `build_script`, `package_manager`. Build sonucu `public_html` içeriğinin **üzerine yazar** | `hosting_nodejs_start-build`, `hosting_nodejs_build-settings-from-archive` |
| Node env değişkenleri | Şu an boş (`[]`); değişiklik `replace` ile TÜM liste; değerler maskeli, geri okunmaz | `hosting_nodejs_list-environment-variables` |
| Cron | Hesap düzeyinde (`hosting_cron-jobs_create`, standart 5 alanlı ifade). Hesapta mevcut tek iş `*/5 * * * *` (arsalog.com). Dakikalık (`* * * * *`) ifade şemada serbest, **canlıda denenmedi** | `hosting_cron-jobs_list` |
| SSL | `active`, sağlayıcı `hssl`, ömür boyu, HTTPS yönlendirme açık, bitiş 2027-01-27 (otomatik yenilenir) | `hosting_websites_get-settings` |
| CDN | **açık** (Hostinger CDN); sunucu önbelleği kapalı | `hosting_websites_get-settings` |

**DNS (salt-okunur, `dns_records_list` + `dig`):** `@` ALIAS → `nexagrant.com.cdn.hstgr.net.`, `www` CNAME →
`www.nexagrant.com.cdn.hstgr.net.`; MX `mx1/mx2.hostinger.com`; SPF Hostinger mail + Reach; DKIM `hostingermail-a/b/c`;
DMARC `p=none`. Canlı yanıt: `HTTP/2 200`, `server: hcdn`, `x-hcdn-request-id: …-fra-edge6`, `x-hcdn-cache-status: DYNAMIC`;
`http://` → 301 `https://`; `www` → 200.

**DNS ile uyum:** Cloud hosting'in Node.js uygulaması aynı vhost'un arkasında çalışır; `@`/`www` zaten bu sitenin
CDN'ini gösteriyor. **Canlıya almada DNS değişikliği GEREKMEZ** (VPS planındaki A kaydı değişikliği bu hedefte yok).
HTML yanıtları CDN'de `DYNAMIC` (önbelleğe alınmıyor); oturumlu sayfalar CDN'den başkasına sızmaz. Statik
`/_next/static/*` dosyaları değişmez adlı (hash'li) olduğu için CDN önbelleği güvenlidir.

### 1.1 Doğrulanamayanlar (canlı ölçüm onay gerektiriyor)

1. **Node 22'nin alt sürümü** (worker ≥ 22.18 ister). Ana sürüm 22 seçilip build başlatılınca build logu sürümü yazar.
   22.x < 22.18 ise **24** seçilir. `worker.sh` < 22.18 ile çalışmayı reddeder ve log'a yazar (sessiz çökme yok).
2. **Cron'un `node` yolu:** `worker.sh` sırasıyla `FB_NODE`, cPanel `nodevenv`, CloudLinux `/opt/alt/alt-nodejs{24,22}`,
   `command -v node` dener. Hostinger'da hangisi var, ilk cron koşusunun logunda görünür.
3. **Ön vekil sayısı (`TRUSTED_PROXY_HOPS`):** CDN + barındırma web sunucusu → beklenen `2`; runbook adım 7'de ölçülür.
4. **Hostinger'ın `other` tipinde önceden derlenmiş paketi olduğu gibi çalıştırması:** arşiv yüklendikten sonra salt-okunur
   `hosting_nodejs_build-settings-from-archive` ile önizlenir (adım 4).
5. **Cloud Economy süreç/bellek sınırları** (Next standalone + worker aynı hesapta).

## 2. Koddan ve dış servislerden yana durum

### 2.1 Paket

- Araç: `deploy/cpanel/build-package.sh <commit> <çıktı-dizini>` → `fonbridge-app-<kısa>.zip` + `SHA256SUMS`.
  Docker `linux/amd64`, `node:22-bookworm-slim`; `git archive` ile yalnız commit içeriği girer, `.env` girmez.
  Gizlilik kapısı (`privacy:publish-check`) kırmızıysa paket çıkmaz.
- Zip doğrudan `public_html`'e açılır: `app.js` (giriş), `package.json` (bağımlılık yok, `build` no-op, `start: node app.js`),
  `worker.sh`, `BUILD-INFO.txt`, `certs/` (Supabase CA), `app/` (Next standalone: `server.js`, `node_modules`, `.next`, `public`, `jobs-worker.cjs`).
- Hostinger build ayarı: `node_version` 22 (ya da 24, bkz. §1.1-1), `app_type: other`, `root_directory: .`,
  `entry_file: app.js`, `build_script: build`, `package_manager: npm`, `output_directory: .`.
- **Gizlilik kapısı (FO-180) canlıya alma ENGELİ:** `build-package.sh`, `/privacy` metninde yer tutucu ya da demo değer
  varken paket ÜRETMEZ (atlatma seçeneği yok, bilerek). 01.11.2026 ölçümü: 7 engel — vergi dairesi/no, MERSİS no,
  VERBİS durumu, yurt dışı aktarım mekanizması, trafik logu saklama süresi (barındırma teyidi: Hostinger), yürürlük tarihi,
  demo KEP adresi. Bunlar hukuk/şirket bilgisiyle doldurulmadan yüklenebilir paket çıkmaz.
- Sağlık ucu: `GET /api/health` → `200 {"status":"ok"}`, `Cache-Control: no-store`; DB'ye ve oturuma dokunmaz.
- Prisma motoru: `binaryTargets` içinde `rhel-openssl-3.0.x` var (CloudLinux 9 / RHEL uyumlu); sürücü adaptörü `pg`.

### 2.2 Supabase (salt-okunur ölçüm, 01.11–02.11.2026)

İki ayrı Supabase hesabı var; AgentSpace Supabase entegrasyonu yalnız birini görüyor.

| Kalem | FonBridge canlı projesi (`.env.supabase.local`) | Entegrasyonun gördüğü proje |
|---|---|---|
| Bölge | **eu-west-1 (İrlanda)**, pooler `aws-0-eu-west-1.pooler.supabase.com:5432` | ap-northeast-1 (Tokyo), `pxojxhvsvadqqaqudiok` |
| Sahibi | FonBridge (rename sonrası NexaGrant) | Başka bir ürün (`listings`, `orders`, `pickup_points` …) |
| Postgres | 17.11 | 17.6 |
| Uzantılar | `vector` 0.8.2 **kurulu**, `pgcrypto` 1.3 | `vector` kurulu değil |
| Şema | `public` 76 tablo, 53'ünde RLS; `fabrika_private` şeması var | NexaGrant şeması yok |
| Roller | `fabrika_migrate` (sahip), `fabrika_app` (uygulama), `fabrika_jobs` (worker) | — |
| Migration | Düz `.sql` dosyaları `scripts/apply-migrations.sh` ile uygulanır (`_prisma_migrations` tablosu bu yolda yoktur) | — |

Ölçüm `BEGIN READ ONLY … ROLLBACK` ile yapıldı; hiçbir şey yazılmadı.

**Sonuç:** NexaGrant için **yeni Supabase projesi gerekmiyor**. Prod veritabanı FonBridge'in eu-west-1'deki canlı projesidir; veri AB içinde kalır.
Tokyo projesi başka bir ürüne aittir ve **dokunulmaz**. Plan, PITR ve anahtar bilgileri entegrasyondan okunamaz; Supabase panelinden patron kontrol eder.

### 2.3 Bilerek değişmeyen kimlikler

- **keep.eu User-Agent:** `FonBridge/1.0 (+https://nexagrant.com/contact)` (K-574984 = A; Interact erişim anlaşması bu
  UA'ya bağlı olabilir). Diğer adaptörler (`eurostars`, `tubitak`) `NexaGrant/1.0`.
- Cookie/localStorage anahtarları, HMAC etiketleri, R2 kovası `fonbridge-evidence`, yedek kalıbı `fonbridge-*.dump`,
  DB rolü `fabrika_app`, paket adı `fonbridge-app-*.zip`, worker env varsayılanı. Tüzel kişi unvanı şirket gerçeğidir.

## 3. Ortam değişkenleri

Tam liste ve biçimler: `deploy/cpanel/ENV-LISTESI.md`. Hostinger'a özgü olanlar:

| Değişken | Değer / not |
|---|---|
| `AUTH_URL`, `NEXT_PUBLIC_APP_URL` | `https://nexagrant.com` (paket bu değerle derlenir) |
| `DATABASE_URL` | `fabrika_app` rolü, `…?sslmode=verify-full&sslrootcert=/home/u605628300/domains/nexagrant.com/public_html/certs/supabase-prod-ca-2021.crt` |
| `SMTP_HOST` / `SMTP_PORT` / `SMTP_SECURE` | `smtp.hostinger.com` / `465` / `true` |
| `SMTP_USER` / `SMTP_FROM` | `info@nexagrant.com` / `NexaGrant <info@nexagrant.com>`; `SMTP_PASS` yalnız panelde |
| `TRUSTED_PROXY_HOPS` | ölçülecek (beklenen `2`), adım 7 |
| `PORT`, `HOSTNAME` | girilmez (barındırma verir; `app.js` 127.0.0.1'e bağlanır, gerekirse `FB_LISTEN_HOST`) |
| Worker dosyası | `/home/u605628300/.nexagrant-worker.env` (600, `public_html` dışında); `JOBS_CRON_ENABLED=false` ile başlar |

Cron satırı (✋ adım 10):

```
* * * * * FB_WORKER_ENV=/home/u605628300/.nexagrant-worker.env /bin/bash /home/u605628300/domains/nexagrant.com/public_html/worker.sh
```

## 4. Canlıya alma runbook'u (12 adım)

✋ = patron onayı olmadan koşulmaz. Her adımın geri alma yolu yazılıdır. Adımlar idempotenttir (tekrar koşmak zarar vermez).

| # | Adım | Onay | Doğrulama | Geri alma |
|---|---|---|---|---|
| 1 | **Kararlar + engeller:** R2 açılsın mı (K-2), posta planı (deneme → ücretli), DMARC aşaması (§6); **gizlilik metni yer tutucuları** (§2.1, hukuk) | ✋ | karar kartları kapalı; `pnpm privacy:publish-check` yeşil | — |
| 2 | **Yedek:** mevcut `public_html` (`default.php`) indirilir; aynı hesapta 15 site var (fonbridge.com, arsalog.com, hipervizyon.com …; Cloud Economy kaynağını paylaşırlar), yalnız bu vhost'a dokunulur | yok (okuma) | dosya yerelde, sha256 not edildi | — |
| 3 | **Supabase prod (mevcut eu-west-1 projesi):** önce yedek (`pg_dump`, pgvector:pg17 konteyneri), sonra paketteki migration'lar `scripts/apply-migrations.sh` ile (sahip rolü, idempotent: 2. koşu da 0 çıkmalı), `pnpm db:rls`, `pnpm rls:verify` | ✋ | `apply-migrations.sh` 0 ile çıktı, `rls:verify` yeşil, `vector` kurulu | Ters sırada `apply-migrations.sh --down <dosya>`; gerekirse yedekten geri yükleme. Tokyo projesine **dokunulmaz** |
| 4 | **Paket:** `R2_PUBLIC_HOST=… deploy/cpanel/build-package.sh <dev-commit> out/` (ya da `FB_NO_PUBLIC_ASSETS=1`); SHA256 kontrolü; arşivi `hosting_files_generate-upload-url` ile `public_html`'e yükle; `hosting_nodejs_build-settings-from-archive` ile önizle (salt-okunur) | ✋ yükleme | önizleme `other` / `app.js` diyor | Yüklenen zip'i sil; site henüz değişmedi |
| 5 | **Ortam değişkenleri:** hPanel (ya da `replace-environment-variables`) ile §3 + ENV-LISTESI §1–2 | ✋ | `list-environment-variables` anahtar adları tam | Önceki liste boştu: listeyi boşalt |
| 6 | **Build/başlat:** `hosting_nodejs_start-build` (node 22, `other`, `entry_file: app.js`, `build_script: build`, arşiv yolu); `hosting_get-deployment` ile `completed` olana kadar izle; logdaki `node -v` ≥ 22.18 değilse 24 ile yeniden | ✋ | `curl -sI https://nexagrant.com/api/health` → 200; `/` → 200/307 (dil yönlendirmesi) | Adım 2 yedeğini (`default.php`) geri yükle (static deploy) ya da önceki zip ile yeniden build |
| 7 | **`TRUSTED_PROXY_HOPS` ölçümü:** geçici `xff.php` (yalnız `X-Forwarded-For` uzunluğunu yazan) ya da uygulama logu ile vekil sayısı bulunur, değer env'e girilir, dosya silinir | ✋ | ziyaretçi formu IP sınırı doğru IP'yi sayıyor | Değişkeni eski değere al; geçici dosyayı sil |
| 8 | **Google OAuth:** Cloud Console'a `https://nexagrant.com/api/auth/callback/google` (+ takvim `…/api/calendar/callback`) eklenir | ✋ owner | Google ile giriş çalışıyor | URI'yi kaldır |
| 9 | **SMTP testi:** `swaks --to <test> --server smtp.hostinger.com --port 465 --tls-on-connect --auth LOGIN --auth-user info@nexagrant.com --tls-verify` (parola sorulur, komut satırına yazılmaz) + uygulama içi deneme postası | yok | posta geldi, SPF/DKIM `pass` | — |
| 10 | **Worker:** `/home/u605628300/.nexagrant-worker.env` (600, `JOBS_CRON_ENABLED=false`) + §3 cron satırı; ilk koşu logu (`~/fonbridge-logs/worker.log`) node yolu ve sürümü; sonra `JOBS_CRON_ENABLED=true` + `worker.sh stop` | ✋ | log'da worker başladı, `graphile_worker` şeması var, tek süreç (`flock`) | Cron işini sil (`hosting_cron-jobs_delete`), `worker.sh stop` |
| 11 | **fonbridge.com → nexagrant.com 301:** fonbridge.com bu Hostinger hesabında addon site (`/home/u605628300/domains/fonbridge.com/public_html`). Şu an orada **canlı bir WordPress + WooCommerce sitesi ("Fon Bridge") çalışıyor**. DNS Hostinger'da, alan adının kayıt şirketi Squarespace (yalnız kayıt). 301 bu siteyi kapatır: **ayrı patron onayı** + önce site yedeği (dosyalar + WP veritabanı); sonra `hosting_redirects_create-website` (yol korunarak) + Search Console "adres değişikliği" | ✋ | `curl -sI https://fonbridge.com/x` → 301 `https://nexagrant.com/x` | Yönlendirmeyi sil; WP sitesi dosyaları değişmediyse kendiliğinden döner, değiştiyse yedekten |
| 12 | **İzleme (ilk 48 saat):** dış uptime izleme `GET /api/health` (1 dk), `hosting_get-deployment`/uygulama logu, `SystemAlert` ekranı, `pnpm alerts:check`, Hostinger kaynak metriği (`listOrderResourceUsageMetrics`); HSTS (katman kararı: Hostinger'da uygulama gönderir): `src/proxy.ts` `Strict-Transport-Security: max-age=300` yazar (yalnız `NODE_ENV=production` ve HTTPS isteğinde; `hstsHeaderFor`, `src/lib/security-headers.ts`). HTTPS tespiti: önce istek URL'sinin şeması `https:`, yoksa `x-forwarded-proto: https`. Hostinger'ın kenar katmanının bu vekil başlığını HER istekte gönderdiği DOĞRULANMADI; canlı `curl -sI` (NG-87 sonrası) bunu kanıtlayana kadar başlığın gelmediği bir yanıt olabilir. `includeSubDomains` ve `preload` YOK (geri alınamaz). Yükseltme (`31536000`) ayrı patron kararıdır (RELEASE_CHECKLIST §5.4). VPS'te `deploy/vps/Caddyfile` içindeki HSTS satırı ŞU AN YORUM SATIRI (satır 21); açılırsa Caddy `header` uygulamanın başlığını değiştirir, çift başlık çıkmaz | HSTS ✋ | `curl -sI https://nexagrant.com/ \| grep -i strict-transport` → `max-age=300`; 48 saat 5xx yok, worker log düzenli | HSTS'yi kaldır: `hstsHeaderFor` çağrısını sil ve yeniden derle; adım 6 geri alma |

**Genel geri alma:** DNS hiç değişmediği için geri dönüş, `public_html`'i adım 2 yedeğine döndürmek ve cron işini silmektir
(dakikalar). Veritabanı tarafında geri dönüş adım 3'ün `--down` dosyaları ya da yedeğidir; Tokyo projesine hiçbir adım dokunmaz.

## 5. Posta (SMTP)

Gönderim `smtp.hostinger.com` (465, örtük TLS) üzerinden; MX/SPF/DKIM zaten Hostinger'da, değişiklik gerekmez.
`info@nexagrant.com` kutusu Hostinger'ın **deneme** posta planında (31.10.2026 ölçümü, `is_trial: true`): ücretli plana
geçiş patron kararıdır.

## 6. DMARC aşamalı geçiş (✋ patron kararı, DNS yazması)

1. Şimdi: `v=DMARC1; p=none; rua=mailto:info@nexagrant.com; adkim=r; aspf=r` (rapor toplama).
2. 2–4 hafta sonra raporlar temizse `p=quarantine`, sonra `p=reject`.
Geri alma: TXT kaydını `v=DMARC1; p=none` değerine döndür (TTL 3600).

## 7. Bu belgede yapılmayanlar

- Hostinger'a yükleme, env girme, build başlatma, cron kurma, DNS/SSL/CDN ayarı: **yok**.
- Supabase'te proje açma, uzantı kurma, migration: **yok**.
- Hiçbir şifre, token veya bağlantı adresi repoya ya da bu belgeye yazılmadı.
