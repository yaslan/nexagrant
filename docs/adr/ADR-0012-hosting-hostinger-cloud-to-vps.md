# ADR-0012 — Canlı barındırma: Hostinger Cloud → VPS

- **Durum:** KABUL (patron, 19.11.2026). **Uygulama: PLANLI, YAPILMADI.** Bu ADR yalnız kararı kaydeder. Bugün canlı hedef hâlâ Hostinger Cloud Economy'dir. Taşıma NG-261'de ve adım adım patron onayı bekliyor.
- **Tarih:** 2026-11-19
- **Kart:** NG-262 (TASK-MWNJMY7KHK4FR, belge). Plan: NG-246 (Faz 1, bitti). Taşıma: NG-261 (bekliyor).
- **Hazırlayan:** PM-NG (pm-gnd). Plan ve ölçümler: dev-gnd, `docs/agent-results/NG-246-dev-gnd.md`
- **Yerini alır:** K-574987 = A (hazır nexagrant.com Cloud Node.js sitesi; VPS yok, 01.11.2026). Bu karar K-574987 = A'nın yerini alır.
- **Kararlar:** K-584192 = C (uygulama VPS'e taşınır), K-584515 = A (Hostinger KVM 2, Frankfurt; veritabanı Supabase'te kalır, 19.11.2026 15:44). Önceki karar: K-573894 = B (30.10.2026, KVM 2 Frankfurt, 1 yıl taahhüt, TRY). Satın alma DÖNEMİ bu ADR'de kararlaştırılmadı; NG-261'deki satın alma onayında patrona sorulur.

## 1. Bağlam

K-574987 = A ile NexaGrant, Hostinger Cloud Economy hesabındaki (`u605628300`) `nexagrant.com` vhost'una Node.js uygulaması olarak yüklenecekti. Worker hesap cron'u ile koşacaktı. `deploy/vps/` paketi (FO-244, KVM 2) bu hedef için "kullanılmıyor" diye bir kenara konmuştu (`docs/DEPLOY-NEXAGRANT-HOSTINGER.md`).

Dosya yükleme virüs taraması (NG-239) bunu bozdu. `clamd` kalıcı bir süreçtir ve imza veritabanını bellekte tutar. Cloud Economy'de kalıcı süreç, Docker ve root yoktur (NG-239 raporu §3, NG-246 raporu §1 tablosu). Yani taramanın istenen biçimde koşacağı bir yer bu hedefte yok. Patron barındırma kararını tersine çevirdi (K-584192 = C).

## 2. Karar

- Uygulama (web + worker + `clamav`) tek bir **Hostinger KVM 2** VPS'inde (Frankfurt, 2 vCPU / 8 GB / 100 GB NVMe) Docker Compose ile koşar. Temel: `deploy/vps/docker-compose.prod.yml`. Eklenecekler: `clamav` servisi (yalnız iç ağ, port yayımlanmaz) ve sağlık kontrolünün `GET /api/health`'e çevrilmesi.
- **Veritabanı Supabase'te kalır** (eu-west-1, PG 17.11; NG-246 "DB-1"). Veri taşınmaz.
- TLS ve ters vekil: Caddy + Let's Encrypt (`deploy/vps/Caddyfile`). DNS: `@` ve `www` → VPS IPv4 (A kaydı). MX/SPF/DKIM/DMARC'a dokunulmaz.
- Dosya deposu (Cloudflare R2) ve e-posta (`smtp.hostinger.com`) değişmez.

## 3. Ölçülen bellek rakamları

Kaynak: NG-246 raporu §3. Yerel Docker provası, 19.11.2026, mac / arm64 / Docker Desktop; `origin/dev` `ebce8874`. Bellek sınırları `deploy/vps/docker-compose.prod.yml` ile aynı, `clamav` ölçmek için sınırsız.

| Servis | Boştayken | Yük sonrası / tepe | Paketteki `mem_limit` |
|---|---|---|---|
| `clamav` (`clamd` 1.5.4, 3 628 279 imza) | ~1.0 GiB (1004–1022 MiB, 10 dk) | ilk yükleme 1.60 GiB; zorla `RELOAD` → 1.96 GiB | — (yeni; öneri `3g`) |
| `web` (Next standalone) | 185 MiB | 232 MiB (300 istek / 10 eşzamanlı) | 1536m |
| `worker` (graphile) | 94 MiB | 94 MiB | 1g |
| `postgres` (boş şema + seed) | 63 MiB | 74 MiB | 2g |
| `caddy` | 57 MiB | — | 128m |

- DB Supabase'te iken ölçülen tepe yaklaşık 2.4 GiB, sınırlar toplamı ~5.6 GB. 8 GB'lık KVM 2'ye rahat sığar.
- Postgres VPS'e alınsaydı sınırlar toplamı ~7.6 GB olurdu. 8 GB'ta işletim sistemine ve sayfa önbelleğine pay kalmaz.
- ClamAV belgesi en az 3 GiB, tercihen 4 GiB önerir (https://docs.clamav.net/manual/Installing/Docker.html, erişim 19.11.2026).
- Sınırlar: Linux VPS ve canlıda koşulmadı. Postgres'in gerçek veriyle belleği ve 2 vCPU'da derleme süresi/belleği ölçülmedi.

## 4. Değerlendirilen seçenekler

Fiyat kaynakları NG-246 raporu §4'tendir; erişim tarihi tümü için 19.11.2026. Fiyatlar sayfada yazdığı gibidir.

| Seçenek | Sonuç | Gerekçe |
|---|---|---|
| **Hostinger KVM 2 + DB Supabase'te (seçildi)** | KABUL | Belleğe sığar (§3). Veri taşıma yok. Hazır paket var. $8.79/ay, 24 ay peşin $210.96 (24 ay peşin seçeneği; dönem kararı verilmedi, K-573894 = B 1 yıl taahhüttü), yenileme $14.99/ay (https://www.hostinger.com/vps-hosting) |
| Hostinger KVM 4 + Postgres VPS'te | Seçilmedi | Postgres 2 GB ekler; 8 GB yetmediği için KVM 4 (16 GB) gerekir. $12.99/ay, 24 ay peşin $311.76, yenileme $28.99/ay. Veri taşıma, 30–60 dk bakım penceresi ve DB işletimi bizde; asıl risk: VPS'te yeni veri yazıldıktan sonra geri dönüş. Ayrı kart ve ayrı pencere ile yeniden düşünülebilir |
| Hetzner CPX32 (Nürnberg) | Seçilmedi | 4 / 8 GB / 160 GB, €35.99/ay (KDV hariç, IPv4 dahil; https://www.hetzner.com/cloud/regular-performance/). Giden 25 ve 465 portları varsayılan olarak kapalı (https://docs.hetzner.com/cloud/servers/faq/); bizim SMTP 465 kullanıyor, `SMTP_PORT=587` + STARTTLS gerekirdi |
| Hetzner CPX22 | Elendi | 2 / 4 GB: ClamAV için yetmez (§3) |

Supabase faturası sürer. NexaGrant projesinin hangi planda olduğu bilinmiyor (NG-246 §4). Hostinger sayfası KDV'yi belirtmiyor.

## 5. Sonuçlar

- **Cloud hesabı iptal edilmez.** Aynı hesapta 14 site daha var; fonbridge.com canlı WordPress + WooCommerce sitesi de bunlardan biri. DNS bölgesi ve posta da Hostinger'da (NG-246 §4.3). Taşıma bitince yalnız `nexagrant.com` vhost'u boşa çıkar.
- **14 günlük geri dönüş:** geçişten sonra Hostinger vhost'u 14 gün dokunulmadan kalır. DB Supabase'te kaldığı için geri dönüş DNS'i geri almaktır. Vhost'u boşaltma ayrı onaydır.
- **`TRUSTED_PROXY_HOPS` 2 → 1:** Hostinger'da CDN + web sunucusu için beklenen değer 2 idi (ölçülmedi); VPS'te yalnız Caddy önde olacağı için 1 olması planlanır; kesin değer canlıya almada X-Forwarded-For zinciri sayılarak doğrulanır (`deploy/cpanel/ENV-LISTESI.md` §2, NG-246 §6).
- **Adım adım onay:** satın alma (dönem seçimi dahil: 1 yıl mı 24 ay mı, NG-261'de patrona sorulur), sır girişi, DNS ve vhost boşaltma ayrı patron onayı ister (NG-246 §5).
- `deploy/vps/RUNBOOK.md` asıl canlı belge olacak; güncellemesi NG-261'de. `docs/DEPLOY-NEXAGRANT-HOSTINGER.md` silinmez: 14 günlük paralel dönem ve geri dönüş için gerekir.
- NG-239 (virüs taraması) bu sayede kalıcı süreç alır; kodu bu karardan bağımsızdır (`CLAMD_HOST`/`CLAMD_PORT`).
- Yeni sır `TWO_FACTOR_ENCRYPTION_KEY` (NG-39) VPS'e girmeden yayın olmaz (NG-246 §6, §7).

## 6. Durum özeti (19.11.2026)

| Madde | Durum |
|---|---|
| Karar (K-584192 = C, K-584515 = A) | Verildi |
| Plan ve maliyet (NG-246) | Bitti |
| VPS satın alma, sunucu hazırlığı, DNS geçişi | **Planlı, yapılmadı** (NG-261) |
| `clamav` servisi, `/api/health` sağlık kontrolü | **Planlı, yapılmadı** |
| `TRUSTED_PROXY_HOPS=1` | **Planlı**; kesin değer canlıya almada doğrulanır (bugün canlı eski hedefte) |
| Hostinger vhost'unu boşaltma | **Planlı**, taşımadan 14 gün sonra, ayrı onay |
