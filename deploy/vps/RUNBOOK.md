# VPS runbook — Hostinger KVM 4 (NG-261; FO-244 kartının yerini alır)

Kapsam: Hostinger **KVM 4** (`srv2164656`, IPv4 **191.96.1.252**, IPv6 2a02:4780:d:a4bb::1), 4 vCPU / 16 GB / 200 GB,
Ubuntu 24.04 with **CloudPanel**. Patron bu makineyi aldı (15.11.2026); eski "KVM 2 satın al" planı düştü.
Bu makinede **CloudPanel nginx'i 80/443'ü tutar** ve 16 başka site yayındadır. NexaGrant bunların yanında
`nexagrant.com` altında çalışır; başka sitelere, CloudPanel'in kendisine ve onların vhost'larına dokunulmaz.

Docker ile: web, worker, clamav (ClamAV, NG-239). Veritabanı: canlıda **Supabase** (DB-1); bu yığında Postgres
yalnız yerel prova içindir (profile `db`). Caddy: yalnız CloudPanel'siz makine için, profile `caddy` (varsayılan kalkmaz).
Redis yok. Alan adı: **nexagrant.com** (FO-233). Hostinger Cloud hesabı iptal edilmez (üzerinde başka siteler var).

> **Bu dosya bir hazırlık belgesidir, kurulum değildir.** Sunucu zaten alındı (KVM 4); bu belgenin hiçbir adımı
> sunucuda, Hostinger'da ya da DNS'te kendiliğinden koşmaz. Her "yap" adımı **patron onayıyla** ve sunucuda,
> patronun ya da onun yetkilendirdiği kişinin elinde koşar. Adımın başında **✋** olan her satır, ayrı bir
> patron onayı gerektirir (`karar_sor`); bir onay yalnız o adımı kapsar, sonrakine taşınmaz. Canlıya geçiş açık
> onay gerektirir (`docs/RELEASE_CHECKLIST.md` §8 madde 14).
> `✋` ile başlayan satır onay gelmeden çalıştırılmaz; onaydan sonra `✋ ` öneki silinerek koşulur. Önekle yapıştırılan satır kabukta çalışmaz (bilinçli, kapalı-başarısız).

Dosyalar (hepsi `deploy/vps/` altında):

| Dosya | İş |
|---|---|
| `docker-compose.prod.yml` | canlı yığın (web, worker, clamav; postgres profile `db`, caddy profile `caddy`) |
| `Caddyfile` | yalnız CloudPanel'siz makine için TLS + www → kök 301 (varsayılan kalkmaz) |
| `.env.prod.example` | değişken ADLARI; değer yok. Sunucuda `.env.prod` olarak kopyalanır |
| `.env` (sunucuda, git'e girmez) | yalnız compose interpolasyonu: `WEB_HOST_PORT`, `PG_HOST_PORT`. RUNBOOK §2 |
| `.env.db.example` | veritabanı sır ADLARI (`POSTGRES_PASSWORD`, `OWNER_DATABASE_URL`); değer yok. Sunucuda `.env.db` olarak kopyalanır. DB-1'de (canlı) yalnız `OWNER_DATABASE_URL` satırı bulunur; yerel provada (profile `db`) postgres ve `ops.sh` okur. RUNBOOK §2 |
| `backup-to-r2.sh` | günlük `pg_dump` → yerel → R2 + boyut doğrulama (yerel Postgres için; DB-1'e uyarlanmadı, §8) |
| `fonbridge-backup.cron` | `/etc/cron.d` girdisi (01:30 UTC) |
| `bootstrap-roles.sql` | ilk kurulum rolleri (yalnız yerel prova): `fabrika_owner`, `fabrika_jobs`, pgvector |
| `ops.sh` | DB işleri: `bootstrap` (yalnız yerel), `r1`, `diff`, `push` (yalnız boş DB), `rls-role`, `rls`, `migrate`, `seed`, `verify` |

---

## 0. Önce bilinmesi gerekenler

- **Sağlık kontrolü:** `GET /api/health` vardır (`src/app/api/health/route.ts`, veritabanına ve ortam
  değerlerine bakmaz). Compose sağlık kontrolü ve izleme bu uçtan yapılır.
- **Dosya tarayıcısı:** `clamav` servisi `AlertExceedsMax yes` ile koşar. Bu ayar yoksa sınırı aşan arşive
  clamd `OK` der ve dosya taranmadan indirilir (NG-239 Ö-1). Doğrulama: §5 adım 2a.
- **Tarayıcı kodu dev'de değil (NG-261 notu):** `CLAMD_HOST` okuyan kod (`src/lib/clamav.ts`, NG-239) şu an
  `task/ng-239` dalında, `origin/dev`'de yok. Bu yığın o kod birleşene kadar canlıya alınmaz (kart Adım 10 engeli).
  Aynı şekilde `add-evidence-scan-status` migrasyonu ve süpürme betiği NG-239'a aittir ve bu dalda yoktur.
- **Canlı veritabanı Supabase'tir (DB-1).** Bu sunucuda canlı Postgres YOK; `postgres` servisi canlıda kalkmaz.
  Canlı DB'nin **Supabase projesi, bölgesi ve host'u patron teyidi bekliyor** (K-584619). Bu belgeye proje
  ref'i, bölge veya host yazılmaz; yer tutucular `<supabase-host>`, `<veritabani>`, `<sahip-rol>` kullanılır.
  **✋ Teyit olmadan canlı veritabanına hiçbir komut koşulmaz** (migrasyon, diff, r1, rls, verify dahil).
- **DB bağlantısı TLS ile:** canlıda (DB-1) `sslmode=verify-full` ve `sslrootcert` (CA dosyası depoda:
  `certs/supabase-prod-ca-2021.crt`; Dockerfile bunu `/app/certs`'e kopyalar). Yerel prova Postgres'i
  (profile `db`) TLS'siz ve yalnız iç ağdadır; bu bir karar (K5).
- **Canlı yedek:** §8 betikleri yerel süper kullanıcıya bakar; DB-1 için uyarlanmadı. Supabase tarafı yedek
  politikası **✋ patron kararı**. Bu belge, DB-1 için çalışan bir yedek olduğunu varsaymaz.
- **`docker compose config` sırları ekrana basar.** Çıktıyı paylaşma, log'a koyma.

---

## 1. Sunucu hazırlığı — önce ölç, değiştirme

Makine 16 site paylaşıyor. Aşağıdakilerin hepsi **önce yalnız ölçümdür**; hiçbir ayar değişmez. Her değişiklik
ayrı bir ✋ onayla yapılır ve öncesi/sonrası aynı ölçüm komutuyla kaydedilir.

**Ölçüm (salt okunur):**

```bash
sudo sshd -T | grep -Ei '^(passwordauthentication|permitrootlogin|pubkeyauthentication) '
sudo ufw status numbered
ss -ltnp | grep -E ':(22|80|443|8443|3000|6081)\b'      # hangi servis hangi portta (Varnish var mı: 6081)
free -h; swapon --show; df -h /
docker --version; docker compose version                # yoksa "command not found" olarak kaydedilir
id deploy 2>&1                                          # kullanıcı yoksa "no such user"
timedatectl | grep -E 'Time zone|NTP'                   # UTC olmalı (yedek ve cron saatleri UTC)
nc -vz -w 5 smtp.hostinger.com 465                      # giden SMTP 465 erişilebilir mi (yalnız deneme)
```

**✋ Ayrı onaylanacak değişiklikler (ölçüm sonucuna göre; hepsi isteğe bağlı değil, her biri ayrı karar):**

- ✋ **SSH sertleştirme:** Parola girişi ve root girişi **bu makinede genel olarak kapatılmaz**: 16 site aynı
  makinede; site kullanıcılarının giriş yöntemi (ör. SFTP) ölçülmeden hiçbir ayar değişmez. Yapılırsa sıra:
  `deploy` kullanıcısı + anahtar → ikinci bir SSH oturumunun açıldığı doğrulanır → değişiklik →
  `sudo sshd -t && sudo systemctl reload ssh`.
- ✋ **UFW:** 22, 80, 443 ve 8443 açık kalır. **8443'ün kapatılması patron kararıdır** (CloudPanel paneli).
  Yeni kural eklenmeden önce `ufw status numbered` çıktısı kaydedilir. Giden trafik kuralı ölçülerek bakılır.
- ✋ **Swap:** Miktar ölçümle (`free -h`) belirlenir; 16 GB RAM için bir öneri vardır ama karar patrondadır.
  Örnek (boyut `<boyut>` yer tutucu): `sudo fallocate -l <boyut> /swapfile`, `chmod 600`, `mkswap`, `swapon`,
  `/etc/fstab`'a `/swapfile none swap sw 0 0`. Kanıt: `swapon --show`.
- ✋ **Docker Engine ve Compose eklentisi:** yoksa resmî depodan kurulur; varsa yalnız sürüm kaydedilir.
- ✋ **`deploy` kullanıcısı:** yoksa oluşturulur, `docker` grubuna eklenir. Root ile günlük iş yapılmaz.
- ✋ Host araçları (yedek ve migrasyon için; yalnız yerel prova ya da DB-1 host psql için): `postgresql-client-16`
  (`pg_dump` sürümü sunucu ile aynı ya da yeni), `awscli` v2, `age`, `perl`. Kurulum.
- ✋ Depo: `/opt/fonbridge` altına dev'in onaylanmış commit'i (`git clone` + `git checkout <commit>`).
  Sunucuda geliştirme yapılmaz; güncellemeler `git fetch` + `checkout` ile.

## 2. Gizli değerler ve yapılandırma dosyaları (sunucuda, repoya yazılmaz)

Dört dosya, hepsi git'e girmez (`.gitignore`: `.env*`):

- `deploy/vps/.env.prod` (izin 600) — uygulama sırları. **Yalnız web ve worker** konteynerleri alır.
- `deploy/vps/.env.db` (izin 600) — **DB-1'de (canlı) yalnız tek satır: `OWNER_DATABASE_URL`** (Supabase, sahip rol).
  `POSTGRES_PASSWORD` ve süper kullanıcı satırları DB-1'de OLMAZ. Yerel provada (profile `db`) yalnız `postgres`
  konteyneri bu dosyayı `env_file` ile okur (compose `postgres` servisi; `POSTGRES_PASSWORD` dahil). `ops.sh` bu
  dosyadan yalnız `OWNER_DATABASE_URL` okur (`db_value`); parolayı okumaz. Web ve worker'ın ortamına girmez (FO-301 Y-5).
- `deploy/vps/.env` (izin 600) — **yalnız compose interpolasyonu**: `WEB_HOST_PORT`, `PG_HOST_PORT`.
  Compose bu dosyayı proje dizininden (`deploy/vps/`) otomatik okur. Container'lara girmez.

**WEB_HOST_PORT (NG-261 O-1):** değer `.env.prod`'da değil, `deploy/vps/.env` içindedir. Nedeni: compose
`env_file` ile container ortamını doldurur ama `ports:` içindeki `${WEB_HOST_PORT}` interpolasyonunu **okumaz**;
`.env.prod`'a yazılan port değişmez ve CloudPanel yanlış porta bağlanır (502). Tek yol budur:

```bash
cd /opt/fonbridge
✋ printf 'WEB_HOST_PORT=3000\n' > deploy/vps/.env && chmod 600 deploy/vps/.env
docker compose -f deploy/vps/docker-compose.prod.yml config | grep -A3 'fonbridge-web' | grep published
# beklenen: published: "3000"  (başka port istenirse yalnız .env değişir ve CloudPanel hedefi aynı porta çekilir)
```

Yerel prova için aynı mantıkla `PG_HOST_PORT` de yalnız `deploy/vps/.env` içinde olmalıdır.

```bash
cd /opt/fonbridge
✋ cp deploy/vps/.env.prod.example deploy/vps/.env.prod
✋ chmod 600 deploy/vps/.env.prod
✋ $EDITOR deploy/vps/.env.prod         # uygulama değerleri elle doldur
# Yerel prova için ayrıca:
✋ cp deploy/vps/.env.db.example deploy/vps/.env.db && chmod 600 deploy/vps/.env.db
```

Doldururken:

- **Değerleri tırnaksız yazın** (`KEY=değer`, `KEY="değer"` değil). Compose `env_file` tırnağı soyar,
  `ops.sh` soymaz; tırnaklı parola bootstrap'te sessizce yanlış okunur (FO-301 D-8).
- `AUTH_SECRET`: `openssl rand -base64 32` (≥32 karakter).
- `EMAIL_OPTOUT_SECRET`, `CALENDAR_ENCRYPTION_KEY`, `TAX_ID_ENCRYPTION_KEY`: uygulama kodu okur; değerleri
  kodda belgelenen biçimde üretilir ve **kasada** yedeklenir (kaybolursa veriler okunamaz). `AUTH_SECRET`,
  `EMAIL_OPTOUT_SECRET`, `CALENDAR_ENCRYPTION_KEY`, `TAX_ID_ENCRYPTION_KEY` için aynı değer ✋ patron girişi.
- **Veritabanı URL'leri (DB-1, Supabase):** yer tutucular — proje teyidi gelmeden doldurulmaz (§0).
  - `DATABASE_URL`: `postgresql://fabrika_app:<şifre>@<supabase-host>:5432/<veritabani>?sslmode=verify-full&sslrootcert=/app/certs/supabase-prod-ca-2021.crt`
  - `JOBS_DATABASE_URL`: aynı biçim, kullanıcı `fabrika_jobs`.
  - Uygulama rolü `fabrika_app` BYPASSRLS taşımaz; `DATABASE_URL_RLS_TEST` ile aynı şifre.
- **Yerel prova URL'leri (profile `db`):** `postgresql://fabrika_app:<şifre>@postgres:5432/fabrika?schema=public`
  (aynı biçimde `fabrika_jobs`). `OWNER_DATABASE_URL` (`.env.db`): `postgresql://fabrika_owner:<şifre>@postgres:5432/fabrika?schema=public`.
  DB-1'de `OWNER_DATABASE_URL` sahip rolün (`<sahip-rol>`) Supabase URL'idir ve §2 kuralı gereği `.env.db`'de
  tek satır olarak bulunur; `sslrootcert` yolu aynı kalır (`ops.sh` konteyner ve host için yolu ayrı çevirir).
- **`openssl rand -hex 32`** ile üretilen parolalar (yalnız hex): base64'ün `/ + =` karakterleri URL'yi bozar.
  Çıktıyı ekrana yazdırıp kopyalamak yerine doğrudan dosyaya yazın.
- `JOBS_CRON_ENABLED`: ilk kurulumda **`false`**; §5 sırası gereği sonra `true` (✋ worker devri).
- `TRUSTED_PROXY_HOPS=1`: yalnız CloudPanel nginx tek vekil. Nginx ile web arasına Varnish girerse **3**.
  Değer §5.1 madde 3a ölçümüyle doğrulanır; tahmin edilip yazılmaz. Boş bırakılmaz.
- `DEMO_LOGIN_ENABLED`: boş ya da `false`. `true` ise sunucu başlamaz.
- `NEXT_PUBLIC_APP_URL=https://nexagrant.com` ve `AUTH_URL=https://nexagrant.com`.
- `OPENAI_API_KEY`: `docs/RELEASE_CHECKLIST.md` §8 madde 7 — eski anahtar açığa çıktı; yenisini kullan (✋ patron).

Yedek sırları **ayrı dosyada**: `/etc/fonbridge/backup.env` (chmod 600, root). Adları ve amacı
`backup-to-r2.sh` başlığında. Burada uygulama sırları yok. `BACKUP_AGE_RECIPIENT` zorunludur: yoksa
yedek betiği başlamaz ve şifresiz döküm R2'ye gitmez.

Patron girdileri: `ACME` e-posta `info@nexagrant.com` (Caddyfile `email`, yazıldı). Alarm alıcısı
`ALERTS_OPS_EMAIL=info@nexagrant.com` değeridir (sır değil); değişken FO-246 ile gelir, o birleşince
`.env.prod`'a eklenir.

## 3. DNS (✋ patron onayı; yalnız kök kayıt)

**Değiştirilen tek kayıt:** `nexagrant.com` kökü (`@`) için **A** kaydı → `191.96.1.252`, TTL 300.

- **Mevcut değer (19.11.2026 ölçümü):** `@` A → `2.57.91.91` (Hostinger park sayfası, TTL 50). Geri dönüş değeri budur (§7).
- **`www` dokunulmaz:** `www.nexagrant.com` bir **CNAME** → `nexagrant.com`'dur; ayrı A kaydı eklenmez.
- **MX, SPF, DKIM (3 CNAME) ve DMARC dokunulmaz.** E-posta kayıtları yerinde kalır (MX `mx1/mx2.hostinger.com`).
- Kim yapar: lider patrona sordu; uygulayıcı ve zaman ayrıca bildirilir.

Yayılım kontrolü (DNS değişikliğinden sonra; Caddy/CloudPanel sertifikası **bu kontrolden önce alınmaz**):

```bash
dig +short A nexagrant.com @1.1.1.1        # beklenen: 191.96.1.252
dig +short CNAME www.nexagrant.com @1.1.1.1 # beklenen: nexagrant.com.
dig +short MX nexagrant.com @1.1.1.1       # değişmemiş olmalı (mx1/mx2.hostinger.com)
```

Sertifika HTTP-01 için 80 portu dışarıdan açık olmalı (UFW 80 açık kalır). Let's Encrypt hız sınırı için
erken deneme yapılmaz.

## 4. Veritabanı

### 4-A. CANLI (DB-1, Supabase): ilk kurulum ATLANIR

Canlıda Supabase vardır: roller, şema ve pgvector ilk kurulumu zaten yapılmış olarak kabul edilir. Bu yüzden
**canlıda şunlar koşmaz:** `ops.sh bootstrap`, `ops.sh push` (boş veritabanı içindir; Supabase dolu),
`docker compose ... up -d postgres` ve `bootstrap-roles.sql`. Canlıda yalnız §4-C (güncelleme) geçerlidir.

### 4-B. Yerel prova (profile `db`): kurulum

Yalnız yerel prova makinesinde. Canlıya uygulanmaz.

```bash
cd /opt/fonbridge
✋ docker compose -f deploy/vps/docker-compose.prod.yml --profile db up -d postgres
docker compose -f deploy/vps/docker-compose.prod.yml --profile db ps     # postgres: healthy
```

Sıra, `docs/RELEASE_CHECKLIST.md` §3.1 ile aynıdır. Rol modeli: süper kullanıcı `fabrika` yalnız adım 0'da ve
yedekte; şema işleri **sahip rol `fabrika_owner`** ile koşar (`ops.sh` bunu `OWNER_DATABASE_URL`'den yapar);
uygulama rolü `fabrika_app` yalnız adım 7'de (`verify`) kullanılır.

✋ 0. **Roller ve pgvector:** `deploy/vps/ops.sh bootstrap`. Tekrar koşması zararsızdır. Kanıt:
   `docker compose -f deploy/vps/docker-compose.prod.yml --profile db exec postgres psql -U fabrika -d fabrika -c '\du'`
✋ 1. **Şema (boş veritabanı):** `deploy/vps/ops.sh push` (`prisma db push`). Mevcut veritabanında **önce**
   `deploy/vps/ops.sh diff` (salt okur); çıkış 2 = fark var, dur.
✋ 2. **Uygulama rolü:** `deploy/vps/ops.sh rls-role` (`DATABASE_URL_RLS_TEST` dolu olmalı).
✋ 3. **RLS:** `deploy/vps/ops.sh rls`.
✋ 4. **Migrasyonlar:** `deploy/vps/ops.sh migrate` (`apply-migrations.sh`, `apply-order.txt` sırası).
   `prisma migrate deploy` **kullanılmaz** (`prisma.config.ts` reddeder).
✋ 5. **RLS (ikinci kez):** `deploy/vps/ops.sh rls`.
✋ 6. **Seed (K3):** `deploy/vps/ops.sh seed` — yalnız referans veri; demo kiracı yok. FO-251 birleşene kadar çalışmaz.
✋ 7. **Doğrulama:** `deploy/vps/ops.sh verify`. Başarısızsa web açılmaz.

### 4-C. CANLI (DB-1) güncelleme migrasyonu

Önkoşullar — hepsi ✋:

1. Canlı veritabanının Supabase projesi, bölgesi ve host'u **patron tarafından yazılı teyit edilmiş** olmalı (K-584619).
   Teyit sonrası bu belgedeki `<supabase-host>` yer tutucuları yalnız sunucudaki `.env.prod`/`.env.db`'de doldurulur.
2. Yedek: Supabase tarafında geri dönüş noktası alındı mı, patron onayladı mı (§8 uyarlanmadı; K14).
3. Migrasyon listesi repo ile DB'nin farkı salt okur ölçülür.

```bash
cd /opt/fonbridge
# (a) Hangi migrasyonlar listede (yalnız yazdırır; hiçbir şey uygulanmaz)
scripts/apply-migrations.sh --list
# (b) Şema farkı (DB'ye yazmaz; sunucuda geçici worker konteyneri başlatır (`docker compose run --rm`), sahip rol; çıkış 2 = fark var: dur, incele)
deploy/vps/ops.sh diff
# (c) Go-live ön kontrolü R-1 (salt okur; son satır R1_SONUC | TEMIZ/... değilse dur)
deploy/vps/ops.sh r1
# (d) Migrasyon: sahip rolle, host psql; sertifika yolu ops.sh tarafından depo certs/ dizinine çevrilir
✋ deploy/vps/ops.sh migrate
✋ deploy/vps/ops.sh rls
✋ deploy/vps/ops.sh verify          # başarısızsa web'i başlatma
```

- `apply-migrations.sh` idempotenttir: `--list` çıktısındaki tüm dosyalar sırayla koşar, değişmeyenler etkisizdir.
  "Gereken" migrasyon, (a) ile (b) arasındaki farka göre seçilir.
- **DB-1'de `deploy/vps/ops.sh push` ÇALIŞTIRILMAZ** (boş veritabanı içindir; dolu DB'de şema kopyası riski).
- **Bu dalda `add-evidence-scan-status` migrasyonu YOK** (NG-239 kodu). Bu migrasyon, NG-239 birleşmeden
  `apply-order.txt`'te görünmez; §4-C bu nedenle yayın için bloke durumdadır (§5 adım 4).

## 5. Uygulamayı başlat (yalnız ✋ onaylı, yalnız DB-1 teyidinden sonra)

Sıra §3.3 (ADR-0008 §9.2) ile aynıdır: web önce, worker `JOBS_CRON_ENABLED=false` ile, sonra `true`.

**Yayın sırası (NG-239 Ö-4, değiştirilemez):** clamd healthy → web → worker (cron kapalı) → migrasyon
(`add-evidence-scan-status`, `ops.sh migrate`) → süpürme → cron açık → CloudPanel vekili (§5.1, DNS'ten sonra).

```bash
cd /opt/fonbridge
# 1. Tarayıcı (imza indirmesi birkaç dakika; healthy olana kadar bekle)
✋ GIT_REVISION=$(git rev-parse HEAD) docker compose -f deploy/vps/docker-compose.prod.yml up -d --build clamav
docker compose -f deploy/vps/docker-compose.prod.yml ps clamav     # clamav: healthy
# 2a. Doğrulama: sınır ayarı gerçekten yüklü mü (ham çıktıyı rapora koy; sır yok)
docker exec fonbridge-clamav grep -i '^AlertExceedsMax' /etc/clamav/clamd.conf   # beklenen: AlertExceedsMax yes

# 2. Web (imajı derler). Sağlık: GET /api/health 200
✋ GIT_REVISION=$(git rev-parse HEAD) docker compose -f deploy/vps/docker-compose.prod.yml up -d --build web
docker compose -f deploy/vps/docker-compose.prod.yml ps        # web: healthy
WEB_HOST_PORT="$(grep -E '^WEB_HOST_PORT=' deploy/vps/.env 2>/dev/null | cut -d= -f2-)"
curl -s "http://127.0.0.1:${WEB_HOST_PORT:-3000}/api/health"   # {"status":"ok"}  (port deploy/vps/.env'den; yoksa 3000)
# Not: deploy/vps/.env içinde satır sonu yorumu KOYMA (`WEB_HOST_PORT=3101 # yorum` URL'yi bozar: `...:3101 # yorum/api/health`).

# ✋ 3. Worker, cron kapalı. ÖN KOŞUL: K13 (DB-1 teyidi) + K14 (yedek kararı) tamam, patron ayrı onayı.
#    BU ADIM CANLI SUPABASE VERİTABANINA YAZAR: worker ilk açılışta graphile_worker şemasını canlı DB'de kurar
#    (job-queue:cron-disabled uyarısı beklenir). Önkoşul sağlanmadan bu satır çalıştırılmaz.
✋ GIT_REVISION=$(git rev-parse HEAD) docker compose -f deploy/vps/docker-compose.prod.yml up -d --build worker
docker logs fonbridge-worker --tail 50

# 4. BLOKE — migrasyon ve süpürme (NG-239 Ö-4)
#    - Migrasyon: deploy/vps/ops.sh migrate (add-evidence-scan-status). BU DALDA YOK: NG-239 birleşene kadar koşulmaz.
#    - Süpürme: NG-239 kodu (süpürme betiği) bu dalda ve origin/dev'de YOK. Betik adı ve komut uydurulmadı;
#      NG-239 birleşince bu adım o komutla doldurulur.
#    - Beklenen kanıt (NG-239 ile birlikte gelen sayım): süpürme sonrası PENDING satır sayısı 0.
#    - Süpürme, NG-239 Ö-4 düzeltmesi (kiracı başına imleçle döngü) birleşmeden tek tick ile tekrarlanmaz;
#      o düzeltme yoksa cron açılmaz (kalıcı ERROR satırları PENDING'i geciktirir).
#    YAYIN BU ADIMDA DURUR. Adım 4 tamamlanmadan adım 5 yapılmaz.

# 5. Cron'u aç (.env.prod: JOBS_CRON_ENABLED=true), worker'ı yeniden başlat (✋ worker devri, §5.1 sonrası)
✋ docker compose -f deploy/vps/docker-compose.prod.yml up -d --force-recreate worker
```

Kural: `postgres` bu yığında kalkmaz (canlıda Supabase). `caddy` kalkmaz (CloudPanel vekil eder; §5.1).

### 5.1 CloudPanel Reverse Proxy (nexagrant.com) (✋)

CloudPanel nginx'i 80/443'ü ve TLS'i tutar; NexaGrant bir Reverse Proxy sitesi olarak `web`e vekillik eder.
Caddy 80/443'e BAĞLANMAZ. Her vhost değişikliği ✋ ayrı onaylıdır ve `nginx -t` ile biter.

✋ 1. CloudPanel → Sites → **Add Site** → Reverse Proxy; domain `nexagrant.com` (+ `www.nexagrant.com` alias).
   Reverse proxy hedefi: `http://127.0.0.1:<WEB_HOST_PORT>` (varsayılan 3000; değer `deploy/vps/.env`'den okunur).
✋ 2. SSL: CloudPanel → Let's Encrypt. **Önkoşul:** §3'teki `dig` kontrolü kökün `191.96.1.252`'yi gösterdiğini
   onaylamalı; yoksa sertifika denemesi Let's Encrypt hız sınırını yer.
✋ 3. Başlıklar (vhost): `Host $host`, `X-Forwarded-Proto $scheme`, `X-Forwarded-For $proxy_add_x_forwarded_for`.
   `X-Real-IP` kullanılmaz.
   - **3a. `TRUSTED_PROXY_HOPS` ölçümü (canlı, DNS ve sertifikadan sonra; salt okur ölçüm):**
     1. Zincirde Varnish var mı: `ss -ltnp | grep -E ':6081\b'` ve `systemctl is-active varnish 2>/dev/null`.
        Yoksa zincir `istemci → nginx → web`: **değer 1**. Varnish varsa zincir `istemci → nginx → Varnish (6081)
        → nginx (8080) → web`: **değer 3**. Varnish'in CloudPanel vhost'unda kullanılıp kullanılmadığı vhost
        dosyasında (`/etc/nginx/sites-enabled/` altında, yalnız okuma) ölçülür.
     2. Sahte başlık testi (yalnız tetikleme): `curl -s -o /dev/null -w '%{http_code}\n' -H 'X-Forwarded-For: 203.0.113.9' https://nexagrant.com/api/health`.
        HTTP kodu KANIT DEĞİLDİR: 200 dönmesi IP'nin güvenilip güvenilmediğini göstermez, her durumda 200 gelir.
        **Birincil kanıt canlıda doğrudan gözlenemez.** Kodda uygulamanın çözdüğü istemci IP'sini
        (`clientIpFrom`, src/lib/leads/public-lead.ts) yazan bir log alanı YOK: `csp violation` logu yalnız ihlal
        gövdesini yazar (src/lib/csp-report.ts:178); çözülen IP DB'ye yalnız HMAC özeti olarak girer
        (`hashClientIp`, src/lib/leads/public-lead.ts). Bu yüzden kanıt yalnız yerel provada alınır: `clientIpFrom`
        çıktısı (Faz A madde 5; ham çıktı rapora). Beklenen: nginx `$remote_addr` değerini verir, sahte `203.0.113.9`
        değerini vermez.
     3. Değer, ölçümün sonucuna göre `.env.prod`'a yazılır. Ölçüm yapılmadan canlıda değer değiştirilmez.
   - **Varnish notu:** Varnish eklenirse `TRUSTED_PROXY_HOPS` 1'de kalırsa tüm ziyaretçiler `127.0.0.1` sayılır ve
     IP başına sınır ortak dolar. Varnish kararı patron/lider kararıdır; bu paket Varnish'siz tasarlanmıştır.
✋ 4. **`client_max_body_size 25m;`** (✋ vhost değişikliği). Gerekçe: kanıt dosyası üst sınırı 25 MiB
   (`src/lib/storage.ts` EVIDENCE_MAX_BYTES) üretimde R2'ye presigned PUT ile gider ve nginx'ten geçmez. Nginx'ten
   geçen en büyük yükleme M17/RAG belge yüklemesidir (`/api/admin/documents/upload`, 20 MiB; multipart ek yükü
   için 25 MiB'lık tavan). Değer uygulama sınırından küçük olmamalı (küçükse 413 meşru yüklemeyi keser).
   - Doğrulama (canlı, ✋): `nginx -T 2>/dev/null | grep client_max_body_size` → `25m`.
   - 413 testi: `head -c 26M /dev/zero > <geçici-dosya>` (26 MiB, yerel), ardından
     ✋ `curl -s -o /dev/null -w '%{http_code}\n' -X POST -H 'Content-Type: application/octet-stream' --data-binary @<geçici-dosya> https://nexagrant.com/api/admin/documents/upload`
     → beklenen **413** (nginx reddeder). 21 MiB'lık dosya ile aynı uç noktaya beklenen: **413 dışında** bir kod
     (oturumsuz istek 401/403 dönebilir; önemli olan 413 olmaması). Geçici dosya testten sonra silinir.
✋ 5. `www` → kök tek 301: `www.nexagrant.com` için ayrı bir 301 site ya da vhost yönlendirmesi; iki sıçrama olmasın.
   Doğrulama: `curl -sI http://www.nexagrant.com` → `301` ve `Location: https://nexagrant.com/`.
6. **HSTS tek başlık (NG-124):** HSTS'i **uygulama** gönderir (`src/lib/security-headers.ts` `hstsHeaderFor`,
   production + HTTPS). CloudPanel vhost'una `add_header Strict-Transport-Security` **EKLENMEZ**: iki başlık olur.
   Doğrulama (✋ DNS ve sertifikadan sonra): `curl -sI https://nexagrant.com/ | grep -ci strict-transport` → **1**.
   Değer/süre (K6) patron kararı; uygulamadaki değer geçerlidir.
7. Yan etki kontrolü: öteki 16 sitenin vhost'larına, CloudPanel ayarlarına ve `default.conf`'a dokunulmaz.
   Değişiklik öncesi/sonrası `nginx -t` ve öteki sitelerin HTTP durumu aynı komutla karşılaştırılır.

Geri alma (vekil): CloudPanel'de NexaGrant Reverse Proxy sitesini sil; DNS kökünü geri al (§7). Öteki siteler etkilenmez.

- Caddy kullanılmaz (profile `caddy`); Caddy kalksa bile HSTS eklemez (Caddyfile yorumu).
- Worker devri (§5 adım 5, ✋): önce Hostinger Cloud'daki eski `nexagrant.com` cron'u (varsa) kapatılır; sonra
  VPS'te `JOBS_CRON_ENABLED=true`. İkisi aynı anda çalışmaz (çift iş).
- ✋ **CORDIS içe aktarımı (ayrı onay, her çalıştırma için):** canlı Supabase'e büyük yazma ve worker durdurma.
  Ön koşul: K13 + K14 tamam. Bu satırın onayı §5 ve §6 onaylarını kapsamaz.
- **CORDIS içe aktarımı panelden yapılmaz** (`src/app/[locale]/admin/cordis/actions.ts` web sürecinde
  4,7 GB tepe ölçüldü). Tek seferlik konteyner, worker durdurulmuş, sahip rolle, bellek sınırı 5 GB:
  ```bash
✋   docker compose -f deploy/vps/docker-compose.prod.yml stop worker
  # Yalnız sahip URL'i host ortamına alınır (.env.db'nin tamamı ya da POSTGRES_PASSWORD konteynere girmez, FO-308 D-11).
  export OWNER_DATABASE_URL="$(grep -E '^OWNER_DATABASE_URL=' deploy/vps/.env.db | cut -d= -f2-)"
✋   docker run --rm --memory 5g --network fonbridge_default \
    --env-file deploy/vps/.env.prod -e OWNER_DATABASE_URL \
    fonbridge-worker:local sh -c \
    'export DATABASE_URL="$OWNER_DATABASE_URL"; exec node_modules/.bin/tsx scripts/cordis-import.ts "$@"' sh <argümanlar>
  unset OWNER_DATABASE_URL
✋   docker compose -f deploy/vps/docker-compose.prod.yml up -d --no-build worker
  ```
  Parola komut satırına girmez: `-e OWNER_DATABASE_URL` değeri host ortamından alır (argv'de yalnız ad vardır).
  DB-1'de `OWNER_DATABASE_URL` Supabase URL'idir ve ✋ teyit gerektirir. `fonbridge-worker:local` GÜNCEL revision
  ile derlenmiş olmalı (§6 adım 3). Konteyner `--rm` ile silinir. Akışlı okumaya geçiş ayrı bir karttır.
- İlk gün admin `/[locale]/admin/alerts` ekranında `job-queue` ve worker log'u kontrol edilir
  (RELEASE_CHECKLIST §3.3 madde 5).

## 6. Güncelleme (deploy) (✋ her güncelleme ayrı onay; DB-1 şeması değişiyorsa §4-C de)

Her güncelleme ayrı bir patron onayı ister; onay bir güncellemeyi kapsar, sonrakini değil. Aşağıdaki ✋ satırları
(yedek kontrolü, worker durdurma, derleme, başlatma) onaysız koşulmaz.

Yeni bir commit için (sıra `docs/RELEASE_CHECKLIST.md` §3.1 ile aynı; 0a ve 2a atıfları orada):

```bash
cd /opt/fonbridge
# ✋ 0. Yedek (§8.1, DB-1 için Supabase yedek teyidi) bu güncellemeden önce alındı mı? Yoksa dur.
#    0'ın onayı gelmeden aşağıdaki ✋ satırlardan HİÇBİRİ çalıştırılmaz: canlı ağaç ve imaj değişmez.
# ✋ 0a. Yeni commit'i çek (canlı çalışma ağacı değişir; yalnız 0 onaylandıktan sonra)
✋ git fetch --all --prune && git checkout <yeni-commit>
# ✋ 0b. Geri alma için imajı etiketle (canlı imaj deposunu değiştirir; yalnız 0 onaylandıktan sonra)
✋ docker tag fonbridge-web:local fonbridge-web:prev   2>/dev/null || true
✋ docker tag fonbridge-worker:local fonbridge-worker:prev 2>/dev/null || true
# ✋ 1. Eski worker'ı durdur (RELEASE_CHECKLIST §3.1 adım 2a): stop -t 300, sonra kilitli iş sayısı 0
✋ docker compose -f deploy/vps/docker-compose.prod.yml stop -t 300 worker
# ✋ 3. Yeni imajları ÖNCE derle (FO-301 Y-6). GIT_REVISION (FO-308 R-1) zorunlu.
#    Derleme sırasında worker durmuş olmalı (Y-2: derleme tepesi 2 vCPU / 8 GB'da worker ile birlikte taşabilir).
✋ GIT_REVISION="$(git rev-parse HEAD)" docker compose -f deploy/vps/docker-compose.prod.yml build web worker
# ✋ 4. Şema değiştiyse: §4-C adımları (DB-1 ✋). DB-1'de `ops.sh push` YOK.
# ✋ 5. Başlat (imajlar adım 3'te derlendi; --no-build ile yeniden derlenmez)
✋ docker compose -f deploy/vps/docker-compose.prod.yml up -d --no-build web
✋ docker compose -f deploy/vps/docker-compose.prod.yml up -d --no-build worker
docker compose -f deploy/vps/docker-compose.prod.yml ps
```

Şema değişmediyse §4-C adımları atlanır; yalnız `stop`, `build`, `up -d --no-build` çalışır. Her güncellemeden
önce §8'deki yedek (en az bir gün önceki) elde olmalı.

## 7. Geri alma (rollback) (✋ her geri alma ayrı onay)

Her geri alma adımı canlıyı değiştirir; her biri ayrı patron onayı gerektirir. Onay bir geri almayı kapsar.

Uygulama geri alma (şema değişmediyse):

```bash
cd /opt/fonbridge
✋ docker compose -f deploy/vps/docker-compose.prod.yml stop worker
✋ git checkout <önceki-commit>
✋ docker tag fonbridge-web:prev fonbridge-web:local
✋ docker tag fonbridge-worker:prev fonbridge-worker:local
✋ docker compose -f deploy/vps/docker-compose.prod.yml up -d --no-build web worker
```

Şema da geri alınacaksa: önce worker durdurulur, sonra migrasyonların `.down.sql` dosyaları **ters
sırada** uygulanır (DB-1'de ✋ patron onayı; Supabase geri dönüş noktası §4-C önkoşulu):

```bash
✋ DATABASE_URL=<url> scripts/apply-migrations.sh --down <dosya>.down.sql
```

`docs/RELEASE_CHECKLIST.md` §3.2 ve §3.3 geri dönüş notları (ör. `m4-double.sql`) uygulanmadan geri dönüş yapılmaz.
Geri dönüşü 07:00–13:00 UTC dışında yap (§3.3).

**DNS geri dönüşü (✋ patron onayı):** yalnız kök `@` A kaydı önceki değere döndürülür: **`2.57.91.91`**
(Hostinger park sayfası; 19.11.2026 ölçümü, TTL 50). Kayıt değiştikten sonra kontrol:
`dig +short A nexagrant.com @1.1.1.1` → `2.57.91.91`. MX, SPF, DKIM, DMARC ve `www` CNAME dokunulmaz.
Vekil (§5.1) önce kaldırılır ya da DNS geri alınır; ikisi birden değişmez.

## 8. Yedek ve geri yükleme

**Canlı (DB-1) için durum:** §8 betikleri yerel bir süper kullanıcıya (`BACKUP_DATABASE_URL`, `127.0.0.1`) bakar.
DB-1 (Supabase) için uyarlanmadı. Supabase'in yedek politikası ve bu veritabanı için ayrı bir yedek kararı
**✋ patron kararıdır** (K14). Bu bölüm, DB-1 için yedek alındığını varsaymaz.

### 8.1 Günlük yedek (kur; yalnız yerel prova veya uyarlamadan sonra)

```bash
✋ sudo install -m 600 /dev/null /etc/fonbridge/backup.env   # sonra değerleri doldur
✋ sudo install -m 644 /opt/fonbridge/deploy/vps/fonbridge-backup.cron /etc/cron.d/fonbridge-backup
```

`/etc/fonbridge/backup.env` içinde: `BACKUP_DATABASE_URL` (süper kullanıcı `fabrika`, `127.0.0.1`),
`BACKUP_AGE_RECIPIENT` (açık anahtar), `R2_ACCOUNT_ID`, `R2_BACKUP_BUCKET`, `AWS_ACCESS_KEY_ID`,
`AWS_SECRET_ACCESS_KEY`. R2 token'ı **yalnız yedek kovasına yazabilen** ayrı bir token olmalı.

Elle bir kez koş ve çıktıyı gör:

```bash
✋ sudo /opt/fonbridge/deploy/vps/backup-to-r2.sh
# beklenen: "ok: fonbridge-<damga>.dump.age <n> bayt R2'de doğrulandı"
```

Kanıt olarak log satırını rapora koy. Başarısız cron çıkış kodunu `/var/log/fonbridge-backup.log`'a yazar;
dış kalp atışı (RELEASE_CHECKLIST §5.3) patron kararıdır.

**Saklama:** yerelde 7 gün (betik). R2 kovasında yaşam döngüsü kuralı (ör. 7/28/365 gün) Cloudflare
panelinde tanımlanır; betik bu katmanları kendisi uygulamaz.

### 8.2 Geri yükleme (provası, ayda bir; yerel)

✋ Önce `fabrika_app` rolü (§4-B adım 2) ve boş bir hedef veritabanı (`createdb -O fabrika fabrika_restored`).
Şifreli dökümler (`.age`) önce `age -d -i <özel-anahtar>` ile çözülür; özel anahtar sunucuda **bulunmaz**,
patron kasasından geçici olarak alınır.

```bash
# Prova: geçici DB'ye yükler, satır sayılarını karşılaştırır (kendi DB'sini kendisi kurar/siler)
✋ RESTORE_ADMIN_URL=postgresql://fabrika@127.0.0.1:5432/postgres \
BACKUP_DATABASE_URL=postgresql://fabrika@127.0.0.1:5432/fabrika \
✋   bash scripts/backup/pg-restore-drill.sh <dump>
# (parolalar PGPASSWORD ya da ~/.pgpass ile; URL'lerde yazılmaz.)
# Gerçek geri yükleme (felaket): YALNIZ boş hedef DB; betik DB oluşturmaz, dolu hedefi reddeder
✋ RESTORE_DATABASE_URL=postgresql://fabrika@127.0.0.1:5432/fabrika_restored bash scripts/backup/pg-restore.sh <dump>
```

Prova iki şeyi karşılaştırır: tablo başına satır sayısı ve örnek kayıt (tablo başına satır metnine göre sıralı
ilk `DRILL_SAMPLE_ROWS` satırın md5'i, varsayılan 5; `0` kapatır). Sayı eşit, içerik farklıysa da düşer.
Her koşu, geçse de düşse de `RESTORE_DRILL_LOG` dosyasına (varsayılan `$BACKUP_DIR/restore-drill.log`) bir
satır ekler: başlangıç ve bitiş (UTC), süre (sn), `ok|fail`, döküm adı, tablo sayısı, düşme nedeni. Bağlantı
dizesi ve parola bu dosyaya yazılmaz. Aylık kayıt bu dosyadır; satırı ay sonunda rapora koy.

**Takvim:** her ayın 1'i 10:00 UTC, elle (✋). Otomatik cron önerilmez: provanın şifreli dökümü çözmesi
için `age` özel anahtarı gerekir ve bu anahtar sunucuda bulunmaz (§8.1). Hatırlatma için bir takvim girdisi
yeterli. Anahtar ileride ayrı bir prova makinesinde tutulursa o makinede şu satır kullanılabilir:
`0 10 1 * * root <çöz-ve-prova-betiği> >> /var/log/fonbridge-restore-drill.log 2>&1` (her ayın 1'i).
Bu satır bu pakette kurulu değil.

✋ Sonra hedef DB'ye karşı `rls` ve `verify` (ops.sh'ın DATABASE_URL'ini o DB'ye çevirerek), uygulamayı yeni DB'ye
bağla, giriş yap. Süreyi yaz (RTO ölçümü). `docs/RELEASE_CHECKLIST.md` §4.2 ve §4.4 ayrıntılı adımları verir.

## 9. İzleme

- `docker stats --no-stream` — 1 hafta boyunca günde bir kez kaydet (bellek sınırlarının doğrulanması).
  Hedef (web ve worker): ~1,5 GB altı. Postgres hedefi (~2 GB) yalnız yerel prova içindir; canlıda Postgres yok.
- `docker compose … logs --tail 200 web worker` — hata satırları için.
- Log dönüşümü: her servis için `json-file` 10 MB × 5 (compose'da tanımlı).
- Uygulama alarmları: `SystemAlert` yalnız `/[locale]/admin/alerts` ekranında (RELEASE_CHECKLIST §5.1).
  E-posta/push bildirimi ve dış uptime izleyici patron kararı (§5.2).
- Disk: **200 GB** (KVM 4). Yedek + imajlar + DB-1 dışı veri. ✋ `docker image prune` haftalık (manuel, kanıtla).

## 10. Açık kararlar (patron)

| # | Konu | Neden |
|---|---|---|
| K1 | `nexagrant.com` kökü `@` A kaydı → `191.96.1.252` (DNS, ✋) | CloudPanel sertifikası ve yayın için şart (§3) |
| K2 | `CALENDAR`/`EXPERT_PREREG_IP_SALT` ve diğer sırlar değerleri | Sunucuda elle girilir |
| K3 | Canlıda seed: **karar verildi (lider, FO-250): referans veri zorunlu, demo yok.** `SEED_DEMO=false`; ayrım FO-251'de (fe-fb) | `ops.sh seed` FO-251 birleşene kadar kendi kapısıyla çalışmaz |
| K4 | `ensure_rls` olay tetikleyicisi: **karar verildi (lider, FO-250): kurulmaz.** Güncellemede `ops.sh rls && ops.sh verify` zorunlu (§6) | Tetikleyici sistem geneli tabloları da etkiler; RLS denetimi `rls:verify` ile ölçülür |
| K5 | Yerel prova Postgres'inin TLS'siz (yalnız iç ağ) kalması | Canlıda DB-1 TLS (verify-full) ile bağlanır; bu yalnız yerel provayı kapsar |
| K6 | HSTS değeri/süresi (`max-age`) | Uygulama gönderir (NG-124); değer patron kararı |
| K7 | ACME e-posta adresi: Caddyfile `email` = `info@nexagrant.com` (Caddy profili); CloudPanel Let's Encrypt e-postası ayrıca girilir (✋, değer patron) | Sertifika süresi uyarıları |
| K8 | R2 yedek kovası ve yazma-token'ı; `age` açık anahtarı | §8.1 |
| K9 | Dış kalp atışı ve uptime izleyici | §5.3, §9 |
| K10 | RPO/RTO hedefi (öneri RPO ≤ 24 sa, RTO ≤ 4 sa) | RELEASE_CHECKLIST §4.2 |
| K11 | Alan adı tutarlılığı: docs/RELEASE_CHECKLIST.md ve docs/SMTP-SUNUCU.md `fonbridge.com` diyor, kod ve bu paket `nexagrant.com` | Ayrı temizlik işi; bu pakette nexagrant.com kullanıldı |
| K12 | `fabrika_owner` BYPASSRLS mi (öneri: evet) | FORCE RLS altında migrasyon/seed/verify için satır görmesi gerekir; `fabrika_app` BYPASSRLS'siz kalır |
| K13 | **DB-1 Supabase projesi, bölgesi ve host'u** (K-584619; kart "EU" diyor, bağlı tek proje Tokyo'da) | Teyit olmadan DB-1 komutları ve `.env` değerleri yazılmaz (§0) |
| K14 | **DB-1 yedek politikası** (Supabase geri dönüş noktası; §8 uyarlaması) | DB-1 için çalışan yedek yok varsayımı yapılmaz (§8) |
| K15 | Nginx ile web arasında Varnish olup olmayacağı (`TRUSTED_PROXY_HOPS` 1 mi 3 mü) | §5.1 madde 3a |
| K16 | UFW'de 8443 (CloudPanel paneli) açık mı kapalı mı | §1; yalnız patron |

Python CORDIS servisi (`workers/cordis`) bu yığında **yok**: Dockerfile yok ve giriş noktası tutarsız
(`package.json` `worker:dev` `app:app` diyor, dosya `main.py`). Ayrı kart.

## 11. Yerel doğrulama (sunucu dışı)

Yapılanlar ve sonuçları ilgili kart raporlarında:
- `docker compose -f deploy/vps/docker-compose.prod.yml config -q` (varsayılan, `--profile db`, `--profile caddy`) → rapor
- `caddy validate` (caddy:2-alpine) → geçerli (FO-244 raporu)
- `docker build --target runner` yerelde denendi (FO-244 raporu)
- FO-302 (Y-5/Y-6/D-7..D-9): `.env.db` ayrımı; geçici `pgvector:pg16` üzerinde bootstrap → diff → push →
  rls-role → rls → migrate → rls → verify zinciri geçti (FO-302 raporu)

Yapılmayanlar: sunucu kurulumu, DNS, gerçek sertifika, canlı veritabanı (DB-1), R2 yedek yazımı, Hostinger,
yerel nginx ile çalışan tam prova (Faz A madde 5; ayrı kanıt).
