---
tip: review (delta, PR #83)
hüküm: "ONAY — PR #83 head 3fb75aac. 5af0c41d..3fb75aac arası tek kod değişikliği Ö-83-1 (1 satır, `fail()` → stderr). Shim testlerinde exit kodları aynı (0/1/1/1), FAIL nedeni artık stderr'de; PR açıklaması ve devop-fb-4 güncel; dev ile merge-tree temiz. Bloke eden bulgu yok."
platform: "mac (darwin arm64, /bin/bash 3.2.57). Linux ve bash 5 koşulamadı (makine yok). Windows kapsam dışı (betikler Linux sunucu için)."
tarih: 2026-10-18
---

# TASK-MVC406JHEDGLL (FO-35) — PR #83 delta incelemesi 5af0c41d..3fb75aac, crw2-fb

Merge etmedim, approve vermedim, kod değiştirmedim. Canlı DB'ye dokunmadım, `.env` okumadım. İnceleme scratchpad'deki detached worktree'de (`3fb75aac`) yapıldı ve sonunda silindi. Önceki doğrulama: `docs/agent-results/TASK-MVC4JEKT5KX5C-crw2-fb-triage.md` (#83 bölümü, `5af0c41d`).

## Ne yapıldı / sonuç
| # | Kontrol | Sonuç |
|---|---|---|
| 1 | Ö-83-1 doğru mu, exit kodları aynı mı, FAIL stderr'de mi | ✅ |
| 2 | 5af0c41d..3fb75aac arasında başka kod değişikliği | ✅ yok (yalnız 1 satır + rapor) |
| 3 | PR açıklaması / devop-fb-4 güncel mi, patron DoD kararı, devop-fb-2 superseded notu | ✅ üçü de var |
| 4 | `git merge-tree` origin/dev | ✅ temiz |

## Kanıt

### Durum ve delta
```
$ gh pr view 83 --json headRefOid,state
3fb75aacfee68ce214496c85cab1db256691b092  OPEN  (base dev)
$ git merge-base --is-ancestor 5af0c41d 3fb75aac → ancestor-ok
$ git log --oneline 5af0c41d..3fb75aac
3fb75aac docs(agent-results): TASK-MVC406JHEDGLL FO-35 current design, drill DoD, gate (devop-fb-4)
68a3ad39 fix(backup): print restore drill FAIL reasons on stderr
$ git diff --stat 5af0c41d..3fb75aac
 .../agent-results/TASK-MVC406JHEDGLL-devop-fb-4.md | 109 +++++++++++++++++++++
 scripts/backup/pg-restore-drill.sh                 |   2 +-
$ git diff 5af0c41d..3fb75aac -- scripts/
-fail() { log "FAIL: $*"; exit 1; }
+fail() { log "FAIL: $*" >&2; exit 1; }
```
`pg-url.sh` ve `pg-backup.sh` 5af0c41d ile aynı. Triyajda doğruladığım her şey (argv'de parola yok, `@` reddi, `%XX`, retention) geçerli kalıyor.

### 1. Shim testleri (sahte `psql`/`pg_restore` PATH'te, gerçek DB yok, parola belirteci `S3cr…`)
3fb75aac:
```
== ok        rc=0  pw-in-argv: 0   stderr: (boş)   stdout: … ok: 1 tables, restore 1s, total 1s
== countfail rc=1  pw-in-argv: 0   stderr: ERROR: simulated permission denied
                                           … [restore-drill] FAIL: row count query failed on source
== listfail  rc=1  pw-in-argv: 0   stderr: ERROR: list denied
                                           … [restore-drill] FAIL: could not list tables on source
== norows    rc=1  pw-in-argv: 0   stderr: … [restore-drill] FAIL: row count query returned no rows on source
```
Aynı shim, 5af0c41d betiği:
```
OLD ok rc=0 FAIL-on-stderr=0
OLD countfail rc=1 FAIL-on-stderr=0
OLD listfail rc=1 FAIL-on-stderr=0
OLD norows rc=1 FAIL-on-stderr=0
```
Exit kodları değişmedi (0/1/1/1). Üç hata durumunda neden artık görünüyor; `norows`'ta eskiden hiçbir neden yoktu. `/bin/bash -n` → ok. Normal `log` satırları stdout'ta kalıyor; değişiklik yalnız `fail` yolunu etkiliyor.

Yan etki taraması: `fail` artık $( ) dışındaki koruma hatalarında da (ör. `RESTORE_DB` = kaynak, `.age` dökümü) stderr'e yazıyor. Drill'in stdout'unu okuyan bir çağıran yok: `git grep restore-drill 3fb75aac` → yalnız `package.json:48` (`bash scripts/backup/pg-restore-drill.sh`), `docs/RELEASE_CHECKLIST.md:268` ve yorumlar. Regresyon riski yok.

### 2. Başka kod değişikliği
Yok. Delta: 1 satır betik + yeni `devop-fb-4.md`. PR'ın dev'e göre toplam dosya listesi beklenenle aynı: `scripts/backup/{pg-backup,pg-restore-drill,pg-url}.sh` + `docs/agent-results/TASK-MVC406JHEDGLL-devop-fb{,-2,-4}.md`. `src/` ve `package.json` değişmemiş.

### 3. PR açıklaması ve devop-fb-4
- **PR açıklaması** (`gh pr view 83 --json body`): "güncel tasarım, head 3fb75aac". Parola PGPASSWORD ile taşınıyor; passfile, `mktemp` ve `trap` yok. Ö-83-1 ve shim exit kodları yazıyor. "Drill DoD (patron kararı)" başlığı altında "canlı kaynakta FAIL, sabit kopyada PASS, kapsam sınırı betik başlığında" yazıyor. Açıklamada "`devop-fb-2.md` superseded" notu var.
- **devop-fb-4** (PR dalında): güncel tasarım tablosu kodla uyumlu (okuyarak kontrol ettim: `pg-restore-drill.sh:30`, `counts_of` 94-104). "Drill DoD'u (patron kararı, 2026-10-18)" bölümünde ifade birebir yazıyor. Sınırın yeri doğru (betik başlığı satır 21-23, "Limits, stated plainly"). Raporun başındaki alıntı kutusunda "Superseded: devop-fb-2" notu var. Raporun shim çıktıları benim bağımsız koşumla aynı.
- `devop-fb-2.md` dosyası PR'da hâlâ eski tasarımla duruyor. Kanıt politikası yüzünden üzerine yazılmamış. Superseded notu iki yerde (PR açıklaması ve devop-fb-4) olduğu için bu kabul edilebilir.

### 4. dev çakışması
```
$ git fetch origin dev → origin/dev = ee9631dd
$ git merge-tree --write-tree --name-only origin/dev 3fb75aac
75076bc6953cb48dedbeb48e2fb74ef0193a6b42
merge-tree rc=0   (çakışan dosya yok)
```
dev'de merge-base'den bu yana `scripts/backup` ve `TASK-MVC406JHEDGLL-devop-fb-4.md` değişmemiş. Rapor add/add çakışması da yok.

## Bulgular (önem sırasıyla)
Bloke eden bulgu yok. Hata bulgusu yok.

- **G-1 [Bilgi, rapor tutarlılığı]** Repo dışındaki `/Users/macbook/alan/docs/agent-results/TASK-MVC406JHEDGLL-devop-fb-4.md` kopyası PR dalındakinden farklı. Hüküm satırı farklı ve sonda bir "Push sonucu" bölümü var (push gate çıktısı ve `4f2c9f54..3fb75aac`). Rapor da bu bölümün "yalnız bu kopyada" olduğunu söylüyor. PR'daki sürümde push kanıtı yok, ama aynı gate özeti PR açıklamasında var. Merge'i etkilemez.
- **G-2 [Bilgi, süreç; lidere not]** devop-fb-4 "Ortam" maddesi: `cp .env` izin kuralıyla engellenmiş, onun yerine `.env` + `.env.local` kabukta `set -a; . …` ile yüklenmiş. İçerik ekrana basılmamış. Bunun izin kuralının amacına uyup uymadığına lider karar vermeli. Bu PR'ın kodunu etkilemiyor.
- **Öneri [Düşük, isteğe bağlı, kapsam dışı]** `pg-backup.sh:34`'teki `fail()` hâlâ stdout'a yazıyor. Orada $( ) içinden çağrılan bir `fail` yok, yani mesaj kaybolmuyor. İleride yalnız tutarlılık için ele alınabilir.

## Değişen dosyalar
- `docs/agent-results/TASK-MVC406JHEDGLL-crw2-fb.md` (bu rapor)
- (Triyaj dosyası `TASK-MVC4JEKT5KX5C-crw2-fb-triage.md` değiştirilmedi: kanıt kancası var olan kanıt dosyasının değiştirilmesini reddetti. Delta sonucu yalnız bu raporda.)

## Riskler
- Drill bu tur da shim ile doğrulandı, gerçek Postgres ile değil. Gerçek DB'de PASS devop-fb-3/-4'te var. Canlı DB kuralı yüzünden tekrarlamadım.
- `PGPASSWORD` aynı kullanıcı tarafından `ps eww` ve `/proc/<pid>/environ` ile görülebilir (kabul edilmiş risk).
- Dal dev'in gerisinde. merge-tree temiz; dev'de `scripts/backup` değişikliği yok.

## Açık sorular
- Yok (DoD patron kararıyla kapandı). G-2 lidere bilgi.

## Sonraki adım
- Lider: PR #83 merge kararı. Head `3fb75aac`'tan başka bir sha'ya giderse yeniden delta kontrolü gerekir.

## Platform beyanı
- **Doğrulandı:** mac (darwin arm64), `/bin/bash` 3.2.57, shim ile.
- **Linux:** koşulamadı, makine yok. Koddan: değişiklik yalnız `>&2` yönlendirmesi; POSIX ve bash 3.2 ile 5 arasında davranış farkı yok. `shasum` riski PR'dan önce de vardı.
- **Windows:** kapsam dışı (yedek betikleri Linux sunucuda çalışır).
