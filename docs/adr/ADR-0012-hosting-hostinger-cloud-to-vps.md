# ADR-0012 — Canlı barındırma: Hostinger Cloud → VPS

- **Durum:** KABUL (patron, 19.11.2026); **sunucu boyutu 19.11.2026 akşam KVM 2 → KVM 4 olarak değişti** (aşağıda). **Uygulama: PLANLI, YAPILMADI.** Bu ADR yalnız kararı kaydeder. VPS patron tarafından alındı, ama `nexagrant.com` kök A kaydı ölçüm anında hâlâ Hostinger park sayfasındaydı (`2.57.91.91`) ve VPS'te `nexagrant.com` sitesi yoktu; bugün canlı hedef hâlâ Hostinger Cloud Economy'dir. Taşıma NG-261'de ve adım adım patron onayı bekliyor.
- **Tarih:** 2026-11-19
- **Kart:** NG-262 (TASK-MWNJMY7KHK4FR, belge). Plan: NG-246 (Faz 1, bitti). Taşıma: NG-261 (bekliyor).
- **Hazırlayan:** PM-NG (pm-gnd). Plan ve ölçümler: dev-gnd, `docs/agent-results/NG-246-dev-gnd.md`
- **Yerini alır:** K-574987 = A (hazır nexagrant.com Cloud Node.js sitesi; VPS yok, 01.11.2026). Bu karar K-574987 = A'nın yerini alır.
- **Kararlar:** K-584192 = C (uygulama VPS'e taşınır), K-584515 = A (veritabanı Supabase'te kalır; o gün seçilen sunucu Hostinger KVM 2, Frankfurt idi, 19.11.2026 15:44). Önceki karar: K-573894 = B (30.10.2026, KVM 2 Frankfurt, 1 yıl taahhüt, TRY).
- **Değişiklik (19.11.2026 akşam, yeni karar kimliği yok):** patron KVM 2 yerine **Hostinger KVM 4** VPS'ini kendisi satın aldı ve "projeyi oradaki alan adlarından birinde, nexagrant.com'da çalıştıracağız" dedi (patron sözü, 19.11.2026; NG-261 kartı "GÜNCELLEME 19.11.2026 akşam" bölümü). Veritabanı Supabase'te kalır (değişmedi); e-posta Hostinger'da kalır (değişmedi). Satın alma dönemi ve ödenen tutar bu ADR'de kayıtlı değil.

## 1. Bağlam

K-574987 = A ile NexaGrant, Hostinger Cloud Economy hesabındaki (`u605628300`) `nexagrant.com` vhost'una Node.js uygulaması olarak yüklenecekti. Worker hesap cron'u ile koşacaktı. `deploy/vps/` paketi (FO-244, o gün KVM 2 için yazılmıştı) bu hedef için "kullanılmıyor" diye bir kenara konmuştu (`docs/DEPLOY-NEXAGRANT-HOSTINGER.md`).

Dosya yükleme virüs taraması (NG-239) bunu bozdu. `clamd` kalıcı bir süreçtir ve imza veritabanını bellekte tutar. Cloud Economy'de kalıcı süreç, Docker ve root yoktur (NG-239 raporu §3, NG-246 raporu §1 tablosu). Yani taramanın istenen biçimde koşacağı bir yer bu hedefte yok. Patron barındırma kararını tersine çevirdi (K-584192 = C).

## 2. Karar

- Uygulama (web + worker + `clamav`) patronun aldığı **Hostinger KVM 4** VPS'inde (4 vCPU / 16 GB / 200 GB; `191.96.1.252`; Ubuntu 24.04 + **CloudPanel**; oluşturulma 15.11.2026; kaynak: NG-261 kartı, lider ölçümü 19.11.2026, Hostinger API) Docker Compose ile koşar. Temel: `deploy/vps/docker-compose.prod.yml` (paket KVM 2 için yazılmıştı; NG-261 Faz A'da uyarlanır). Eklenecekler: `clamav` servisi (yalnız iç ağ, port yayımlanmaz) ve sağlık kontrolünün `GET /api/health`'e çevrilmesi.
- **Makine tek kiracılı değildir:** 80/443'ü CloudPanel'in nginx'i tutar ve makinede başka siteler olabilir. Bu yüzden uygulama CloudPanel'de **Reverse Proxy sitesi** olarak yayınlanır (liderin teknik seçimi; NG-261 Faz A / Adım 0 ölçümüne bağlı); Caddy 80/443'e bağlanmaz; CloudPanel'e ve öteki sitelere dokunulmaz. **PLANLI, yapılmadı.**
- **Veritabanı Supabase'te kalır** (eu-west-1, PG 17.11; NG-246 "DB-1"). Veri taşınmaz.
- TLS ve ters vekil: CloudPanel nginx + CloudPanel Let's Encrypt (planlı). `deploy/vps/Caddyfile` yalnız CloudPanel'siz makine için kalır. DNS: kök `@` A kaydı bugün `2.57.91.91` (Hostinger park sayfası); `191.96.1.252`'ye çevrilmesi **planlı, patron onayı bekliyor, yapılmadı**. MX/SPF/DKIM/DMARC'a dokunulmaz.
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

- DB Supabase'te iken ölçülen tepe yaklaşık 2.4 GiB, sınırlar toplamı ~5.6 GB. (KVM 2 için ölçülmüştü: 8 GB'lık makineye rahat sığardı.) Seçilen KVM 4'te (16 GB) bu rakamlar daha da rahattır, ama KVM 4 üzerinde ölçülmedi; üstelik makinede CloudPanel ve başka siteler de bellek kullanabilir (NG-261 Adım 0'da ölçülecek).
- Postgres VPS'e alınsaydı sınırlar toplamı ~7.6 GB olurdu (KVM 2 için ölçülmüştü: 8 GB'ta işletim sistemine ve sayfa önbelleğine pay kalmazdı).
- ClamAV belgesi en az 3 GiB, tercihen 4 GiB önerir (https://docs.clamav.net/manual/Installing/Docker.html, erişim 19.11.2026).
- Sınırlar: Linux VPS ve canlıda koşulmadı. Postgres'in gerçek veriyle belleği ve 2 vCPU'da derleme süresi/belleği ölçülmedi.

## 4. Değerlendirilen seçenekler

Fiyat kaynakları NG-246 raporu §4'tendir; erişim tarihi tümü için 19.11.2026. Fiyatlar sayfada yazdığı gibidir.

| Seçenek | Sonuç | Gerekçe |
|---|---|---|
| **Hostinger KVM 4 + DB Supabase'te (seçildi, 19.11.2026 akşam)** | KABUL | Patron aldı (NG-261 kartı); 16 GB belleğe sığar. Veri taşıma yok. Postgres'i VPS'e almak bu seçimin gereği DEĞİLDİR: DB Supabase'te kalır (DB-2 ayrı karar). Makinede CloudPanel var, uygulama Reverse Proxy sitesi olarak yayınlanır (§2). Fiyat/dönem bu ADR'de kayıtlı değil (referans: aşağıdaki NG-246 §4 satırı, KVM 4 için $12.99/ay, 24 ay peşin $311.76, yenileme $28.99/ay; erişim 19.11.2026; patronun ödediği tutar değildir) |
| Hostinger KVM 2 + DB Supabase'te | Seçilmedi (19.11.2026 akşam; 15:44'te K-584515 = A ile seçilmişti) | KVM 2 için ölçülmüştü: belleğe sığar (§3), hazır paket var. $8.79/ay, 24 ay peşin $210.96, yenileme $14.99/ay (https://www.hostinger.com/vps-hosting). Patron bunun yerine KVM 4'ü aldı; bu satır kayıt içindir |
| Hostinger KVM 4 + Postgres VPS'te | Seçilmedi | KVM 4 artık var, ama DB taşınmaz. Postgres VPS'e alınırsa veri taşıma, 30–60 dk bakım penceresi ve DB işletimi bizde; asıl risk: VPS'te yeni veri yazıldıktan sonra geri dönüş. Ayrı kart ve ayrı pencere ile yeniden düşünülebilir |
| Hetzner CPX32 (Nürnberg) | Seçilmedi | 4 / 8 GB / 160 GB, €35.99/ay (KDV hariç, IPv4 dahil; https://www.hetzner.com/cloud/regular-performance/). Giden 25 ve 465 portları varsayılan olarak kapalı (https://docs.hetzner.com/cloud/servers/faq/); bizim SMTP 465 kullanıyor, `SMTP_PORT=587` + STARTTLS gerekirdi |
| Hetzner CPX22 | Elendi | 2 / 4 GB: ClamAV için yetmez (§3) |

Supabase faturası sürer. NexaGrant projesinin hangi planda olduğu bilinmiyor (NG-246 §4). Hostinger sayfası KDV'yi belirtmiyor.

## 5. Sonuçlar

- **Cloud hesabı iptal edilmez.** Aynı hesapta 14 site daha var; fonbridge.com canlı WordPress + WooCommerce sitesi de bunlardan biri. DNS bölgesi ve posta da Hostinger'da (NG-246 §4.3). Taşıma bitince yalnız `nexagrant.com` vhost'u boşa çıkar.
- **14 günlük geri dönüş:** geçişten sonra Hostinger vhost'u 14 gün dokunulmadan kalır. DB Supabase'te kaldığı için geri dönüş DNS'i geri almaktır. Vhost'u boşaltma ayrı onaydır.
- **`TRUSTED_PROXY_HOPS`:** Hostinger'da CDN + web sunucusu için beklenen değer 2 idi (ölçülmedi). VPS'te değer **CloudPanel nginx zincirinde ölçülecek (NG-261 Faz A)**; sayı bugün yazılmaz (önceki "Caddy → 1" varsayımı, Caddy kalktığı için geçersiz). Ölçüm: istemci IP'si doğru çıkıyor mu ve sahte `X-Forwarded-For` reddediliyor mu (`deploy/cpanel/ENV-LISTESI.md` §2, NG-246 §6).
- **Adım adım onay:** satın alma adımı düştü (patron KVM 4'ü aldı); sır girişi, DNS ve vhost boşaltma ayrı patron onayı ister (NG-246 §5).
- `deploy/vps/RUNBOOK.md` asıl canlı belge olacak; güncellemesi NG-261'de. `docs/DEPLOY-NEXAGRANT-HOSTINGER.md` silinmez: 14 günlük paralel dönem ve geri dönüş için gerekir.
- NG-239 (virüs taraması) bu sayede kalıcı süreç alır; kodu bu karardan bağımsızdır (`CLAMD_HOST`/`CLAMD_PORT`).
- Yeni sır `TWO_FACTOR_ENCRYPTION_KEY` (NG-39) VPS'e girmeden yayın olmaz (NG-246 §6, §7).

## 6. Durum özeti (19.11.2026)

| Madde | Durum |
|---|---|
| Karar (K-584192 = C, K-584515 = A) | Verildi |
| Plan ve maliyet (NG-246) | Bitti |
| VPS satın alma | Yapıldı (patron, KVM 4, oluşturulma 15.11.2026) |
| Sunucu hazırlığı, CloudPanel Reverse Proxy sitesi, DNS geçişi (`@` A `2.57.91.91` → `191.96.1.252`) | **Planlı, yapılmadı** (NG-261; ölçüm anında kök A park sayfasındaydı, VPS'te `nexagrant.com` sitesi yoktu) |
| `clamav` servisi, `/api/health` sağlık kontrolü | **Planlı, yapılmadı** |
| `TRUSTED_PROXY_HOPS` | **Planlı**; CloudPanel nginx zincirinde ölçülecek (NG-261 Faz A), sayı yazılmadı |
| Hostinger vhost'unu boşaltma | **Planlı**, taşımadan 14 gün sonra, ayrı onay |
