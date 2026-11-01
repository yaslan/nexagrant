# TASK-MVC406JHEDGLL (FO-35) — pg-backup.sh parolayı argv'den çıkar

**Durum: TAMAM (yerel doğrulama).** Betik düzeltildi; tüm DoD yerelde koşularak kanıtlandı. Push, `.env` shell'de kaynaklanarak yapıldı (kopyalama yok, `--no-verify` yok). PR `--base dev` açıldı, merge edilmedi.

## Platform beyanı
- **Doğrulandı:** macOS (darwin 27, arm64), Homebrew PostgreSQL 16.15 istemci araçları (`pg_dump`/`pg_restore`), yerel Postgres 5433 (`fabrika` DB), bash.
- **Linux:** koşulamadı (bu makinede Linux yok). Betik sunucuda (Linux) koşturulmadı. Kullanılan özellikler (`mktemp` şablonu, `printf %b`, `[[ =~ ]]`, `BASH_REMATCH`) bash'te standarttır; GNU `mktemp`/`shasum` davranışı burada doğrulanmadı.
- **Windows:** kapsam dışı (kart).

## Ne yapıldı
`scripts/backup/pg-backup.sh` (tek değişen dosya, commit `2d56b111`, dal `devop-fb/fo35-pgpass-argv`, taban `origin/dev`):

1. `BACKUP_DATABASE_URL` bash regex ile ayrıştırılır: kullanıcı, parola, host, port, db, sorgu ayrı alınır; alanlar libpq için yüzde-çözülür.
2. Parola, `mktemp` ile oluşturulan 0600 geçici `PGPASSFILE`'a yazılır ve `export PGPASSFILE` ile verilir. Dosya `pg_dump` bitince silinir; `trap cleanup EXIT` hata yolunda da siler.
3. `pg_dump --dbname` parolasız URL alır: `postgresql://<kullanıcı>@<host>:<port>/<db>?<sorgu>`.
4. URL'de parola yoksa passfile oluşmaz; `PGPASSWORD` ortam kullanımı aynen çalışır.
5. Kabul edilmeyen durumlar değeri yazmadan `FAIL` verir: `postgresql://` olmayan URL, IPv6 host, sorguda `password=`.
6. Başlık yorumu yeni davranışı anlatır.

Değişmeyenler: exit kodları, dosya adı (`fonbridge-<stamp>.dump`), `.sha256`, `BACKUP_AGE_RECIPIENT` şifrelemesi, retention, `--no-owner`/`--format=custom`.

## Kanıt (bu oturumda koşuldu; parola maskeli)

Test kümesi: yerel `localhost:5433/fabrika`, rol `fabrika` (BYPASSRLS, superuser). Test parolası 7 karakter ve kullanıcı/DB adıyla aynı (`fabrika`); bu yüzden satır-eşleşme sayımları kullanıcı adını da yakalar. Parolanın argv'de olmadığı kanıtı `:<parola>@` kalıbının 0 çıkmasıdır.

### 1) Doğru parola — `pg-backup.sh` (PATH'te gözlem shim'i ile)
```
=== RUN 1: correct password ===
exit=0
2026-10-17T09:20:52Z [pg-backup] dumping to fonbridge-20261017T092052Z.dump
2026-10-17T09:20:54Z [pg-backup] ok: fonbridge-20261017T092052Z.dump 460K toc_entries=753
log: parola sayısı 0
dosyalar: fonbridge-20261017T092052Z.dump (469735 B), fonbridge-20261017T092052Z.dump.sha256
PGPASSFILE=/var/folders/.../T//fonbridge-pgpass.uK15G1
-rw-------  39 B   <- 0600, pg_dump çalışırken
pg_dump sırasında ps (parola-kalıbı :<parola>@ sayısı: 0):
77249 /bin/bash .../fo35/shim/pg_dump --dbname=postgresql://fabrika@localhost:5433/fabrika --format=custom --no-owner --file=.../fonbridge-20261017T092052Z.dump.partial
leftover passfile (TMPDIR): 0
```
Sonuç: `pg_dump` argv'inde kullanıcı/host/db var, parola yok.

### 2) Yanlış parola
```
=== RUN 2: wrong password ===
exit=1
pg_dump: error: connection to server at "localhost" (::1), port 5433 failed: FATAL:  password authentication failed for user "fabrika"
password retrieved from file "/var/folders/.../T//fonbridge-pgpass.62fX4Y"
dump dosyası: 0
wrong-password metni logda: 0
leftover passfile: 0
```
Not: log'daki tek "parola" eşleşmesi `user "fabrika"` metnidir (test parolası = kullanıcı adı); gerçek parola değeri sızmadı.

### 3) Geri yükleme provası — `pnpm backup:restore-drill`
Önce kaynak olarak canlı `fabrika` DB'si kullanıldı: 4 aktif oturum vardı ve sayılar iki yönde kaydı (ör. `Effort` 10 → 13); bu, drill'in belgelediği "kaynak yazılırken sayım" sınırıdır, betik hatası değildir. Ardından dökümü temiz bir kaynağa (`fo35_quiet`, geçici) geri yükleyip drill'i orada koşturdum:
```
[restore-drill] ... ok: 78 tables, restore 1s, total 2s
[restore-drill] scratch database dropped
drill exit=0
```
Geçici `fo35_quiet` DB'si silindi.

### 4) Sözdizimi, lint, typecheck
- `bash -n scripts/backup/pg-backup.sh` → ok (shellcheck bu makinede yok)
- `pnpm lint` → exit 0 (0 hata; 4 uyarı, hepsi test dosyalarında, bu değişiklikle ilgisiz)
- `pnpm typecheck` → exit 0

### 5) Push ve PR
Push, `.env` kaynaklanmış kabukta yapıldı (`set -a; . .env; set +a`); `pre-push` kapısı (`pnpm gate`) bu koşuda sonucu aşağıda verilmiştir.

## Değişen dosyalar
- `scripts/backup/pg-backup.sh`
- `docs/agent-results/TASK-MVC406JHEDGLL-devop-fb.md` (bu dosya)

## Riskler
- `pg-restore-drill.sh` aynı sınıf sorunu taşıyor: `psql "$url"` ile parolalı `BACKUP_DATABASE_URL` argv'de. Kart bu betiği kapsam dışı bıraktı; ayrı bir kart gerekir.
- Parola dosyası `pg_dump` süresince diskte (0600). Ortam değişkeni yerine seçildi çünkü `PGPASSWORD` `ps e` / `/proc/<pid>/environ` ile görülebilir.
- Passfile kaçışı (`\\`, `\:`) ve `%` çözümü birim olarak değil, yalnız yukarıdaki koşumlarla doğrulandı; özel karakterli parola ayrıca denenmedi.
- Linux'ta `pg_restore --list` ve `shasum` koşulmadı.

## Açık sorular
1. `pg-restore-drill.sh` için ayrı bir kart açılsın mı?

## Sonraki adım
1. PR incelemesi; merge kararı kullanıcıya ait (merge yapılmadı).
