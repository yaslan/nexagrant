# TASK-MTVBIX1DV9HVO — Bayat worktree'leri kaldır (e2e-fix, zztest-validation)

**Ajan:** blok-zincir-denet-i (sec-en) · **Tip:** runtime/temizlik · **Sprint:** SPRINT-S12
**PLATFORM BEYANI:** mac (darwin 25.6.0, Apple Silicon) üzerinde doğrulandı. Windows/Linux **koşulmadı** — gerek de yok: yapılan iş `git worktree remove` + `git worktree prune` ve iki dosyanın `git checkout --` ile geri alınmasıdır; hiçbir platforma bağlı kod yolu (süreç öldürme, kabuk/ikili adı, ekran/DPI, izin) dokunulmadı. Kaldırılan yollar depo-göreli (`.claude/worktrees/*`) olduğundan git'in davranışı üç platformda da aynıdır; tek fark yol ayracıdır ve komutlar git'e verildiği için ayraç dönüşümünü git yapar.
**Önceki kart:** `docs/agent-results/TASK-MTV8FU2OG6VKQ-blok-zincir-denet-i.md` (envanter yarısı). Bu kart o envanterin **eylem** yarısı; "SİLME" yasağı yalnız aşağıdaki kanıt karşılığında kaldırıldı.

---

## 1. Ne yapıldı

1. İki worktree'nin ham `status --porcelain` + `diff` çıktısı alındı (§2.1).
2. Commit'siz **her hunk** için `git log -S'<benzersiz dize>' dev` ile "bu dev'de var mı" sorusu ayrı ayrı cevaplandı (§2.2, §2.3).
3. `e2e-fix` işinin `1381b43`'te olduğu, fixture e-postasındaki `Date.now()` dizesiyle doğrulandı (§2.2).
4. `zztest-validation`'da kurtarılmaya değer iş **bulunmadı**; gerekçe yazıldı (§2.3) — bu yüzden kurtarma kartı açılmadı.
5. Her iki worktree `--force` **KULLANILMADAN** kaldırıldı; `git worktree prune` koşuldu; `worktree-*` dalları korundu (§3).
6. Önce/sonra ölçümleri alındı: `git worktree list`, lint `.claude` satır sayısı, `pnpm test` süit sayısı (§4).
7. Kapsam dışı iki worktree'ye dokunulmadı, not düşüldü (§5).
8. Ölçüm sırasında ortaya çıkan **ayrı** bir kusur için kart açıldı: **TASK-MTVBX3348JNPN** (§6).

---

## 2. Kanıt — commit'siz işin akıbeti

### 2.1 Ham durum (kaldırmadan ÖNCE)

```
$ git -C .claude/worktrees/e2e-fix log -1 --oneline
414e705 fix(e2e): disable reuseExistingServer to prevent stale dev server env loss

$ git -C .claude/worktrees/e2e-fix status --porcelain
 M tests/e2e/fixtures/m9-tenant.ts
?? docs/agent-results/TASK-MTV65O6EUHJ52-geli-tirici.md

$ git -C .claude/worktrees/e2e-fix diff
diff --git a/tests/e2e/fixtures/m9-tenant.ts b/tests/e2e/fixtures/m9-tenant.ts
index 52f46a1a..bb8ac9c7 100644
--- a/tests/e2e/fixtures/m9-tenant.ts
+++ b/tests/e2e/fixtures/m9-tenant.ts
@@ -21,7 +21,9 @@ export const M9_WORKSPACE_ID = 'm9-e2e-workspace';
 export const M9_WORKSPACE = 'm9-e2e';
 export const M9_OPPORTUNITY = 'm9-e2e-opportunity';
 export const M9_USER_ID = 'm9-e2e-user';
-export const M9_EMAIL = 'm9-e2e@fabrika.test';
+// Use a timestamp suffix to prevent collisions from failed teardowns: if test N's cleanup
+// fails and test N+1 runs, they won't share the same email unique constraint.
+export const M9_EMAIL = `m9-e2e-${Date.now()}@fabrika.test`;
 export const M9_BRIEFS_URL = `/tr/${M9_WORKSPACE}/opportunities/${M9_OPPORTUNITY}/briefs`;
 
 export async function setupM9Tenant() {
@@ -58,6 +60,8 @@ export async function setupM9Tenant() {
     create: { id: M9_WORKSPACE_ID, tenantId: M9_TENANT, name: 'M9 E2E', slug: M9_WORKSPACE },
     update: {},
   });
+  // Clean up any stray user with this email from a failed teardown.
+  await prisma.user.deleteMany({ where: { email: M9_EMAIL, id: { not: M9_USER_ID } } });
   await prisma.user.upsert({
     where: { id: M9_USER_ID },
     create: { id: M9_USER_ID, email: M9_EMAIL, name: 'M9 E2E', locale: 'tr' },

$ git -C .claude/worktrees/e2e-fix log dev..HEAD --oneline
(çıktı yok — dev'in gerisinde, ileride commit'i yok)
```

```
$ git -C .claude/worktrees/zztest-validation log -1 --oneline
414e705 fix(e2e): disable reuseExistingServer to prevent stale dev server env loss

$ git -C .claude/worktrees/zztest-validation status --porcelain
 M src/lib/brand.ts

$ git -C .claude/worktrees/zztest-validation diff
diff --git a/src/lib/brand.ts b/src/lib/brand.ts
index 10aab18..67d476a 100644
--- a/src/lib/brand.ts
+++ b/src/lib/brand.ts
@@ -14,7 +14,7 @@
  */
 
 /** The product name as it is written to users, in both languages. */
-export const PRODUCT_NAME = 'Fabrika';
+export const PRODUCT_NAME = 'ZZTEST';
 
 /**
  * Substitutes `{brand}` in a catalogue string with {@link PRODUCT_NAME}.

$ git -C .claude/worktrees/zztest-validation log dev..HEAD --oneline
(çıktı yok)
```

### 2.2 `e2e-fix` — üç parçanın üçü de dev'de (hunk hunk)

**Hunk 1 — benzersiz zaman damgalı e-posta dizesi:**
```
$ git log -S'm9-e2e-${Date.now()}@fabrika.test' dev --oneline
a55ae2c0 memory(geli-tirici): e2e fixture email collision pattern — timestamp unique + cleanup
1381b433 fix(e2e): m9-ics-download fixture isolation — unique email + cleanup
```
→ Kartın istediği doğrulama: `Date.now()` dizesi **`1381b43`** ile dev'e girmiş. ✅

**Hunk 2 — teardown temizliği yorumu/kodu:**
```
$ git log -S'Clean up any stray user with this email from a failed teardown.' dev --oneline
1381b433 fix(e2e): m9-ics-download fixture isolation — unique email + cleanup
```
✅ Aynı commit.

**Dev'in bugünkü içeriği (her iki hunk da yerinde):**
```
$ git show dev:tests/e2e/fixtures/m9-tenant.ts
...
// Use a timestamp suffix to prevent collisions from failed teardowns: if test N's cleanup
// fails and test N+1 runs, they won't share the same email unique constraint.
export const M9_EMAIL = `m9-e2e-${Date.now()}@fabrika.test`;
...
  // Clean up any stray user with this email from a failed teardown.
  await prisma.user.deleteMany({ where: { email: M9_EMAIL, id: { not: M9_USER_ID } } });
```

**En güçlü kanıt — worktree'nin çalışma kopyası dev ile BAYT BAYT aynıydı:**
```
$ git -C .claude/worktrees/e2e-fix diff dev -- tests/e2e/fixtures/m9-tenant.ts
(çıktı yok = fark yok)
```
Yani "commit'siz değişiklik" aslında dev'de zaten olan içeriğin kopyasıydı; kaybedilecek bir bayt yoktu.

**Untracked rapor dosyası (`TASK-MTV65O6EUHJ52-geli-tirici.md`):**
```
$ git log -S'TASK-MTV65O6EUHJ52' dev --oneline
a55ae2c0 ...
1381b433 fix(e2e): m9-ics-download fixture isolation — unique email + cleanup

$ git show --stat --oneline 1381b43
1381b43 fix(e2e): m9-ics-download fixture isolation — unique email + cleanup
 .../TASK-MTV65O6EUHJ52-geli-tirici.md              | 143 +++++++++++++++++++++
 tests/e2e/fixtures/m9-tenant.ts                    |   6 +-

$ diff <(git show dev:docs/agent-results/TASK-MTV65O6EUHJ52-geli-tirici.md) \
       .claude/worktrees/e2e-fix/docs/agent-results/TASK-MTV65O6EUHJ52-geli-tirici.md
IDENTICAL — nothing to rescue
```
→ Untracked sanılan rapor, `1381b43` ile dev'e commit'lenmiş kopyayla **birebir aynı**. ✅

### 2.3 `zztest-validation` — kurtarılacak iş YOK (gerekçe)

```
$ git log -S"PRODUCT_NAME = 'ZZTEST'" dev --oneline
(çıktı yok — bu değer hiçbir commit'e girmemiş)

$ git show dev:src/lib/brand.ts | grep -n "PRODUCT_NAME ="
18:export const PRODUCT_NAME = 'FonBridge';

$ git log --oneline -1 9af3f63
9af3f63 feat(brand): restore FonBridge product name and update SMTP addresses
 src/app/[locale]/admin/settings/smtp-form.tsx |  8 ++++----
 src/lib/brand.ts                              | 15 ++++++++-------
```

`git log -S'ZZTEST' dev` **dört commit döndürür** — ama hiçbiri kaynak kodu değil; dördü de rapor/hafıza **düzyazısıdır** (`ZZTESTBRAND`, `ZZTEST-*` satırları):
```
dev:.agentspace/memory/agents/ex-en/brand-proof-needs-a-substitution-not-a-matching-string.md:13
dev:docs/agent-results/TASK-MTSJI9OQXXPP5-geli-tirici.md:302,317
dev:docs/agent-results/TASK-MTSWM36QWC36Z-ex-en.md:178,180,182,186
dev:docs/agent-results/TASK-MTV7JX13NGLJY-blok-zincir-denet-i.md:54
```
(Dar arama `PRODUCT_NAME = 'ZZTEST'` boş döner — yani ürün adı hiç ZZTEST olarak commit'lenmemiştir.)

**Gerekçe — neden değersiz:** Bu hunk, ex-en'in `TASK-MTSWM36QWC36Z` raporunda anlattığı **marka ikame probu**nun (`sed` ile PRODUCT_NAME'i ZZTESTBRAND yapıp çıktının gerçekten değiştiğini görme) tek satırlık bir kalıntısıdır — kalıcı bir ürün değişikliği değil, atılmak üzere yapılmış bir ölçüm. Üstelik `414e705`'teki taban değeri `Fabrika`; dev o tarihten sonra `9af3f63` ile `FonBridge`'e döndü. Yani bu çalışma kopyası **iki kuşak eski** bir tabanın üstünde duran bir test dizesi tutuyordu; geri uygulanması markayı geri kırardı. Kurtarma kartı **açılmadı**, gerekçe budur.

---

## 3. Kaldırma — `--force` kullanılmadı

Önce commit'siz durum yedeklendi (kaldırma geri alınabilir kalsın diye), sonra içerik dev'de olduğu kanıtlanan iki dosya geri alındı ve worktree'ler **temiz** hale geldi; böylece `git worktree remove` zorlama olmadan çalıştı.

```
$ git -C .claude/worktrees/e2e-fix diff > $SCRATCH/e2e-fix.patch
$ cp .claude/worktrees/e2e-fix/docs/agent-results/TASK-MTV65O6EUHJ52-geli-tirici.md $SCRATCH/e2e-fix-untracked-report.md
$ git -C .claude/worktrees/zztest-validation diff > $SCRATCH/zztest-validation.patch
-rw-r--r--  7098  e2e-fix-untracked-report.md
-rw-r--r--  1286  e2e-fix.patch
-rw-r--r--   382  zztest-validation.patch

$ git -C .claude/worktrees/e2e-fix checkout -- tests/e2e/fixtures/m9-tenant.ts
$ rm .claude/worktrees/e2e-fix/docs/agent-results/TASK-MTV65O6EUHJ52-geli-tirici.md
$ git -C .claude/worktrees/zztest-validation checkout -- src/lib/brand.ts
$ git -C .claude/worktrees/e2e-fix status --porcelain           # (boş)
$ git -C .claude/worktrees/zztest-validation status --porcelain # (boş)

$ git worktree remove .claude/worktrees/e2e-fix
removed: e2e-fix
$ git worktree remove .claude/worktrees/zztest-validation
removed: zztest-validation
$ git worktree prune -v
(çıktı yok — temizlenecek bayat kayıt kalmadı)
```
`--force` **hiç kullanılmadı** (yukarıdaki komut satırlarında yok).

**Dallar korundu:**
```
$ git branch --list 'worktree-*'
  worktree-e2e-fix
  worktree-zztest-validation
```
Yalnız çalışma kopyaları gitti; `.claude/worktrees/` boş bir dizin olarak kaldı (zararsız, git kaydı yok).

---

## 4. Doğrulama — önce / sonra

### 4.1 `git worktree list`

**ÖNCE:**
```
/Users/macbook/AgentSpace/fabrika                                    a6278bc [dev]
/private/tmp/claude-501/.../73d81303-.../scratchpad/wt               f739ebe (detached HEAD)
/Users/macbook/AgentSpace/.fabrika-d7-clean                          0019475 (detached HEAD)
/Users/macbook/AgentSpace/fabrika/.claude/worktrees/e2e-fix          414e705 [worktree-e2e-fix]
/Users/macbook/AgentSpace/fabrika/.claude/worktrees/zztest-validation 414e705 [worktree-zztest-validation]
```

**SONRA:**
```
/Users/macbook/AgentSpace/fabrika                                    bb983f1 [dev]
/private/tmp/claude-501/.../73d81303-.../scratchpad/wt               f739ebe (detached HEAD)
/Users/macbook/AgentSpace/.fabrika-d7-clean                          0019475 (detached HEAD)
```
Depo içindeki iki kayıt gitti; kapsam dışı iki kayıt olduğu gibi duruyor. (dev'in `a6278bc → bb983f1` ilerlemesi benim değil; komşu bir ajanın `docs(memory)` commit'i — §7.)

### 4.2 Lint gürültüsü — hedef 0

```
ÖNCE: $ pnpm lint 2>&1 | grep -c '^/Users/macbook/AgentSpace/fabrika/.claude'
465
örnek satırlar:
/Users/macbook/AgentSpace/fabrika/.claude/worktrees/e2e-fix/.next/dev/build/chunks/[root-of-the-server]__05i36w1._.js
/Users/macbook/AgentSpace/fabrika/.claude/worktrees/e2e-fix/.next/dev/server/app/[locale]/(app)/[workspace]/dashboard/page.js
...

SONRA: $ pnpm lint 2>&1 | grep -c '^/Users/macbook/AgentSpace/fabrika/.claude'
0
```
✅ 465 → 0. Kaynak, iç içe worktree'lerin `.next` derleme çıktılarıydı.

**Bu düşüş komşu kartın eslint düzeltmesinden DEĞİL — zaman damgasıyla:**
```
lint-before.txt yazıldı : 12:28:56   ← 465 satır
worktree'ler kaldırıldı : ~12:30:00
lint-after.txt  yazıldı : 12:30:21   ← 0 satır
eslint.config.mjs mtime : 12:30:49   ← SONRA dokunuldu
```
`036d6b6 chore(lint): scope eslint to our own source` (TASK-MTVBI1DP4DQGQ) benim **sonra**
ölçümüm bittikten yaklaşık 28 saniye sonra ağaca geldi; ayrıca ÖNCE ölçümüm 465 satır gördüğüne
göre o sırada eslint kapsamı henüz daraltılmamıştı. Yani 465→0 farkının sebebi kaldırma işlemidir.
İki iş birbirini **tamamlıyor**: ben kaynağı (iç içe repo kopyaları) kaldırdım, o kart tarayıcının
kapsamını daralttı — biri diğerini gereksiz kılmaz, çünkü kapsam daraltma repo-içi yeni bir
worktree'yi yine dışarıda tutar, kaldırma ise mevcut 465 satırı bugünden siler.

### 4.3 `pnpm test` süit sayısı

```
ÖNCE:  Test Files  2 failed | 141 passed | 2 skipped (145)
       Tests       3 failed | 1706 passed | 8 skipped (1717)

SONRA: Test Files  8 failed | 136 passed | 2 skipped (146)
       Tests      12 failed | 1695 passed | 8 skipped (1715)
```

**Bu fark benim değişikliğimden DEĞİL — iddia değil, kanıt:**

1. **Worktree'ler zaten toplanmıyordu.** `vitest.config.mts:6`:
   ```
   exclude: ['**/node_modules/**', '**/dist/**', '**/tests/e2e/**', '**/.next/**', '**/docs/**', '**/.claude/worktrees/**'],
   ```
   `.claude/worktrees/**` daha önce `ec3f844b` ile dışlanmıştı; kaldırdığım dizinler süite hiç test dosyası vermiyordu, dolayısıyla kaldırılmaları sayıyı değiştiremez.
2. **145 → 146 farkı komşu ajanın yeni dosyası:** `tests/modules/ai-module-gate.test.ts` — **untracked**, mtime `12:29` (benim ölçüm penceremin içinde oluşturulmuş). `146 − 1 = 145 = taban`.
3. **Yeni düşen süitler komşunun canlı düzenlemeleri:** `git status` paylaşılan ağaçta commit'siz `src/lib/llm.ts` (12:29), `src/modules/m2|m7|m10/server/actions.ts` (12:30), `src/lib/llm.generate.test.ts` (12:29) gösteriyor — düşen dosyalar (`m2`, `m7`, `m10`, `fabricated-fallbacks`, `withholding-rounding`) tam olarak bunların testleri. Ben `src/`, `tests/`, `prisma/`, `scripts/` altında **hiçbir** dosyaya dokunmadım.
4. **Taban zaten kırmızıydı:** ÖNCE ölçümündeki 2 dosya / 3 test (`brand-surfaces-render`, `document-exporter`) marka dönüşünün kuyruğu; ikisi de `git status`'ta **temiz**, yani commit'li durumun kusuru. → §6.

Kartın istediği "süit sayısı aynı olmalı" koşulu, komşunun eklediği 1 dosya düşüldüğünde **sağlanıyor (145 = 145)**.

---

## 5. Kapsam dışı worktree'ler (dokunulmadı)

| Yol | Durum | Not |
|---|---|---|
| `/private/tmp/claude-501/.../73d81303-.../scratchpad/wt` | `f739ebe` (detached) | **Kapsam dışı, depo ağacının içinde değil** — başka bir oturumun scratchpad'i. Dokunulmadı. |
| `/Users/macbook/AgentSpace/.fabrika-d7-clean` | `0019475` (detached) | **Kapsam dışı, depo ağacının içinde değil** — depo kökünün kardeşi. Dokunulmadı. |

---

## 6. Ölçüm sırasında bulunan ayrı kusur → kart açıldı

Taban (`pnpm test` ÖNCE) **temiz ağaçta bile kırmızıydı**; sebebi bu kartın konusu değil ama kimsenin üstünde de değildi:

- `tests/brand-surfaces-render.test.tsx:41` **kendi kendisiyle çelişiyor**: aynı metnin hem `PRODUCT_NAME` içermesini hem de `'FonBridge'` **içermemesini** istiyor. `PRODUCT_NAME === 'FonBridge'` olduğundan bu koşul sağlanamaz — test her koşuda düşer. Satır, marka-uzaklaşma döneminden kalmış ve `9af3f63` ile marka geri dönünce ters dönmüş bir muhafız.
- `tests/document-exporter.test.ts:38,41` hâlâ `"… Fabrika'da hazırlanmıştır."` / `"… in Fabrika."` bekliyor.

Devretmek düzeltmek olmadığı için **TASK-MTVBX3348JNPN** açıldı (@blok-zincir-dev, SPRINT-S12, öncelik 2), DoD'unda gerçek ikame kanıtı (ZZTESTBRAND) şartı var.

Ayrıca **TASK-MTVBI1DP4DQGQ** (@blok-zincir-dev, eslint kapısı gürültüsü) bu temizlikten **kısmi** fayda gördü: `.claude` kaynaklı 465 satır düştü; o kartın kalan yarısı (kanıt/rapor dosyalarının taranması) hâlâ geçerli.

---

## 7. Değişen dosyalar

Kod değişikliği **yok**. Yapılan işlem dosya sistemi + git meta düzeyinde:

| Yol | İşlem |
|---|---|
| `.claude/worktrees/e2e-fix/` | çalışma kopyası kaldırıldı (`git worktree remove`) |
| `.claude/worktrees/zztest-validation/` | çalışma kopyası kaldırıldı (`git worktree remove`) |
| `.git/worktrees/*` | ilgili kayıtlar temizlendi (remove + prune) |
| `docs/agent-results/TASK-MTVBIX1DV9HVO-blok-zincir-denet-i.md` | bu rapor (yeni) |
| `worktree-e2e-fix`, `worktree-zztest-validation` dalları | **korundu, silinmedi** |

Yedekler (kalıcı değil, oturum scratchpad'i): `e2e-fix.patch`, `e2e-fix-untracked-report.md`, `zztest-validation.patch`, `lint-before.txt`, `lint-after.txt`.

**Commit notu (paylaşılan ağaç):** Bu raporu ve 4 hafıza dosyasını stage'ledim, ancak commit
atmadan önce komşu bir ajanın süpüren `git add`/`git commit`'i araya girdi ve beşini birden
**`4ac3847` (`docs(agent-results): TASK-MTVBJW8ATMD3G — i18n gate sees hard-coded text`)**
altında commit'ledi. İçerik **kayıpsız** — beş dosyanın da `git diff HEAD --stat` çıktısı boş.
Geri alınmadı ([[fabrika-parallel-agent-file-race]] kuralı: üzerine yazılmışsan geri alma,
başkasının işini silersin); yalnız yanlış commit mesajı altında görünüyorlar. Bu satır, ileride
"bu rapor hangi commit'te" diye arayan için buradadır.

---

## 8. Riskler

- **Yedekler kalıcı değil.** Kurtarma yamaları oturum scratchpad'inde; oturum temizlenince giderler. Risk düşük: §2.2'de içeriğin dev'de birebir olduğu, §2.3'te ise değersiz olduğu kanıtlandı.
- **`worktree-*` dalları hâlâ duruyor** (kart öyle istedi). İkisi de `414e705`'te, yani dev'in gerisinde ve ileri commit'leri yok; ileride bir kart bunları da temizlemek isteyebilir — ama bu kartın kapsamı değildi.
- **Ölçüm penceresi paylaşılan ağaçta kirlendi.** `pnpm test` sonrası sayıları komşu ajanın canlı düzenlemelerini içeriyor; §4.3'teki dört kanıt olmasa bu sayı yanlış okunup bu karta yazılabilirdi. Aynı anda ölçüm yapan başka kartlar için gerçek bir tuzak.
- `.claude/worktrees/` boş dizin olarak kaldı; bir sonraki `git worktree add` onu tekrar kullanır, sorun değil.

## 9. Açık sorular

1. `worktree-e2e-fix` ve `worktree-zztest-validation` **dalları** ne zaman silinecek? (Bu kart açıkça yasakladı; kalıcı olarak mı duracaklar, yoksa ayrı bir kart mı?)
2. `/Users/macbook/AgentSpace/.fabrika-d7-clean` (0019475) kim tarafından, ne için tutuluyor? Depo dışı olduğu için dokunmadım, ama sahipsizse o da bayat olabilir.
3. Paylaşılan ağaçta eşzamanlı `pnpm test`/`pnpm lint` ölçümü yapan kartlar birbirinin sayısını kirletiyor — ölçümler izole bir kopyada mı koşulmalı (takım kararı)?

## 10. Sonraki adım

- **TASK-MTVBX3348JNPN**'i @blok-zincir-dev alsın: `pnpm test` tabanı yeşile dönmeden hiçbir kartın "kapı temiz" beyanı okunabilir değil.
- **TASK-MTVBI1DP4DQGQ** (eslint kapısı) sahibi bu 465 satırlık düşüşü tabanına yazsın ve kalan kanıt-dosyası gürültüsüne odaklansın.
