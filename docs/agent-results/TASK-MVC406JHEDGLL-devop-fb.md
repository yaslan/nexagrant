# TASK-MVC406JHEDGLL (FO-35) — pg-backup.sh parolayı argv'den çıkar

**Durum: KISMEN TAMAM.** Betik düzeltildi ve yerelde doğrulandı. Push, proje `pre-push` kapısında (`pnpm gate` → vitest) takıldı; kapı DB kimlik bilgisi olmadan koşuyor. PR açılmadı. `--no-verify` kullanılmadı.

## Platform beyanı
- **Doğrulandı:** macOS (darwin 27, arm64), Homebrew PostgreSQL 16.15 istemcisi (`pg_dump`/`pg_restore`), bash.
- **Linux:** koşulamadı (bu makinede Linux yok). Betik Linux'ta (yedek sunucusu) koşturulmadı. Kullanılan özellikler (`mktemp` şablonu, `printf %b`, `[[ =~ ]]`, `BASH_REMATCH`) bash'te standarttır; ama GNU `mktemp`/`shasum` davranışı bu makinede doğrulanmadı.
- **Windows:** kapsam dışı (kart).

## Ne yapıldı
`scripts/backup/pg-backup.sh` (tek değişen dosya, commit `2d56b111` dalında `devop-fb/fo35-pgpass-argv`, taban `origin/dev` = `7f8d3de4`):

1. `BACKUP_DATABASE_URL` bash regex ile ayrıştırılır; kullanıcı, parola, host, port, db, sorgu ayrı alınır. Alanlar libpq için yüzde-çözülür.
2. Parola, `mktemp` ile oluşturulan (0600) geçici bir `PGPASSFILE` dosyasına yazılır ve `export PGPASSFILE` ile verilir. Dosya `pg_dump` bittikten hemen sonra silinir; `trap cleanup EXIT` hata yolunda da siler.
3. `pg_dump --dbname` artık parolasız URL alır (`postgresql://<kullanıcı>@<host>:<port>/<db>?<sorgu>`).
4. Parola yoksa (URL'de `user@`), passfile oluşmaz; `PGPASSWORD` gibi ortam kullanımı aynen çalışır.
5. Kabul edilmeyen durumlar, değeri yazmadan `FAIL` verir: `postgresql://` olmayan URL, IPv6 host, sorguda `password=`.
6. Başlık yorumu (satır 26–28) yeni davranışı anlatır.

Değişmeyenler: exit kodları, dosya adı (`fonbridge-<stamp>.dump`), `.sha256`, `BACKUP_AGE_RECIPIENT` şifrelemesi, retention, `--no-owner`/`--format=custom`, dump dosya izni (varsayılan umask).

## Kanıt (ham çıktı, parola maskeli)

### argv sızıntısı — önce / sonra
Aynı koşum (`pg_dump` çalışırken `ps -axo args` 10 ms aralıkla örneklendi):

```
ORİJİNAL (origin/dev):  ps örnek satırı sayısı: 44   parolanın URL-kodlu hali içeren: 43   çözülmüş hali: 0
YENİ (bu dal):          ps örnek satırı sayısı: 44   parolanın URL-kodlu hali içeren: 0    çözülmüş hali: 0
YENİ — örnek satır:  pg_dump --dbname=postgresql://<url-without-password> --format=custom --no-owner --file=<tmp>
```

### yerel yedek (pnpm backup:db, yerel PostgreSQL 16, TCP, tek seferlik test kümesi)
```
$ pnpm backup:db            -> exit 0
[pg-backup] dumping to fonbridge-20261017T082811Z.dump
[pg-backup] ok: fonbridge-20261017T082811Z.dump  32M toc_entries=3
dosyalar: fonbridge-20261017T082811Z.dump, fonbridge-20261017T082811Z.dump.sha256
```

### negatif ve kenar durumlar
```
A) yanlış parola            -> exit 1; "password authentication failed for user bk_test"; dump yok; parola logda: 0
B) ?sslmode=disable&...     -> exit 0 (sorgu parametreleri korundu)
C) mysql:// URL             -> exit 1; "FAIL: BACKUP_DATABASE_URL is not a postgresql:// URL with user@host/db"; gizli değer logda: 0
D) değişken yok             -> exit 1 (mevcut `:?` hatası, değişmedi)
E) ?password= sorguda       -> exit 1; "FAIL: password= in the BACKUP_DATABASE_URL query is not supported..."
F) parolasız URL + PGPASSWORD -> exit 0 (passfile oluşmadı)
passfile sızıntısı (tüm koşumlardan sonra): 0
```
Test parolası özel karakter içerir (`@ : \ %`), URL'de yüzde-kodludur; çözümleme doğru çalıştı (oturum açıldı).

### geri yükleme provası (pnpm backup:restore-drill)
```
[restore-drill] checksum ok
[restore-drill] table row counts (identical on both sides):
    public.t=1500000
[restore-drill] ok: 1 tables, restore 1s, total 1s
drill_exit=0; parola logda: 0
```

### lint / typecheck
- `pnpm db:generate` → exit 0
- `pnpm lint` → exit 0 (0 hata; 4 uyarı, hepsi test dosyalarında, bu değişiklikle ilgisiz)
- `pnpm typecheck` → exit 0

### push (kapı)
`git push -u origin devop-fb/fo35-pgpass-argv` → exit 1, `pre-push` kancası `pnpm gate` koşturdu:
```
✖ 4 problems (0 errors, 4 warnings)     <- lint geçti
$ tsc --noEmit                           <- typecheck geçti
$ vitest run --passWithNoTests           <- BAŞARISIZ
  ... tests/helpers/live-db-role.ts (readRole, assertAppOwnerRole) ...
  pg SASL auth hatası; Prisma P1000 AuthenticationFailed
```
Başarısız dosyalar tümüyle canlı DB'ye bağlı testler (`plan-admin`, `plan-repository`, `api-key-rate-limit.live`, `bearer-token-hash.live`, `settings-profile-update`, `billing-checkout-auth`, …). Yedek betiğiyle ilgili hiçbir test başarısız değil. Kök neden: bu worktree'de proje `.env` dosyası yok (`injected env (0) from .env`), bu yüzden gate DB kimlik bilgisi olmadan bağlanıyor.

## Değişen dosyalar
- `scripts/backup/pg-backup.sh` (+53 / −4)
- `docs/agent-results/TASK-MVC406JHEDGLL-devop-fb.md` (bu dosya)

## Riskler
- `pg-restore-drill.sh` aynı sınıf sorunu taşıyor: `psql "$url"` ile `BACKUP_DATABASE_URL` (parolalı) argv'de. Kart bu betiği kapsam dışı bıraktı; ayrı bir kart gerekir.
- `pg_restore --list` ve `shasum` Linux'ta (sunucu) koşmadı.
- Parola dosyası kısa süre diskte (0600, `pg_dump` süresince). Ortam değişkeni yerine seçildi çünkü `PGPASSWORD` `ps e` / `/proc/<pid>/environ` ile görülebilir.
- Parolada `\` ya da `:` olması passfile kaçışıyla (`\\`, `\:`) ele alındı; `%` kodlaması URL standardına bağlı. Kodlanmamış `@ ? #` içeren parola regex'i geçmez ve açık hata verir.

## Açık sorular
1. **Push için DB kimlik bilgisi:** `pre-push` kapısının bu worktree'de koşması için proje `.env` gerekiyor. Ana checkout'taki `.env` dosyası bu worktree'ye kopyalanabilir mi, yoksa push'u yetkili ortamdan mı yapalım? Bu karar sana ait; ben `.env` içeriğine dokunmadım.
2. **Sonuç dosyası yolu:** Kart `docs/agent-results/...` diyor; lider metni `/Users/macbook/alan/docs/agent-results/...` veriyor. Dosya projenin reposuna (`FONBRIDGE/docs/agent-results/`) yazıldı, çünkü kanıt commit'e girmeli. İstenirse aynı içerik çalışma alanı köküne de kopyalanır.
3. **Drill kartı:** `pg-restore-drill.sh` için ayrı bir kart açılsın mı?

## Sonraki adım
1. Yukarıdaki (1) kararından sonra `git push -u origin devop-fb/fo35-pgpass-argv` (kapı yeşil olmalı; `--no-verify` YOK).
2. `gh pr create --base dev` (merge ETME).
3. Kart: `review` yalnız PR açıldıktan sonra.

Hafıza: worktree'de push kapısının `.env` istediğini not ettim (devop-fb hafızasında).
