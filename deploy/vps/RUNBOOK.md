# VPS runbook — Hostinger KVM 2 (FO-244)

Kapsam: Hostinger **KVM 2**, Frankfurt, Ubuntu 24.04, 2 vCPU / 8 GB RAM / 100 GB disk.
Üzerinde Docker ile: Caddy (80/443), web, worker, Postgres 16 + pgvector. Redis yok.
Alan adı: **nexagrant.com** (FO-233).

> **Bu dosya bir hazırlık belgesidir, kurulum değildir.** Sunucu oluşturulmadı, Hostinger'da hiçbir
> şey değiştirilmedi, DNS'e dokunulmadı. Aşağıdaki her "yap" adımı **patron onayıyla** ve
> sunucuda, patronun ya da onun yetkilendirdiği kişinin elinde koşar. Canlıya geçiş açık onay gerektirir
> (`docs/RELEASE_CHECKLIST.md` §8 madde 14).

Dosyalar (hepsi `deploy/vps/` altında):

| Dosya | İş |
|---|---|
| `docker-compose.prod.yml` | canlı yığın (web, worker, postgres, caddy) |
| `Caddyfile` | nexagrant.com TLS + www → kök 301 |
| `.env.prod.example` | değişken ADLARI; değer yok. Sunucuda `.env.prod` olarak kopyalanır |
| `.env.db.example` | veritabanı sır ADLARI (`POSTGRES_PASSWORD`, `OWNER_DATABASE_URL`); değer yok. Sunucuda `.env.db` olarak kopyalanır, yalnız postgres ve `ops.sh` okur |
| `backup-to-r2.sh` | günlük `pg_dump` → yerel → R2 + boyut doğrulama |
| `fonbridge-backup.cron` | `/etc/cron.d` girdisi (01:30 UTC) |
| `bootstrap-roles.sql` | ilk kurulum rolleri: `fabrika_owner` (sahip), `fabrika_jobs` (worker), pgvector (`ops.sh bootstrap` koşturur) |
| `ops.sh` | tek seferlik DB işleri: `bootstrap`, `r1`, `diff`, `push`, `rls-role`, `rls`, `migrate`, `seed`, `verify` |

---

## 0. Önce bilinmesi gerekenler

- **Sağlık kontrolü:** `/api/health` diye bir uç **yok** (repoda route bulunmadı). Compose sağlık
  kontrolü `GET /` üzerinden yapılır. Ayrı bir health endpoint'i eklemek uygulama kodu değişikliğidir,
  ayrı bir karttır.
- **Yönetilen veritabanı yok:** Postgres bu sunucuda, konteynerde. Sağlayıcının otomatik yedeği yok;
  yedek §8'deki betikle alınır.
- **DB bağlantısı TLS'siz ama yalnız iç ağda:** Postgres 127.0.0.1'e yayınlı, web/worker aynı compose
  ağında `postgres:5432` üzerinden konuşur. `docs/RELEASE_CHECKLIST.md` §2.1'deki `verify-full` CA
  kuralı Supabase içindi; kendi konteyner Postgres'imiz için `sslmode` verilmez. Bu bir karar; patron
  onaylamalı (§10).
- **`docker compose config` sırları ekrana basar.** Çıktıyı paylaşma, log'a koyma.

---

## 1. Sunucu hazırlığı (patron, Hostinger panelinde sunucu alındıktan sonra)

1. Sunucuya **yalnız SSH anahtarıyla** gir; parola girişini kapat. Root ile günlük iş yapma.
   `/etc/ssh/sshd_config` (ya da `/etc/ssh/sshd_config.d/99-fonbridge.conf`):
   ```
   PasswordAuthentication no
   PermitRootLogin no
   ```
   Sonra `sudo sshd -t && sudo systemctl reload ssh`. Kendi oturumunu kapatmadan önce ikinci bir SSH
   oturumunun açıldığını doğrula (kilitlenme riski).
1a. **Swap (4 GB):** 8 GB RAM'de tepe yük (derleme, bellek sıçraması) için. `fallocate -l 4G /swapfile`,
   `chmod 600 /swapfile`, `mkswap /swapfile`, `swapon /swapfile`, `/etc/fstab`'a `/swapfile none swap sw 0 0`.
   Kanıt: `swapon --show`.
2. Güvenlik duvarı (UFW): `OpenSSH`, `80/tcp`, `443/tcp` açık; gerisi kapalı. Postgres 5432 dışarıya
   **açılmaz** (compose onu zaten yalnız 127.0.0.1'e yayınlar).
   ```bash
   sudo ufw default deny incoming
   sudo ufw default allow outgoing
   sudo ufw allow OpenSSH
   sudo ufw allow 80/tcp
   sudo ufw allow 443/tcp
   sudo ufw enable
   sudo ufw status verbose
   ```
3. Docker Engine (resmî depo) ve Compose eklentisi kur; `deploy` adlı bir kullanıcı oluştur, `docker`
   grubuna ekle.
4. Host araçları (yedek ve migrasyon için):
   - `postgresql-client-16` (PGDG deposu; `pg_dump` sürümü sunucuyla aynı ya da yeni olmalı)
   - `awscli` v2 (R2 S3 uyumlu API için)
   - `age` (yedek şifreleme)
   - `perl` (`shasum` için; Ubuntu'da genelde kurulu)
5. Depo: `/opt/fonbridge` altına dev'in onaylanmış commit'i (`git clone` + `git checkout <commit>`).
   Sunucuda geliştirme yapılmaz; güncellemeler `git fetch` + `checkout` ile.
6. Tarih/saat: `timedatectl` ile UTC doğrula (yedek ve cron saatleri UTC).

## 2. Gizli değerler (sunucuda, repoya yazılmaz)

İki ayrı dosya, ikisi de `chmod 600`, ikisi de git'e girmez:

- `deploy/vps/.env.prod` — uygulama sırları. **Yalnız web ve worker** konteynerleri alır.
- `deploy/vps/.env.db` — süper kullanıcı parolası ve sahip rol (`OWNER_DATABASE_URL`, BYPASSRLS).
  **Yalnız postgres konteyneri ve `ops.sh` okur**; web ve worker'ın ortamına girmez (FO-301 Y-5).

```bash
cd /opt/fonbridge
cp deploy/vps/.env.prod.example deploy/vps/.env.prod
cp deploy/vps/.env.db.example deploy/vps/.env.db
chmod 600 deploy/vps/.env.prod deploy/vps/.env.db
$EDITOR deploy/vps/.env.prod         # uygulama değerleri elle doldur
$EDITOR deploy/vps/.env.db           # POSTGRES_PASSWORD ve OWNER_DATABASE_URL
```

Doldururken:

- **Değerleri tırnaksız yazın** (`KEY=değer`, `KEY="değer"` değil). Compose `env_file` tırnağı soyar,
  `ops.sh` soymaz; tırnaklı parola bootstrap'te sessizce yanlış okunur (FO-301 D-8).
- `AUTH_SECRET`: `openssl rand -base64 32` (≥32 karakter).
- **`POSTGRES_PASSWORD` ve üç rol parolası için `openssl rand -hex 32`** — base64'ün `/ + =` karakterleri
  `postgresql://…` URL'sini bozar. Çıktıyı ekrana yazdırıp kopyalamak yerine doğrudan dosyaya yaz:
  `openssl rand -hex 32 | sed 's/^/POSTGRES_PASSWORD=/' >> deploy/vps/.env.db` (ayrıca kopyası parola kasasında).
- `OWNER_DATABASE_URL` (`.env.db`): `postgresql://fabrika_owner:<şifre>@postgres:5432/fabrika?schema=public`
  (sahip rol; süper kullanıcı değil). `ops.sh bootstrap` rolü bu URL'nin parolasıyla kurar.
- `DATABASE_URL`: `postgresql://fabrika_app:<şifre>@postgres:5432/fabrika?schema=public`
  (uygulama rolü; `BYPASSRLS` yok). Şifre, `DATABASE_URL_RLS_TEST` ile **aynı** olmalı (§4, rol kurulumu
  bu değişkenin şifresini kullanır ve mevcut rolün şifresini değiştirmez).
- `JOBS_DATABASE_URL`: `postgresql://fabrika_jobs:<şifre>@postgres:5432/fabrika?schema=public`
  (worker'ın `graphile_worker` şeması; `CREATE ON DATABASE`, `BYPASSRLS` yok). Boş bırakılmaz.
- Tüm bu URL'lerde parola yalnız hex olsun (yukarıdaki `openssl rand -hex 32`).
- `JOBS_CRON_ENABLED`: ilk kurulumda **`false`**; §4'teki sıra gereği sonra `true`.
- `TRUSTED_PROXY_HOPS=1` (Caddy tek vekil; boş bırakma).
- `DEMO_LOGIN_ENABLED`: boş ya da `false`. `true` ise sunucu başlamaz.
- `NEXT_PUBLIC_APP_URL=https://nexagrant.com`.
- `OPENAI_API_KEY`: `docs/RELEASE_CHECKLIST.md` §8 madde 7 — eski anahtar açığa çıktı; yenisini kullan.

Yedek sırları **ayrı dosyada**: `/etc/fonbridge/backup.env` (chmod 600, root). Adları ve amacı
`backup-to-r2.sh` başlığında. Burada uygulama sırları yok. `BACKUP_AGE_RECIPIENT` zorunludur: yoksa
yedek betiği başlamaz ve şifresiz döküm R2'ye gitmez.

Patron girdileri: `ACME` e-posta `info@nexagrant.com` (Caddyfile `email`, yazıldı). Alarm alıcısı
`ALERTS_OPS_EMAIL=info@nexagrant.com` değeridir (sır değil); değişken FO-246 ile gelir, o birleşince
`.env.prod`'a eklenir.

## 3. DNS ve sertifika (patron onayı)

1. nexagrant.com ve www.nexagrant.com için **A** kaydı → VPS IPv4. TTL 300.
2. Yayılımı kontrol et (Caddy'yi başlatmadan önce; yoksa Let's Encrypt hız sınırı yenir):
   ```bash
   dig +short A nexagrant.com @1.1.1.1
   dig +short A www.nexagrant.com @1.1.1.1
   ```
   İkisi de VPS IP'sini göstermeden §5'in son adımına geçme.
3. Caddy 80 ve 443'ü dinler; HTTP-01 doğrulaması için 80 dışarıdan açık olmalı.

## 4. Veritabanı ilk kurulumu (sıra önemli)

Tüm adımlar aynı sunucuda, `/opt/fonbridge` içinden. Postgres önce ayağa kalkar:

```bash
cd /opt/fonbridge
docker compose -f deploy/vps/docker-compose.prod.yml up -d postgres
docker compose -f deploy/vps/docker-compose.prod.yml ps        # postgres: healthy
```

Sıra, `docs/RELEASE_CHECKLIST.md` §3.1 ile aynıdır. Rol modeli: süper kullanıcı `fabrika` yalnız
adım 0'da ve yedekte; şema işleri (adım 2–6) **sahip rol `fabrika_owner`** ile koşar (`ops.sh` bunu
`OWNER_DATABASE_URL`'den yapar); uygulama rolü `fabrika_app` yalnız adım 7'de (`verify`) kullanılır.

**Fark (`scripts/db-setup.sh` ile):** `ensure_rls` olay tetikleyicisi bu kurulumda **kurulmaz** (K4
kararı). RLS yalnız `ops.sh rls` ile kurulur; her güncellemede `ops.sh rls` ve `ops.sh verify` zorunludur
(§6).

Her adım öncesi kontrol edilir; canlıda hiçbir adım atlanmaz:

0. **Roller ve pgvector (yalnız ilk kurulum):** `deploy/vps/ops.sh bootstrap`. `fabrika_owner`
   (süper kullanıcı değil, BYPASSRLS, CREATEROLE), `fabrika_jobs` (CONNECT + CREATE ON DATABASE) ve
   `vector` uzantısını kurar; veritabanı sahipliğini `fabrika_owner`'a verir. Parolalar
   `OWNER_DATABASE_URL` ve `JOBS_DATABASE_URL`'den okunur. Tekrar koşması zararsızdır (var olan
   roller değişmez). Kanıt: `docker compose -f deploy/vps/docker-compose.prod.yml exec postgres psql -U fabrika -d fabrika -c '\du'`
   — `fabrika_owner`, `fabrika_jobs`, `fabrika_app` (adım 3'ten sonra) görünmeli, `fabrika` süper kullanıcı.
1. **Şema (boş veritabanı):** `deploy/vps/ops.sh push` (`prisma db push`, sahip rol). Mevcut bir
   veritabanına karşı **önce** fark ölçülür (salt okur, sahip rol):
   ```bash
   deploy/vps/ops.sh diff
   ```
   `--accept-data-loss` **kullanılmaz** (RELEASE_CHECKLIST §3.1 madde 1). Çıkış 2 = fark var: dur, incele.
2. **Uygulama rolü:** `deploy/vps/ops.sh rls-role`. `DATABASE_URL_RLS_TEST` `.env.prod`'da dolu olmalı
   (ops reddeder). Rolü sahip rolle kurar ve grant'leri uygular; mevcut rolün şifresi değişmez.
3. **RLS:** `deploy/vps/ops.sh rls` (sahip rol).
4. **Migrasyonlar:** `deploy/vps/ops.sh migrate` (host psql, `OWNER_DATABASE_URL`, `apply-migrations.sh`,
   `apply-order.txt` sırası). `prisma migrate deploy` **kullanılmaz** (`prisma.config.ts` reddeder).
5. **RLS (ikinci kez):** `deploy/vps/ops.sh rls` — migrasyonların eklediği tablolar için.
6. **Seed (K3):** `deploy/vps/ops.sh seed`. **Yalnız referans veri (plan, modül kataloğu, rubrikler);
   demo kiracı YOK.** `SEED_DEMO=false` ile koşar. `prisma/seed.ts` bu ayrımı henüz yapmaz (FO-251):
   ayrım birleşene kadar `ops.sh seed` kendi kapısını kapatır ve çalışmaz. Karar yoksa seed çalışmaz.
7. **Doğrulama:** `deploy/vps/ops.sh verify` (`rls:verify --require-db`, uygulama rolü `fabrika_app`).
   Başarısızsa web açılmaz.

Notlar:
- Bu bölümün hiçbiri canlıda henüz koşulmadı. Yerel provası ve sonucu §11'de.
- Yeni tablo eklenirse RLS denetimi `ops.sh rls` ve `ops.sh verify` ile elle yapılır (K4).

## 5. Uygulamayı başlat

Sıra §3.3 (ADR-0008 §9.2) ile aynıdır: web önce, worker `JOBS_CRON_ENABLED=false` ile, sonra `true`.

```bash
cd /opt/fonbridge
# 1. Web (imajı derler)
docker compose -f deploy/vps/docker-compose.prod.yml up -d --build web
docker compose -f deploy/vps/docker-compose.prod.yml ps        # web: healthy (GET / 200)

# 2. Worker, cron kapalı (şemayı kurar, job-queue:cron-disabled uyarısı beklenir)
docker compose -f deploy/vps/docker-compose.prod.yml up -d --build worker
docker logs fonbridge-worker --tail 50

# 3. Cron'u aç (.env.prod: JOBS_CRON_ENABLED=true), worker'ı yeniden başlat
docker compose -f deploy/vps/docker-compose.prod.yml up -d --force-recreate worker

# 4. Caddy — yalnız §3'teki DNS kontrolü geçtikten sonra
docker compose -f deploy/vps/docker-compose.prod.yml up -d caddy
curl -sI https://nexagrant.com | head -n 5
curl -sI http://www.nexagrant.com | head -n 3         # 301 → https://nexagrant.com
```

- Caddy'de `Strict-Transport-Security` **kapalı** (Caddyfile'da satır yorumda). Patron kararıyla açılır.
- **CORDIS içe aktarımı panelden yapılmaz** (`src/app/[locale]/admin/cordis/actions.ts` web sürecinde
  4,7 GB tepe ölçüldü). Tek seferlik konteyner, worker durdurulmuş, sahip rolle, bellek sınırı 5 GB:
  ```bash
  docker compose -f deploy/vps/docker-compose.prod.yml stop worker
  # Yalnız sahip URL'i host ortamına alınır (.env.db'nin tamamı ya da POSTGRES_PASSWORD konteynere girmez, FO-308 D-11).
  export OWNER_DATABASE_URL="$(grep -E '^OWNER_DATABASE_URL=' deploy/vps/.env.db | cut -d= -f2-)"
  docker run --rm --memory 5g --network fonbridge_default \
    --env-file deploy/vps/.env.prod -e OWNER_DATABASE_URL \
    fonbridge-worker:local sh -c \
    'export DATABASE_URL="$OWNER_DATABASE_URL"; exec node_modules/.bin/tsx scripts/cordis-import.ts "$@"' sh <argümanlar>
  unset OWNER_DATABASE_URL
  docker compose -f deploy/vps/docker-compose.prod.yml up -d --no-build worker
  ```
  Parola komut satırına girmez: `-e OWNER_DATABASE_URL` değeri host ortamından alır (argv'de yalnız ad vardır).
  Konteynerde `POSTGRES_PASSWORD` ve `.env.db` yoktur (kanıt: FO-308 raporu). `fonbridge-worker:local` GÜNCEL revision ile derlenmiş olmalı (§6 adım 3).
  Konteyner `--rm` ile silinir. Akışlı okumaya geçiş ayrı bir karttır (Y-2 önerisi).
- İlk gün admin `/[locale]/admin/alerts` ekranında `job-queue` ve worker log'u kontrol edilir
  (RELEASE_CHECKLIST §3.3 madde 5).

## 6. Güncelleme (deploy)

Yeni bir commit için (sıra `docs/RELEASE_CHECKLIST.md` §3.1 ile aynı; 0a ve 2a atıfları orada):

```bash
cd /opt/fonbridge
git fetch --all --prune && git checkout <yeni-commit>
# 0. Yedek (§8.1) bu güncellemeden önce alındı mı? Yoksa dur.
# 1. Eski worker'ı durdur (RELEASE_CHECKLIST §3.1 adım 2a): stop -t 300, sonra kilitli iş sayısı 0
docker compose -f deploy/vps/docker-compose.prod.yml stop -t 300 worker
# 2. İmajı yedekle (geri alma için)
docker tag fonbridge-web:local fonbridge-web:prev   2>/dev/null || true
docker tag fonbridge-worker:local fonbridge-worker:prev 2>/dev/null || true
# 3. Yeni imajları ÖNCE derle (FO-301 Y-6). web ve worker ayrı hedef imajlar; ops adımları worker imajını
#    koşar. Bu adım atlanırsa ops eski şemayı/RLS dosyasını yeni kodla eşleşmeden uygular.
#    GIT_REVISION (FO-308 R-1) zorunlu: imajın revision etiketi HEAD'le eşleşmezse ops.sh her worker komutunda durur.
#    Derleme sırasında worker durmuş olmalı (Y-2: derleme tepesi 2 vCPU / 8 GB'da worker ile birlikte taşabilir).
GIT_REVISION="$(git rev-parse HEAD)" docker compose -f deploy/vps/docker-compose.prod.yml build web worker
# 4. Şema değiştiyse: go-live ön kontrolü R-1 (RELEASE_CHECKLIST §3.1 adım 0a) — db push'tan ÖNCE, sahip rolle.
#    `r1` son satırda R1_SONUC | TEMIZ / DB_PUSH_ONCESI / ANAHTAR_YOK / NULLS_DISTINCT değilse durur (DUR_MUKERRER, RLS_KOR).
deploy/vps/ops.sh r1              # çıkış ≠ 0 = DUR: çıktıyı incele
deploy/vps/ops.sh diff            # çıkış 2 = şema farkı: dur, incele
deploy/vps/ops.sh push
deploy/vps/ops.sh migrate
# 5. Şema değiştiyse RLS ve doğrulama ZORUNLU (ensure_rls tetikleyicisi yok, K4):
deploy/vps/ops.sh rls
deploy/vps/ops.sh verify          # başarısızsa web'i başlatma
# 6. Başlat (imajlar adım 3'te derlendi; --no-build ile yeniden derlenmez)
docker compose -f deploy/vps/docker-compose.prod.yml up -d --no-build web
docker compose -f deploy/vps/docker-compose.prod.yml up -d --no-build worker
docker compose -f deploy/vps/docker-compose.prod.yml ps
```

Şema değişmediyse adım 4 ve 5 atlanır; yalnız `stop`, `build`, `up -d --no-build` çalışır. Her güncellemeden
önce §8'deki yedek (en az bir gün önceki) elde olmalı.

## 7. Geri alma (rollback)

Uygulama geri alma (şema değişmediyse):

```bash
cd /opt/fonbridge
docker compose -f deploy/vps/docker-compose.prod.yml stop worker
git checkout <önceki-commit>
docker tag fonbridge-web:prev fonbridge-web:local
docker tag fonbridge-worker:prev fonbridge-worker:local
docker compose -f deploy/vps/docker-compose.prod.yml up -d --no-build web worker
```

Şema da geri alınacaksa: önce worker durdurulur, sonra migrasyonların `.down.sql` dosyaları **ters
sırada** uygulanır:

```bash
DATABASE_URL=<url-127.0.0.1> scripts/apply-migrations.sh --down <dosya>.down.sql
```

`docs/RELEASE_CHECKLIST.md` §3.2 ve §3.3 geri dönüş notları (ör. `m4-double.sql`) uygulanmadan geri
dönüş yapılmaz. Geri dönüşü 07:00–13:00 UTC dışında yap (§3.3).

## 8. Yedek ve geri yükleme

### 8.1 Günlük yedek (kur)

```bash
sudo install -m 600 /dev/null /etc/fonbridge/backup.env   # sonra değerleri doldur
sudo install -m 644 /opt/fonbridge/deploy/vps/fonbridge-backup.cron /etc/cron.d/fonbridge-backup
```

`/etc/fonbridge/backup.env` içinde: `BACKUP_DATABASE_URL` (süper kullanıcı `fabrika`, `127.0.0.1`),
`BACKUP_AGE_RECIPIENT` (açık anahtar), `R2_ACCOUNT_ID`, `R2_BACKUP_BUCKET`, `AWS_ACCESS_KEY_ID`,
`AWS_SECRET_ACCESS_KEY`. R2 token'ı **yalnız yedek kovasına yazabilen** ayrı bir token olmalı.

Elle bir kez koş ve çıktıyı gör:

```bash
sudo /opt/fonbridge/deploy/vps/backup-to-r2.sh
# beklenen: "ok: fonbridge-<damga>.dump.age <n> bayt R2'de doğrulandı"
```

Kanıt olarak log satırını rapora koy. Başarısız cron çıkış kodunu `/var/log/fonbridge-backup.log`'a yazar;
dış kalp atışı (RELEASE_CHECKLIST §5.3) patron kararıdır.

**Saklama:** yerelde 7 gün (betik). R2 kovasında yaşam döngüsü kuralı (ör. 7/28/365 gün) Cloudflare
panelinde tanımlanır; betik bu katmanları kendisi uygulamaz.

### 8.2 Geri yükleme (provası, ayda bir)

Önce `fabrika_app` rolü (§4 adım 2) ve boş bir hedef veritabanı (`createdb -O fabrika fabrika_restored`).
Şifreli dökümler (`.age`) önce `age -d -i <özel-anahtar>` ile çözülür; özel anahtar sunucuda **bulunmaz**,
patron kasasından geçici olarak alınır.

```bash
# Prova: geçici DB'ye yükler, satır sayılarını karşılaştırır (kendi DB'sini kendisi kurar/siler)
RESTORE_ADMIN_URL=postgresql://fabrika@127.0.0.1:5432/postgres \
BACKUP_DATABASE_URL=postgresql://fabrika@127.0.0.1:5432/fabrika \
  bash scripts/backup/pg-restore-drill.sh <dump>
# (parolalar PGPASSWORD ya da ~/.pgpass ile; URL'lerde yazılmaz. RESTORE_ADMIN_URL: süper kullanıcı ya da
#  CREATEDB rolü, postgres veritabanına bağlı. BACKUP_DATABASE_URL: karşılaştırılacak kaynak.)
# Gerçek geri yükleme (felaket): YALNIZ boş hedef DB; betik DB oluşturmaz, dolu hedefi reddeder
RESTORE_DATABASE_URL=postgresql://fabrika@127.0.0.1:5432/fabrika_restored bash scripts/backup/pg-restore.sh <dump>
```

Sonra hedef DB'ye karşı `rls` ve `verify` (ops.sh'ın DATABASE_URL'ini o DB'ye çevirerek), uygulamayı yeni DB'ye
bağla, giriş yap. Süreyi yaz (RTO ölçümü). `docs/RELEASE_CHECKLIST.md` §4.2 ve §4.4 ayrıntılı adımları verir.

## 9. İzleme

- `docker stats --no-stream` — 1 hafta boyunca günde bir kez kaydet (bellek sınırlarının doğrulanması).
  Hedef: Postgres ~2 GB, web ve worker ~1.5 GB altı.
- `docker compose … logs --tail 200 web worker` — hata satırları için.
- Log dönüşümü: her servis için `json-file` 10 MB × 5 (compose'da tanımlı).
- Uygulama alarmları: `SystemAlert` yalnız `/[locale]/admin/alerts` ekranında (RELEASE_CHECKLIST §5.1).
  E-posta/push bildirimi ve dış uptime izleyici patron kararı (§5.2).
- Disk: 100 GB. Yedek + Postgres verisi + imajlar. `docker image prune` haftalık (manuel, kanıtla).

## 10. Açık kararlar (patron)

| # | Konu | Neden |
|---|---|---|
| K1 | nexagrant.com A kaydı → VPS IP (DNS) | Caddy sertifikası ve yayın için şart |
| K2 | `CALENDAR`/`EXPERT_PREREG_IP_SALT` ve diğer sırlar değerleri | Sunucuda elle girilir |
| K3 | Canlıda seed: **karar verildi (lider, FO-250): referans veri zorunlu, demo yok.** `SEED_DEMO=false`; ayrım FO-251'de (fe-fb) | `ops.sh seed` FO-251 birleşene kadar kendi kapısıyla çalışmaz |
| K4 | `ensure_rls` olay tetikleyicisi: **karar verildi (lider, FO-250): kurulmaz.** Güncellemede `ops.sh rls && ops.sh verify` zorunlu (§6) | Tetikleyici sistem geneli tabloları da etkiler (BlogPost olayı); RLS denetimi `rls:verify` ile ölçülür |
| K5 | Postgres iç bağlantısı TLS'siz (yalnız iç ağ) mi | Alternatif: sertifikalı Postgres (ayrı iş) |
| K6 | HSTS (`max-age=300` → sonra `31536000`) | Caddyfile'da yorumda |
| K7 | ACME e-posta adresi (`email` satırı) | Sertifika uyarıları |
| K8 | R2 yedek kovası ve yazma-token'ı; `age` açık anahtarı | §8.1 |
| K9 | Dış kalp atışı ve uptime izleyici | §5.3, §9 |
| K10 | RPO/RTO hedefi (öneri RPO ≤ 24 sa, RTO ≤ 4 sa) | RELEASE_CHECKLIST §4.2 |
| K11 | Alan adı tutarlılığı: docs/RELEASE_CHECKLIST.md ve docs/SMTP-SUNUCU.md `fonbridge.com` diyor, kod ve bu paket `nexagrant.com` | Ayrı temizlik işi; bu pakette nexagrant.com kullanıldı |
| K12 | `fabrika_owner` BYPASSRLS mi (öneri: evet) | Süper kullanıcı değil, ama FORCE RLS altında migrasyon/seed/verify için satır görmesi gerekir (RELEASE_CHECKLIST §3.1 adım 1a). Uygulama rolü `fabrika_app` BYPASSRLS'siz kalır |

Python CORDIS servisi (`workers/cordis`) bu yığında **yok**: Dockerfile yok ve giriş noktası tutarsız
(`package.json` `worker:dev` `app:app` diyor, dosya `main.py`). Ayrı kart.

## 11. Yerel doğrulama (sunucu dışı)

Yapılanlar ve sonuçları FO-244 raporunda (`docs/agent-results/TASK-MVUMVNK4FCPHD-devop-fb.md`):
- `docker compose -f deploy/vps/docker-compose.prod.yml config` → geçerli
- `caddy validate` (caddy:2-alpine) → geçerli
- `docker build --target runner` yerelde denendi (sonuç rapora)
- FO-302 (Y-5/Y-6/D-7..D-9): `.env.db` ayrımı sonrası `config` çıktısında web ve worker'da
  `OWNER_DATABASE_URL` / `POSTGRES_PASSWORD` yok; geçici `pgvector:pg16` üzerinde
  bootstrap → diff → push → rls-role → rls → migrate → rls → verify zinciri geçti (sonuç FO-302 raporunda)

Yapılmayanlar: sunucu, DNS, gerçek sertifika, canlı veritabanı, R2 yedek yazımı, Hostinger.
