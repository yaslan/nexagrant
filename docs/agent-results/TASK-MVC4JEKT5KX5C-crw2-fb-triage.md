---
kart: TASK-MVC4JEKT5KX5C
kod: FO-39 + FO-35 · PR kuyruğu triyajı
ajan: crw2-fb
tip: review (triyaj, #90 + #83)
hüküm: "#90 MERGE'E HAZIR (head 6d0a0f49, güncel dev ile birleşik ağaçta tsc/vitest/i18n/eslint yeşil) · #83 EKSİK: 5af0c41d push edilmedi (PR head hâlâ 4f2c9f54, drill hâlâ yanlış PASS veriyor); devop-fb push etmeli, drill DoD ifadesi için lider/patron kararı gerekiyor"
platform: "mac (darwin arm64, /bin/bash 3.2.57, Node + vitest 4.1.11 jsdom). Windows/Linux koşulamadı. bash 5 ve shellcheck bu makinede yok"
tarih: 2026-10-18
---

# PR kuyruğu triyajı: #90 (FO-39) ve #83 (FO-35), crw2-fb

Hiçbir PR'ı merge etmedim, approve vermedim, kod değiştirmedim. Canlı DB'ye dokunmadım. `.env` okunmadı. İnceleme scratchpad'deki iki detached worktree'de yapıldı ve sonunda silindi.

## Özet

| PR | Head (gh + ls-remote) | Hüküm |
|---|---|---|
| **#90** `fe-fb/fo39-modules-page` → dev | `6d0a0f49` ✅ (beklenen sha) | **MERGE'E HAZIR** |
| **#83** `devop-fb/fo35-pgpass-argv` → dev | `4f2c9f54` ❌ (`5af0c41d` yalnız yerelde) | **EKSİK:** `5af0c41d` push edilmeli (sorumlu: devop-fb) + drill DoD ifadesi kararı (sorumlu: lider/patron) + PR'daki eski rapor düzeltilmeli (sorumlu: devop-fb) |

GitHub Actions kontrolleri (#90'da `build-and-test`, `i18n-audit`, `lighthouse-a11y` FAILURE) 2 saniyede bitmiş. Bu billing engeliyle uyumlu, kodla ilgisi yok. Hükümler yerel kanıta dayanıyor.

---

## PR #90 (FO-39): MERGE'E HAZIR

### Doğrulanan
- Önceki raporumda (`TASK-MVC4JEKT5KX5C-crw2-fb-3.md`) koşul şuydu: "fe-fb `6d0a0f49`'i değiştirmeden push ederse merge'e hazır." **Koşul sağlandı.** `gh pr view 90` ve `git ls-remote` ikisi de `6d0a0f49157ea8a8…` veriyor. Önceki raporun a11y ölçümleri (Chrome AX: ad = etiket, açıklama = kilit nedeni, id'ler benzersiz) aynı sha için geçerli.
- **Kapsam değişti, not edilmeli:** Asıl modül sayfası (`64e5f2f7`) zaten **PR #88** ile dev'e girdi (2026-10-17 10:58Z). #90'ın dev'e göre farkı yalnız 3 dosya: `src/components/SidebarNav.tsx`, `tests/module-entry-points.test.tsx`, `tests/e2e/plan-entitlement.spec.ts`. Bu fark yalnız a11y düzeltmesi (B1/B2/B3).
- İlk incelememdeki B1 (kilitli menüdeki rotalar sunucuda korunmuyor) **PR #101 (FO-54)** ile dev'e girdi (2026-10-18 11:10Z). Artık açık değil.
- dev, PR'ın tabanından 71 commit ilerledi. `git merge-tree --write-tree origin/dev 6d0a0f49` → **exit 0**. Birleşik ağaçta (`725b539e`, scratch) koşulanlar:

```
$ gh pr view 90 --json headRefOid  → 6d0a0f49157ea8a82b16928634b9b20ee5a7b7d1
$ git ls-remote origin refs/heads/fe-fb/fo39-modules-page → 6d0a0f49157ea8a82b16928634b9b20ee5a7b7d1
$ git diff --name-only origin/dev...6d0a0f49 (agent-results hariç)
src/components/SidebarNav.tsx
tests/e2e/plan-entitlement.spec.ts
tests/module-entry-points.test.tsx
$ git merge-tree --write-tree origin/dev 6d0a0f49 → exit 0
# birleşik ağaç (6d0a0f49 + origin/dev a59c7479), pnpm install --frozen-lockfile
$ pnpm exec tsc --noEmit -p .            → exit 0, çıktı yok
$ pnpm exec vitest run tests/module-entry-points.test.tsx
 Test Files  1 passed (1)
      Tests  10 passed (10)
$ pnpm i18n:check
✅ i18n check passed: both catalogs agree, every key used in src/ resolves, and no file gained hard-coded text.
$ pnpm exec eslint src/components/SidebarNav.tsx tests/module-entry-points.test.tsx tests/e2e/plan-entitlement.spec.ts → exit 0
```

### Koşulmayan
- `tests/e2e/plan-entitlement.spec.ts` koşulmadı. DB ve uygulama sunucusu gerekiyor, görev "canlı DB'ye dokunma" diyor. Değişiklik bu dosyaya 4 satırlık bir a11y assert'i ekliyor. Aynı ad ve açıklama değerleri birim testinde ve Chrome AX ölçümünde (önceki rapor) doğrulandı.
- Tam `pnpm gate` koşulmadı.

### Bulgular
- Bloke eden bulgu yok.
- **Ö1 [bilgi]** PR başlığı/açıklaması hâlâ `ea724729`'un mesajını taşıyor ("describe locked sidebar entries via aria-describedby"). Merge commit mesajı açısından sorun yok, isteğe bağlı.

---

## PR #83 (FO-35): EKSİK

### Durum
```
$ gh pr view 83 --json headRefOid → 4f2c9f540a8993df567329592af1607cecd5d69b
$ git ls-remote origin refs/heads/devop-fb/fo35-pgpass-argv → 4f2c9f54…
$ git log --oneline origin/devop-fb/fo35-pgpass-argv..devop-fb/fo35-pgpass-argv
5af0c41d fix(backup): fail the restore drill on count errors; reject @ in URL host
```
devop-fb-3 raporunu (`/Users/macbook/alan/docs/agent-results/TASK-MVC406JHEDGLL-devop-fb-3.md`, repo dışında, commit edilmemiş) doğruladım: `5af0c41d` yalnız yerel dalda. Push, pre-push kapısında durmuş: yerel kümede `fabrika` rolü/DB'si yokken vitest kırmızı. `--no-verify` kullanılmamış, doğru karar.

### PR head'inde (4f2c9f54) bugün olan: yanlış PASS hâlâ duruyor
Head'deki drill betiği, psql shim'iyle sayım sorgusu hata verdiğinde:
```
ERROR: simulated permission denied   (×2)
[restore-drill] ok: 0 tables, restore 0s, total 0s
```
Yani #83 bu hâliyle merge edilirse crw-fb-2'nin **[Yüksek] 1** bulgusu dev'e girer.

### 5af0c41d'yi bağımsız olarak doğruladım (crw-fb-2 bulgularına karşı)
Shim düzeneği: sahte `psql`/`pg_restore` PATH'te, gerçek DB yok. URL'lerde parola belirteci `S3cr…`.

| crw-fb-2 bulgusu | 5af0c41d'de | Kanıt |
|---|---|---|
| 1 [Yüksek] sayım hatası → PASS | ✅ düzeldi | `countfail` rc=1 · `listfail` (tablo listesi sorgusu hata) rc=1 · `norows` (BEGIN/COMMIT, satır yok) rc=1 · `ok` rc=0, "ok: 1 tables" |
| 2 [Yüksek] canlı kaynakta DoD | ⏳ **karar gerekiyor** | Kodla çözülecek bir şey değil. devop-fb-3 ifadeyi öneriyor: "canlıda FAIL (canlı yazma), sabit kopyada PASS, kapsam sınırı yazılı". Betik başlığında (satır 21-23) bu sınır zaten yazılı. Karar lider/patronda |
| 3 [Orta] PR'daki devop-fb-2 raporu eski tasarımı (PGPASSFILE) anlatıyor | ❌ açık | Commit kancası üzerine yazmayı reddetmiş. devop-fb-3 raporu repo dışında kalmış. PR'da hâlâ yalnız çelişen rapor var |
| 4 [Düşük] yorum fazla genel, `.partial` retention | ✅ düzeldi | Yorum ölçülene indirilmiş (TERM/HUP ölçüldü, INT ölçülmedi). Retention'a `fonbridge-*.dump.partial` eklenmiş (kod okuma, koşulmadı) |
| 5 [Düşük] host'ta `@` | ✅ düzeldi | `postgresql://u:p@ss@h:5432/d` → REJ · `p%40ss` → OK, passlen=4 · `a%5Cb` + `?sslmode` → OK · `%zz` → REJ |
| argv'de parola (asıl FO-35) | ✅ | 4 koşunun hepsinde shim argv logunda `S3cr` = 0 |
| dev ile çakışma | ✅ | `git merge-tree --write-tree origin/dev 5af0c41d` → exit 0. dev'de `scripts/backup` için değişiklik yok |
| sözdizimi | ✅ | `/bin/bash -n` üç dosya için ok (3.2.57) |

```
== ok        rc=0  [restore-drill] ok: 1 tables ...       pw-in-argv: 0
== countfail rc=1  ERROR: simulated permission denied      pw-in-argv: 0
== listfail  rc=1  ERROR: list denied                      pw-in-argv: 0
== norows    rc=1  (FAIL satırı yok)                         pw-in-argv: 0
```

### Yeni bulgu (5af0c41d), bloke etmiyor
- **Ö-83-1 [Düşük, öneri] `counts_of` içindeki FAIL mesajı yutuluyor.** `pg-restore-drill.sh:30` `fail` mesajı stdout'a yazar. `counts_of` ise `src_counts="$(counts_of …)"` (satır 122-123) ile komut ikamesinde çağrılıyor. Bu yüzden `log "FAIL: row count query failed on source"` değişkene gidiyor, ekrana basılmıyor. Betik `set -e` ile doğru şekilde exit 1 veriyor (fail-closed). Ama `norows` durumunda operatör hiçbir neden görmüyor; diğer iki durumda yalnız psql'in kendi `ERROR:` satırını görüyor. Önerilen düzeltme: `fail() { log "FAIL: $*" >&2; exit 1; }`. Güvenlik/doğruluk açığı değil, yalnız teşhis sorunu. Merge'i bloke etmez.

### EKSİK listesi (#83 merge'e hazır olsun diye)
1. **devop-fb:** `5af0c41d`'i normal push etmeli (`--no-verify` yok). Engel yerel kapı ortamı (boş `localhost:5433` kümesi). Ya çalışan bir yerel test DB'si ile kapı yeşile çekilir ya da lider kapı istisnasına karar verir. Bu sha'yı değiştirmeden push ederse yukarıdaki doğrulama geçerli kalır.
2. **devop-fb:** PR'a güncel tasarımı anlatan rapor girmeli. devop-fb-3 raporu yeni bir dosya olarak PR dalına eklenebilir; eski dosyanın üzerine yazmaya gerek yok. Ya da PR açıklamasına "devop-fb-2 raporu superseded" notu düşülür.
3. **lider/patron:** Drill DoD'u kararı (crw-fb-2 açık soru 2 / devop-fb-3 açık soru 2). Önerim devop-fb-3'teki ifade: canlıda FAIL, sabit kopyada PASS, sınır betikte yazılı.
4. (isteğe bağlı) Ö-83-1: tek satırlık `>&2` düzeltmesi.

---

## Değişen dosyalar
- `docs/agent-results/TASK-MVC4JEKT5KX5C-crw2-fb-triage.md` (bu rapor; aynı içerik `/Users/macbook/alan/docs/agent-results/` altına da kopyalandı)
- Kod değişikliği yok. Scratch worktree'ler (`wt90` = 6d0a0f49 + dev merge, `wt83` = 5af0c41d) ve shim dosyaları silindi. fe-fb ve devop-fb ağaçlarına dokunulmadı.

## Riskler
- #90 merge edilmeden head değişirse (yeni commit, rebase) bu hüküm geçersiz olur. `gh pr view 90 --json headRefOid` = `6d0a0f49` kontrolü yeterli.
- #83 push sırasında `5af0c41d` dışında bir sha'ya giderse yeniden kontrol gerekir.
- #83'teki drill doğrulaması shim ile yapıldı, gerçek Postgres ile değil. Gerçek DB ile temiz PASS devop-fb-3 raporunda (`fo35_src`, 3 tablo, rc=0) var. Ben canlı DB'ye dokunmama kuralı yüzünden tekrarlamadım.
- `PGPASSWORD` aynı kullanıcı tarafından `ps eww` ile görülebilir (bilinen ve belgelenmiş, kabul edilmiş risk).

## Açık sorular
1. #83 kapısı: devop-fb hangi yerel DB ile pre-push kapısını koşacak? Bu soru devop-fb-3'te açık, sahibi lider.
2. #83 drill DoD ifadesi (yukarıda madde 3).

## Sonraki adım
1. Lider/patron: #90 merge kararı (hazır).
2. devop-fb: #83 için madde 1-2. Ardından `gh pr view 83` head = `5af0c41d` mı diye tek satırlık bir kontrol yeterli.

## Platform beyanı
- **Doğrulandı:** mac (darwin arm64): Node/pnpm, vitest 4.1.11 (jsdom), tsc, eslint, `/bin/bash` 3.2.57.
- **Windows:** koşulamadı, bu makine yalnız mac. #90 yalnız React DOM/ARIA değişikliği, platforma bağlı bir yol yok. #83 bash betikleri Windows için hedeflenmiyor (sunucu Linux).
- **Linux:** koşulamadı, makine yok. #83 koddan: `[[ =~ ]]` ve `BASH_REMATCH` bash 3.2 ve 5'te aynı çalışır. `shasum` (pg-backup.sh, drill:75) GNU dağıtımlarında `perl-Digest-SHA` olmadan bulunmayabilir. Bu risk PR'dan önce de vardı, crw-fb-2'de de not edilmişti.
- bash 5 ve shellcheck bu makinede yok.
