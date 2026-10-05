---
title: "TASK-MUPL268JAAWHD: fabrika Postgres :5433 — DURDURULDU, veri volume'u Docker'da yok"
hüküm: DURDURULDU — karar gerekli (compose başlatılmadı)
tip: ops / runtime
platform: mac (Darwin 27.0, Docker Desktop 4.90.0 / Engine 29.7.2)
ajan: devop-fb
tarih: 2026-10-01
---

# TASK-MUPL268JAAWHD — fabrika Postgres :5433

## 1. Ne yapıldı

Kartın varsayımı ("Docker yanıt veriyor, `fabrika_pgdata` duruyor, yalnız servisi başlat")
**doğru değil**. Docker yanıt veriyor ama motor tamamen boş: 0 konteyner, 0 imaj,
**0 volume**. `fabrika-postgres` konteyneri ve `fabrika_pgdata` volume'u artık yok.
Bu yüzden `docker logs` alınacak bir konteyner de yok.

`docker compose up -d postgres-vector` şu an koşulursa **yeni ve boş** bir
`fabrika_pgdata` oluşur, boş bir `fabrika` veritabanı başlar. Bu "veri silmeden
ayağa kaldırma" değil, sıfırdan kurulum olur. Kart "gerekirse dur, raporla" dediği
için **compose'u başlatmadım**. Hiçbir şey silmedim ya da değiştirmedim; Docker
Desktop'ı yeniden başlatmadım. Kod değişikliği ve push yok.

### Kök neden (loglardan)

Kaynak: `~/Library/Containers/com.docker.docker/Data/log/host/`.

| Zaman (yerel, +03) | Olay | Kanıt |
|---|---|---|
| 30.09 00:28 | Mac diski doldu (ENOSPC), Docker motoru askıda kaldı | `electron-2026-10-01.log`: `ENOSPC: no space left on device` |
| 01.10 ~13:50 | `Data/` ve `Data/vms/` dizinleri yeniden oluşturuldu (eski disk imajı silinmiş) | `ls -la` mtime: `vms` 13:50 |
| 01.10 13:54:51 | Docker Desktop kapatıldı | `[APP] Quitting whole Docker Desktop` |
| 01.10 14:04:28 | Yeni, boş disk imajı oluşturuldu | `main.rawdisk creating ".../Docker.raw"`, `resizing ... from 0MiB` |
| 01.10 14:05:26 | Ayarlar değişti (CPU 12→8, RAM 8→15.5 GB, disk 128 GB), disk imajı yine sıfırdan | `resizing ... from 0MiB to 131072MiB` |

Sonuç: biri ya da bir süreç, disk doluyken yer açmak için Docker Desktop'ın disk
imajını (`Docker.raw`) sildi ya da "Clean / Purge data" / fabrika ayarına dönme
yaptı. Bütün konteynerler, imajlar ve volume'lar o imajın içindeydi. Mac diskinde şu an
209 GiB boş (dolu olan hacmin büyük kısmı geri gelmiş), bu da büyük bir imajın
silindiğiyle uyumlu. **DÜZELTME (crw-fb Y-1, devop-fb doğruladı):** önceki
"shell geçmişinde silme izi yok" ifadesi YANLIŞTI. `~/.zsh_history` satır 1041-1055'te
elle yazılmış `docker builder prune -a`, `docker system prune -a`, `pkill -f Docker`,
`rm ~/Library/Containers/com.docker.docker/Data/vms/0/data/Docker.raw`,
`cat /dev/null > …/Docker.raw` ve `rm -f …/Docker.raw` komutları var (disk dolunca yer
açma temizliği gibi görünüyor; geçmişte zaman damgası yok). Kök neden: elle prune + Docker.raw
silme/sıfırlama. Kişi atfı yapılmıyor; Çöp Kutusu'nda dosya yok (rm ile silinmiş).

Yedek araması: `*fabrika*.sql*`, `*.dump` (mdfind, ev dizini) → sonuç yok. Time Machine
hedefi bağlanamıyor (`tmutil latestbackup`: "Failed to mount destination").
**Elimizde geri yüklenecek bir döküm yok.**

Etki yalnız FONBRIDGE'le sınırlı değil: aynı Docker'daki öteki projelerin
konteynerleri ve volume'ları da (supabase_*, MinIO, ajanların izole PG'leri) gitti.

## 2. Kanıt

Önce ve sonra aynı, çünkü hiçbir şey değiştirmedim:

```
$ date; docker ps -a; docker volume ls; docker images
2026-10-01 16:43:20 +03
CONTAINER ID   IMAGE     COMMAND   CREATED   STATUS    PORTS     NAMES
DRIVER    VOLUME NAME
IMAGE   ID             DISK USAGE   CONTENT SIZE   EXTRA

$ docker info --format '{{.ServerVersion}} {{.OperatingSystem}} containers={{.Containers}} images={{.Images}}'
29.7.2 Docker Desktop containers=0 images=0

$ pg_isready -h 127.0.0.1 -p 5433
127.0.0.1:5433 - no response      (exit=2)

$ ls -la .../Data/vms/0/data/Docker.raw ; du -h ...
-rw-r--r--  1 macbook  staff  137438953472 Oct  1 15:40 Docker.raw   (sparse 128 GiB)
7.3M  Docker.raw                                                        (gerçek kullanım 7.3 MB = boş)

$ grep rawdisk com.docker.backend.log*
[2026-10-01T11:04:28Z][main.rawdisk] creating ".../vms/0/data/Docker.raw"
[2026-10-01T11:04:28Z][main.rawdisk] resizing ".../Docker.raw" from 0MiB to 471482MiB
[2026-10-01T11:05:26Z][main.rawdisk] creating ".../vms/0/data/Docker.raw"
[2026-10-01T11:05:26Z][main.rawdisk] resizing ".../Docker.raw" from 0MiB to 131072MiB

$ df -h /System/Volumes/Data
/dev/disk3s1   460Gi   227Gi   209Gi    53%
```

Koşulmayan sağlık kontrolleri (koşulamaz, çünkü DB yok):
- Tenant satır sayısı: koşulmadı.
- `pnpm rls:verify`: koşulmadı.

## 3. Değişen dosyalar

- `docs/agent-results/TASK-MUPL268JAAWHD-devop-fb.md` (bu rapor). Başka dosya yok.

## 4. Riskler

- **Yerel geliştirme verisi kalıcı olarak kayboldu.** Bu bir canlı ortam değil, yerel
  fabrika DB'si; ama elle girilmiş test kiracıları ya da pilot hazırlık verisi varsa
  onlar da yok. Yedek bulunmadı.
- DB'yi gerektiren bütün işler (vitest `.live` testleri, `rls:verify`, e2e) şu an
  koşamıyor. FONBRIDGE vitest'i DB yokken `.live` testlerini **atlayıp exit 0
  verebiliyor** → DB yeniden kurulana kadar "yeşil" sonuçlara güvenmeyin.
- Diskin dolma nedeni düzelmediyse aynı şey yine olur. Docker diski 128 GB'a ayarlı,
  Mac'te 209 GiB boş alan var.

## 5. Açık sorular (patron / ofis sahibi kararı)

1. Docker disk imajını kim/ne sildi? Bilinçli bir yer açma işlemi miydi? Bir yedek
   (`pg_dump`, Time Machine diski) var mı?
2. Yedek yoksa: **boş bir fabrika DB'sini sıfırdan kuralım mı?** Önerim **evet**.
   Yerel dev DB'si ve şema tamamen migration'lardan geliyor.

## 6. Sonraki adım (onay gelirse; her adım geri alınabilir)

1. `docker volume ls` (önce) → `docker compose up -d postgres-vector` (imajı çeker,
   boş `fabrika_pgdata` oluşturur). Geri alma: `docker compose stop postgres-vector`.
   Volume'u silmeye gerek yok.
2. `pg_isready -h 127.0.0.1 -p 5433`.
3. Ana checkout'ta migration'ları uygula (`pnpm prisma migrate deploy`) ve README /
   RELEASE_CHECKLIST'teki RLS adımını koş (`db:rls`, sahip rolüyle). Ardından
   `pnpm rls:verify`.
4. Gerekirse seed. Tenant sayısını `SET LOCAL app.system_scope='on'` içinde say:
   FORCE RLS yüzünden sahip rolü bu olmadan 0 görür ve sahte "temiz" sonuç verir.
5. vitest'i DB ayakta tam koş ve `.live` dosyalarının atlanmadığını kontrol et.

Bu adımları ayrı bir kartta yapmayı öneririm: "fabrika DB'yi sıfırdan kur" (devop-fb).
