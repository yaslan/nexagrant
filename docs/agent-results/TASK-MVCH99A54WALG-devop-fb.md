---
sözleşme: 3
biçim: html
sayfa: TASK-MVCH99A54WALG-devop-fb.html
görev: TASK-MVCH99A54WALG
kod: TASK-MVCH99A54WALG
ajan: devop-fb
motor: claude
tip: yayın
okur: kullanıcı
hüküm: Kısmen bitti: canlı e0ccbfa9'da koşuyor ve yükleme kodu orada yok; dev'in tamamıyla taşıma yolu (+4 migration, 43→47) provadan geçti; yerel staging'de gerçek JPG yükleme→önizleme→kaydet→public sayfada 200 kanıtlandı (6 MB→size, üye→403); canlıda R2 değişkenleri tanımlı değil; Docker kilitli olduğu için Linux paketi derlenmedi, dal push edilmedi; prod çıkışı onaya sunuldu, prod'a dokunulmadı.
platform: macOS (Darwin 27, arm64): staging (Postgres 16 + MinIO + dev standalone build), gerçek tarayıcı (Playwright Chromium), kapı. Hedef cPanel Linux x86_64 koşulamadı: Docker Desktop yanıt vermiyor, linux/amd64 paket derlemesi yapılamadı. Değişen kod yalnız bash paket betikleri (bash/docker/node, platformdan bağımsız); Windows kapsam dışı.
sürüm: 1
tarih: 2026-10-17T14:39:33.234Z
---

# FO-67 · Blog kapak görseli yüklemeyi çalışan ortama taşıma

## Kararlar

```karar
kimlik: karar-1
soru: Blog görselleri için herkese açık depo nasıl kurulsun?
seçenek: A | Cloudflare R2'de ayrı public bucket (fonbridge-public) + files.fonbridge.com özel alan adı
seçenek: B | Ayrı public bucket + Cloudflare r2.dev adresi (hız sınırlı, üretim için önerilmiyor)
seçenek: C | Şimdilik açma: blog görsel yükleme canlıda kapalı kalsın
öneri: A
karar_kimligi: K-568980
```

```karar
kimlik: karar-2
soru: Dev'in tamamı (blog görsel yükleme dahil, 4 yeni migration) canlıya çıksın mı?
seçenek: A | Evet: paket derlensin, yedek + DB adımları + yükleme rapordaki sırayla, son ayrı onayla
seçenek: B | Bekle: önce ayrı bir staging ortamı kurulsun
seçenek: C | Hayır: canlı şimdilik e0ccbfa9'da kalsın
öneri: A
karar_kimligi: K-568981
```

Canlı (fonbridge.com) dev @ e0ccbfa9 paketini koşuyor (14/14 static dosya eşleşti); blog görsel yükleme (358a1dd8, bfd0d5a9…) içinde yok.
Taşıma: dev'in tamamından yeni paket; paket araçları dev üstüne çakışmasız oturdu (dal devop-fb/fo67-cpanel-dev-package, yerel). Yeni migration: add-expert-pre-registration, add-notification, drop-evidence-reminder (yıkıcı, boş tablo), add-expert-pre-registration-organization → 47 dosya; e0ccbfa9→dev yükseltme provası yeşil.
Canlıda R2_ACCOUNT_ID ve R2_PUBLIC_HOST tanımlı değil (CSP başlığından adıyla okundu); R2_PUBLIC_BUCKET eklenmeli.
Kritik: R2_PUBLIC_HOST derleme anında next.config'e gömülüyor, paket betiği bunu geçirmiyordu → düzeltildi (2eeb6617).
Staging: gerçek JPG yükle → önizleme → kaydet → public sayfa 200; 6 MB → size; üye → 403. Kapı: 4634 geçti / 54 atlandı, lint 0 hata, typecheck ✓.
Prod'a dokunulmadı; iki karar bekliyor (public bucket, prod çıkışı).

## Ne yapıldı
1. Canlı commit tespiti: `fonbridge.com/tr` static dosya adları ↔ `_workspace/deploy/fonbridge-app-e0ccbfa9.zip` → 14/14 eşleşme; `bfd0d5a9` e0ccbfa9'un atası değil; zip'te `api/admin/blog` rotası yok. Canlı DB salt-okur: Notification/ExpertPreRegistration yok, BlogPost RLS kapalı.
2. Taşıma yolu: dev'in tamamından yeni paket (cherry-pick yok). `devop-fb/cpanel-deploy-package`'ın 3 commit'i dev f310642 üstüne çakışmasız → `devop-fb/fo67-cpanel-dev-package`. Migration farkı e0ccbfa9→dev: +add-expert-pre-registration, +add-notification, +drop-evidence-reminder (YIKICI, EvidenceReminder; canlıda n_live_tup=0), +add-expert-pre-registration-organization; değişen: add-blog-post, add-public-lead, add-evidence-link-tenant-id. 43 → 47 dosya.
3. Env adları: canlı CSP `connect-src 'self'` ve `img-src 'self' data: blob: https://images.unsplash.com` → e0ccbfa9 kodu R2_ACCOUNT_ID/R2_ENDPOINT/R2_PUBLIC_HOST'u buraya ekler; yoklar → canlıda tanımlı değil. R2_PUBLIC_BUCKET e0ccbfa9'da okunmuyor, eklenmeli. Değer yazılmadı.
4. Staging (yerel; ayrı staging ortamı yok, Docker kilitli): PG16+pgvector :5450 (e0ccbfa9 şeması → dev yükseltmesi), MinIO :9100 (public + private bucket), dev standalone production build, `fabrika_app` rolü, DEMO_LOGIN kapalı. Gerçek tarayıcıyla form akışı + curl.
5. Paket aracı: `2eeb6617` R2_PUBLIC_HOST'suz derlemeyi reddeder, konteynere geçirir, BUILD-INFO'ya gömülen deseni yazar; ENV-LISTESI'ne R2_PUBLIC_BUCKET. `fc33172b` app.js eslint istisnası (dev üstünde pre-push lint'i kırıyordu).

## Kanıt
- Canlı eşleşme: `ekler/canli-static-varliklar.txt`; BUILD-INFO `commit: e0ccbfa96dfe…`.
- Yükseltme provası: `ekler/upgrade-e0ccbfa9-to-dev.log` → `apply-migrations: 47 files applied` ×2, `rls:verify` ✅, `alerts:check` 0.
- Staging API: üye (sahte isPlatformAdmin claim) → `{"error":"forbidden"} HTTP 403`; 6 357 458 B → `{"error":"size"} HTTP 400`; JPG → `HTTP 200 {"url":"http://127.0.0.1:9100/fonbridge-public/blog/2026/…jpg"}`; oturumsuz → 401.
- `ekler/curl-I.txt`: nesne `HTTP/1.1 200 OK`, `Content-Type: image/jpeg`, `Cache-Control: public, max-age=31536000, immutable`; `/_next/image` 200; bayt bayt aynı.
- `ekler/ui-log.txt` + ekran görüntüleri 1/2/4/5: size hatası, önizleme, kaydedildi + listede kapak, oturumsuz public sayfada kapak 200.
- `ekler/negative-control.txt`: gömülmemiş host → `HTTP 400 "url" parameter is not allowed` (derleme anı bulgusu).
- `ekler/gate-ozet.txt`: lint 0 hata/4 uyarı, typecheck rc=0, vitest 4634 passed / 54 skipped (taban 54), rls:verify/bypass/alerts ✅.

## Değişen dosyalar
- Dal `devop-fb/fo67-cpanel-dev-package` (yerel, push yok): `deploy/cpanel/build-package.sh`, `deploy/cpanel/container-build.sh`, `deploy/cpanel/ENV-LISTESI.md`, `deploy/cpanel/app.js`.
- Uygulama koduna dokunulmadı. Bu rapor + `docs/agent-results/TASK-MVCH99A54WALG-devop-fb-ekler/`.

## Riskler
- Docker Desktop kilitli (socket _ping zaman aşımı; diğer ajanların docker komutları da askıda) → linux/amd64 paket derlenemedi, push'un pre-push e2e'si koşulamadı. Yeniden başlatma ofis sahibinde.
- Staging macOS arm64 standalone; Linux paketi bu commit'le derlenmedi.
- `prisma db push` boş EvidenceReminder'ı drop-evidence-reminder.sql korumasından önce uyarısız düşürür; push öncesi system_scope sayımı şart.
- Taşıma dev'in tamamı (176 commit, 4 migration) — yalnız blog değil.

## Açık sorular
Kararlar kutusunda (k1 public bucket, k2 prod çıkışı).

## Sonraki adım
Docker düzelince: dalı push et (pre-push kapı), `R2_PUBLIC_HOST=<cPanel değeri> build-package.sh <dev-sha>` ile linux/amd64 paket + Passenger-taklidi curl; karar 2 "evet" olursa patron DB adımları + yükleme (rapor §6).

Bu raporun sayfası: TASK-MVCH99A54WALG-devop-fb.html (AgentSpace Raporlar sekmesinde açılır).
