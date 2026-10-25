---
sözleşme: 3
görev: TASK-MVDKCZ6POWERJ
kod: TASK-MVDKCZ6POWERJ (FO-74)
ajan: devop-fb
motor: claude
tip: yayın
okur: ekip
hüküm: Kısmen bitti. Yerel MinIO kuruldu, iki bucket oluşturuldu ve depo katmanı (yükleme, anonim okuma, özel bucket'ın kapalılığı) doğrulandı; commit 3db40347. Ancak uygulamanın kendisi uçtan uca doğrulanmadı: .env.local'a yazma ve okuma erişimi reddedildi, :3000'deki dev sunucusu yeni env ile yeniden başlatılmadı. Kart in_progress bırakıldı; DoD tamamlanmadı.
platform: mac (Darwin 27.0, Docker 29.7.2, Compose v5.5.1). Windows/Linux koşulamadı (yalnız mac ortamı; compose profili ve betik platform bağımsızdır: HTTP + S3 SDK, süreç öldürme ya da dosya yolu yok).
sürüm: 1
tarih: 2026-10-18
---

# FO-74 · Blog kapak görseli için yerel MinIO

## Hüküm
Kısmen bitti. Altyapı ve betik hazır ve ölçüldü. Şu iki adım engelli ve bitmedi:
1. `.env.local`'a R2 değişkenleri yazılamadı (Bash ile okuma ve yazma izni reddedildi). Dosyanın içeriğine bakılmadı ve izin aşılmadı.
2. :3000 üzerindeki `next-server` (PID 3414, ebeveyn 3405, 15 dk çalışıyor) benim başlattığım bir süreç değil. Ofis kuralı başkasının süreçlerini kapatmayı yasaklıyor. Yeni env olmadan yeniden başlatmak da bir işe yaramazdı, çünkü env dosyası yazılamadı.

## 1. Ne yapıldı
- **`docker-compose.yml`**: `minio` servisi `profiles: ["storage"]` altında eklendi. İmaj, CI'daki Chainguard MinIO digest'i (`sha256:4cf4831a…8e0034`). API `127.0.0.1:9000`, konsol `127.0.0.1:9001`, kalıcı volume `fabrika_miniodata`. Yalnız loopback'e açık. `docker compose config --quiet` temiz, `--profile storage` ile servis listesinde `minio` görünüyor.
- **`scripts/minio-local-setup.ts`** (yeni): idempotent kurulum. `fabrika` (özel) ve `fabrika-public` (anonim GetObject) bucket'larını oluşturur. İki bucket adı aynıysa çıkar. Sağlık ucunu bekler.
- **`package.json`**: `storage:up` (compose + kurulum) ve `storage:setup` script'leri eklendi.
- **`README.md`**: "Yerel çalıştırma" bölümüne yerel görsel yükleme notu eklendi. Hangi env değerlerinin `.env.local`'a yazılacağı da orada.
- Uygulama kodu (`src/**`), `.env*` ve `.env.example` değiştirilmedi.
- Commit: `3db40347 chore(infra): local MinIO for blog image uploads (TASK-MVDKCZ6POWERJ)`. Yalnız 4 dosya (pathspec commit). Dal: `be-fb/bypassrls-ci-throw-session`. Bu dal be-fb'ye ait; commit oraya düştü. Gerekirse taşınmalı.

## 2. Kanıt (ham çıktı)
Compose ve servis:
```
$ docker compose config --quiet            → COMPOSE_VALID
$ docker compose --profile storage config --services
redis / mailpit / minio / postgres-vector
$ docker compose --profile storage up -d minio
 Volume fabrika_miniodata Created / Container fabrika-minio Started
$ curl -sf http://127.0.0.1:9000/minio/health/live   → LIVE_OK
```
Kurulum betiği, iki kez koşuldu:
```
$ pnpm storage:setup
bucket fabrika: created (private)
bucket fabrika-public: created
bucket fabrika-public: anonymous GetObject policy applied
$ pnpm storage:setup        (ikinci koşu)
bucket fabrika: exists (private)
bucket fabrika-public: exists
bucket fabrika-public: anonymous GetObject policy applied
```
Depo katmanı, S3 SDK ile PNG yükleme ve anonim okuma:
```
public (HEAD)  → 200 image/png
public (GET)   → 200 image/png, 70 B
private bucket anonim GET → 403
```
Kalite kapıları: `pnpm typecheck` → exit 0. `npx eslint scripts/minio-local-setup.ts` → exit 0. Commit kapısı (eslint + tsc staged) → "Kapı temiz".

## 3. DoD durumu
- [x] MinIO profil altında compose'da; `--profile storage up -d` ile kalkıyor (doğrulandı; `up -d minio` ile).
- [x] İki ayrı bucket; public olan anonim okunuyor (curl kanıtı yukarıda).
- [ ] Editörde gerçek yükleme + kaydet + yenile (ekran görüntüsü): **yapılmadı**. Uygulama yeni env ile çalışmıyor.
- [ ] Public blog sayfasında görselin durumu: **ölçülmedi** (aynı sebep).
- [ ] Hata yolları (`size`, `type`) uygulama üzerinden: **doğrulanmadı**. Bu yollar route testlerinde (be-fb, TASK-MUU20NSV2TETW) kapsanıyor, bu koşuda yeniden ölçülmedi.
- [ ] `pnpm dev` yeni env ile :3000'de: **yapılmadı** (engel yukarıda).
- [x] Kurulum notu + tek komut eklendi, commit atıldı, `.env*` commit dışında (`.env.local` gitignore'da, `git check-ignore` doğruladı).
- [x] Platform beyanı: yalnız mac üzerinde koşuldu.

## 4. Gereken elle eklenecek satırlar (`.env.local`)
Bu değerler kart ve README'de. Yazılamadığı için kullanıcı ya da izni olan bir ajan eklemeli:
```
R2_ENDPOINT=http://localhost:9000
R2_REGION=us-east-1
R2_ACCESS_KEY_ID=minioadmin
R2_SECRET_ACCESS_KEY=minioadmin
R2_BUCKET=fabrika
R2_PUBLIC_BUCKET=fabrika-public
R2_PUBLIC_HOST=http://localhost:9000/fabrika-public
```
Sonra `pnpm dev` yeniden başlatılmalı (:3000'deki PID 3414'ü ofis sahibi ya da o süreci başlatan kişi kapatmalı; ben kapatmadım).

## 5. Açık işler (sıra)
1. Kullanıcı ya da izinli ajan `.env.local`'a yukarıdaki 7 satırı ekler.
2. :3000 dev sunucusunu yeniden başlatır.
3. Ben: `curl` ile `POST /api/admin/blog/image` (admin oturumu), anonim `curl -I`, gerçek tıklama ile yükleme + yenileme + ekran görüntüsü, `/tr/blog/<slug>` ölçümü, `size`/`type` hata yolları. Sonra bu dosyanın DoD'si güncellenir.

## 6. Riskler
- **Next image optimizer:** Next 16, localhost/özel IP'den görsel çekmeyi reddedebilir (be-fb raporundaki risk). Bu koşuda ölçülmedi. Sebep ve öneri, public sayfa ölçümünden sonra yazılacak.
- **Kimlik bilgileri:** `minioadmin/minioadmin` yalnız yerel geliştirme içindir ve CI ile aynıdır. Canlıda kullanılmaz.
- **Port 9000/9001:** boştu (`lsof`). Başka bir yerel S3 benzeri servis bu portları alırsa `FABRIKA_MINIO_API_PORT` / `FABRIKA_MINIO_CONSOLE_PORT` ile değiştirilebilir.

## 7. Değişen dosyalar
`docker-compose.yml`, `package.json`, `README.md`, `scripts/minio-local-setup.ts` (yeni). Bu sonuç dosyası. Repo dışı: yok.
