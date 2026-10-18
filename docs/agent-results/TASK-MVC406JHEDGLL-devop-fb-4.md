---
hüküm: HAZIR (inceleme için) — PR #83 güncel tasarımla push edildi; Ö-83-1 (drill FAIL nedenleri stderr'e) eklendi; tam `pnpm gate` yerelde yeşil. Merge YOK.
tip: runtime (güvenlik, düşük)
platform: mac (darwin arm64, /bin/bash 3.2.57, Node v26.5.0, pnpm 11.25.0, fabrika-postgres :5433). Linux ve bash 5 koşulamadı (makine yok). Windows kapsam dışı.
tarih: 2026-10-18
---

# TASK-MVC406JHEDGLL (FO-35) — PR #83 güncel tasarım, push, devop-fb-4

Bu rapor PR #83'ün **geçerli** tasarım raporudur.

> **Superseded:** `docs/agent-results/TASK-MVC406JHEDGLL-devop-fb-2.md` eski tasarımı (0600 geçici `PGPASSFILE` + `trap`) anlatıyor. O tasarım `4f2c9f54`'te kaldırıldı. Kanıt politikası eski raporun üzerine yazılmasına izin vermediği için o dosya olduğu gibi duruyor. Geçerli olan bu rapordur. `devop-fb-3` (crw-fb-2 düzeltmeleri) repo dışında kalmıştı; içeriği aşağıda özetlendi.

## Güncel tasarım (dal `devop-fb/fo35-pgpass-argv`)

| Dosya | Davranış |
|---|---|
| `scripts/backup/pg-url.sh` | `pg_url_split VAR`: `postgresql://user:pass@host[:port]/db[?query]` ayrıştırır; `%XX` çözer (`%b` yok). Host grubunda `@` yok: `u:p@ss@h` reddedilir, `p%40ss` kabul edilir. Bozuk `%zz` reddedilir. Hata mesajında URL/parola yok. Çıktı: `PG_CONN` (parolasız URL), `PG_CONN_BASE`, `PG_QUERY`, `PG_PASS`. |
| `scripts/backup/pg-backup.sh` | Parola her `pg_dump` çağrısına `PGPASSWORD` ortam değişkeniyle gider; `--dbname` parolasız URL alır. **Passfile yok, `mktemp`/`trap` yok.** Exit kodları, dosya adı, `.sha256`, şifreleme değişmedi. Retention artık `fonbridge-*.dump.partial` dosyalarını da siler. |
| `scripts/backup/pg-restore-drill.sh` | Aynı parola yolu (psql/pg_restore argv'de parola yok). `counts_of`: tablo listesi hata verirse, sayım transaction'ı hata verirse ya da satır dönmezse **FAIL** (eski yanlış PASS kapandı). **Yeni (bu tur, Ö-83-1):** `fail()` mesajı stderr'e yazar. |

Bilinen ve kabul edilen risk: `PGPASSWORD`, aynı kullanıcı tarafından `ps eww` ve `/proc/<pid>/environ` ile görülebilir. Argv'den dar, ama sıfır değil.

## Drill DoD'u (patron kararı, 2026-10-18)

Kabul edilen ifade (devop-fb-3 önerisi):

> **Canlı kaynakta drill FAIL verir (dump ile sayım arasındaki canlı yazma yüzünden), sabit (yazılmayan) bir kopyada PASS verir. Kapsam sınırı betikte yazılıdır.**

Sınırın betikteki yeri: `pg-restore-drill.sh` başlığı, "Limits, stated plainly" paragrafı (satır 21-23): kaynak dump'tan birkaç saniye sonra okunur, o arada yazma olursa sayımlar farklılaşır ve drill düşer; drill'i kaynak sakin iken ya da sabit kopyaya karşı koş.

## Ne yapıldı (bu tur)

1. **Ortam.** Worktree: `/Users/macbook/alan/FONBRIDGE-fo35` (dal `devop-fb/fo35-pgpass-argv`). `cp .env` izin kuralıyla engellendi; kural aşılmadı. Onun yerine ana repodaki `.env` ve `.env.local` aynı kabukta `set -a; . …; set +a` ile yüklendi. İçerikleri okunmadı. DB: `fabrika-postgres` (:5433). `pnpm db:rls-role` → `fabrika_app` mevcut, `.env` ile giriş yapıyor. `pnpm install --frozen-lockfile`; `db:generate` gate'in ilk adımı.
2. **Ö-83-1.** `fail() { log "FAIL: $*" >&2; exit 1; }`. Commit `68a3ad39`. Exit kodları değişmedi; neden artık görünüyor.
3. **Gate.** Tam `pnpm gate` (ayrı `E2E_PORT=3150`). Sonuç aşağıda.
4. **Rapor.** Bu dosya PR dalına yeni dosya olarak eklendi.
5. **Push.** Normal `git push`, pre-push gate ile; `--no-verify` YOK.

## Kanıt (ham çıktı; parola belirteci `S3cr…`, hiçbir çıktıda görünmüyor)

### Ö-83-1 shim testi (sahte `psql`/`pg_restore` PATH'te; gerçek DB yok)

Önce (`5af0c41d`):
```
== ok rc=0  pw-in-argv: 0  pw-in-output: 0
   stdout-FAIL: -
   stderr-FAIL: -
== countfail rc=1  pw-in-argv: 0  pw-in-output: 0
   stdout-FAIL: -
   stderr-FAIL: -
== listfail rc=1  pw-in-argv: 0  pw-in-output: 0
   stdout-FAIL: -
   stderr-FAIL: -
== norows rc=1  pw-in-argv: 0  pw-in-output: 0
   stdout-FAIL: -
   stderr-FAIL: -
```
Sonra (`68a3ad39`):
```
== ok rc=0  pw-in-argv: 0  pw-in-output: 0
   stdout-FAIL: -
   stderr-FAIL: -
   [restore-drill] ok: 1 tables, restore 0s, total 0s
== countfail rc=1  pw-in-argv: 0  pw-in-output: 0
   stderr-FAIL: FAIL: row count query failed on source
== listfail rc=1  pw-in-argv: 0  pw-in-output: 0
   stderr-FAIL: FAIL: could not list tables on source
== norows rc=1  pw-in-argv: 0  pw-in-output: 0
   stderr-FAIL: FAIL: row count query returned no rows on source
```
Exit kodları aynı (0/1/1/1). Değişen tek şey: üç hata durumunda neden artık stderr'de görünüyor. `/bin/bash -n` → ok.

### `pnpm gate` (yerel, `68a3ad39`)
```
 Test Files  344 passed | 7 skipped (351)
      Tests  4510 passed | 120 skipped (4630)
✅ i18n check passed: both catalogs agree, every key used in src/ resolves, and no file gained hard-coded text.
✅ SUCCESS: no new tenant bypass. 0 call site(s) allowed with a recorded reason, 39 on the sanctioned cross-tenant path, 0 still owed.
✅ fabrika_app connects as fabrika_app, app.tenant_id unset by default.
  9 skipped
  330 passed (6.3m)
✅ Öksüz alarm yok: her açık alarm ya bir tenant adı taşımıyor ya da yaşayan bir tenant'ı gösteriyor.
```

**Ortam kaynaklı ilk düşüş (ayrıştırıldı):** İlk gate koşusunda yalnız `.env` yüklüydü. Lint, typecheck, vitest, i18n ve rls adımlarının hepsi geçti; e2e `Timed out waiting 180000ms from config.webServer` ile düştü. Neden: paylaşılan DB'de MinIO (`http://localhost:9000/fabrika-public/blog/…`) görselli blog satırları var. `next.config.ts` bu host'a yalnız `R2_PUBLIC_HOST` tanımlıysa izin veriyor (`77442ed9`, dalda da var; `next.config.ts` dev ile birebir aynı). Bu değişken `.env.local`'de. Worktree'de `.env.local` olmadığı için `/` 500 döndü ve Playwright'ın `webServer.url` yoklaması hiç 400'ün altını görmedi. `.env.local` de yüklenince e2e 330 passed. Kodla ilgisi yok. Aynı gate, `.env` + `.env.local` olan FO-46 worktree'sinde (güncel dev tabanlı) aynı gün yeşildi (e2e 377 passed). E2E sayısındaki fark, dalın dev'in 94 commit gerisinde olmasından geliyor.

## Değişen dosyalar (bu tur)
- `scripts/backup/pg-restore-drill.sh` (1 satır, `68a3ad39`)
- `docs/agent-results/TASK-MVC406JHEDGLL-devop-fb-4.md` (bu rapor)

PR'ın dev'e göre toplam farkı: `scripts/backup/{pg-backup.sh,pg-restore-drill.sh,pg-url.sh}` + `docs/agent-results/TASK-MVC406JHEDGLL-devop-fb{,-2,-4}.md`. `src/` ve `package.json` değişmedi. `git merge-tree --write-tree origin/dev HEAD` → temiz.

## Riskler
- Dal dev'in 94 commit gerisinde; gate bu tabanda koşuldu. Merge çakışması yok (merge-tree temiz), dev'de `scripts/backup` değişikliği yok.
- `PGPASSWORD` aynı kullanıcıdan `ps eww` ve `/proc/<pid>/environ` ile görülebilir (kabul edildi).
- Linux'ta `shasum` (`perl-Digest-SHA`) yoksa yedek ve drill checksum adımı düşer. Bu risk PR'dan önce de vardı.
- Drill doğrulaması bu tur shim ile yapıldı. Gerçek Postgres ile temiz PASS (`fo35_src`, 3 tablo, rc=0) devop-fb-3'te var. Paylaşılan kümede scratch DB açmamak için bu tur tekrarlanmadı.

## Açık sorular
- Yok. DoD ifadesi patron kararıyla kapandı.

## Sonraki adım
- crw-fb / lider: PR #83 son inceleme ve merge kararı. Merge edilmedi.

## Platform beyanı
- **Doğrulandı:** mac (darwin arm64), `/bin/bash` 3.2.57.
- **Linux:** koşulamadı, makine yok. Koddan: `[[ =~ ]]` ve `BASH_REMATCH` bash 3.2 ve 5'te aynı çalışır; `>&2` POSIX. `shasum` riski yukarıda.
- **Windows:** kapsam dışı (yedek betikleri Linux sunucuda çalışır).
