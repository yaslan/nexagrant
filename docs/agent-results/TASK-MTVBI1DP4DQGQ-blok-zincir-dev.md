# TASK-MTVBI1DP4DQGQ — Kapı okunamıyor: eslint iç içe worktree'leri ve kanıt dosyalarını tarıyor

**Ajan:** n8n-en (N8N-EN) · **Tip:** bug (kapı hijyeni) · **Sprint:** SPRINT-S12 · **Dal:** `dev`
**Ölçüm ağacı:** `a6278bc` üzerine gelen `bb983f1` (komşu ajanın docs commit'i) · **Düzeltme commit'i:** `036d6b6`
**Platform beyanı:** doğrulama **macOS (darwin 25.6.0, zsh, Node/pnpm yerel)** üzerinde yapıldı. Dokunulan tek şey `eslint.config.mjs` içindeki glob desenleri; ESLint flat-config glob'ları platformdan bağımsız POSIX ayraçla eşleşir ve Windows'ta da yolu normalize eder — **platforma bağlı kod yolu yok**. Windows/Linux'ta ayrıca koşulmadı (bu ofis makinesinde o platformlar yok); koda göre davranış aynı.

---

## 1. Ne yapıldı

`pnpm lint` bu depoda kendi kaynağımızı değil, ajanların açtığı **iç içe git worktree'lerini** (`.claude/worktrees/**`) ve görev raporlarına iliştirilmiş **kanıt script'lerini** (`docs/agent-results/**`) tarıyordu. Sonuç: 1960 error / 21724 warning — ve bunların **tamamı** o iki dizinden. `src/` kaynaklı tek bir bulgu yoktu, yani kapı kimse için okunamaz haldeydi.

`eslint.config.mjs` içindeki mevcut `globalIgnores([...])` çağrısına iki desen eklendi:

```js
".claude/worktrees/**",
"docs/agent-results/**",
```

Bu, `vitest.config.mts` satır 6'da zaten uygulanan dışlamanın aynısıdır. **Hiçbir eslint kuralı devre dışı bırakılmadı, hiçbir severity düşürülmedi** — sorun kural değil kapsamdı.

> **Kart metnindeki küçük sapma:** kart dosyayı `vitest.config.ts` diye anıyor; depodaki gerçek dosya adı `vitest.config.mts`. İçerik ve satır numarası (6) kartla birebir uyuşuyor. Karta uyularak o dosyaya **dokunulmadı**; `.gitignore` da değiştirilmedi.

## 2. Kanıt

### (a) ÖNCE — `pnpm lint`

```
✖ 23684 problems (1960 errors, 21724 warnings)
  2 errors and 381 warnings potentially fixable with the `--fix` option.
[ELIFECYCLE] Command failed with exit code 1.
EXIT=1
```

Bulguların kaynağı (kartın komutunun tam çıktısı):

```
$ grep '^/Users' lint-before.txt | sed 's|^.../fabrika/||' | awk -F/ '{print $1"/"$2}' | sort | uniq -c | sort -rn
 465 .claude/worktrees
   2 docs/agent-results

$ ... | grep '^docs/'
docs/agent-results/TASK-MTSYH8LDGV5YU-evidence/f1-e2e-probe.mts
docs/agent-results/TASK-MTSYH8LDGV5YU-evidence/f4-rag-probe.mts
```

467 dosya, `src/` payı **0**.

### (b) SONRA — `pnpm lint`

```
$ eslint
EXIT=0
```

Sıfır error, sıfır warning, çıkış kodu 0. (Üstteki `[WARN] The "pnpm" field in package.json…` satırı pnpm'in kendi uyarısıdır, lint bulgusu değildir ve değişiklikten önce de vardı.)

### (c) MUTASYON SONDASI — dışlama fazla geniş mi?

`src/lib/money.ts` sonuna kasıtlı ihlal eklendi (kullanılmayan değişken + `@ts-ignore`):

```ts
export function __lintProbe(): number {
  const unusedProbeVariable = 42;
  // @ts-ignore
  const wrong: number = "not a number";
  return Number(wrong);
}
```

`pnpm lint` bunu **hâlâ yakalıyor**:

```
/Users/macbook/AgentSpace/fabrika/src/lib/money.ts
  305:9  warning  'unusedProbeVariable' is assigned a value but never used                                                             @typescript-eslint/no-unused-vars
  306:3  error    Use "@ts-expect-error" instead of "@ts-ignore", as "@ts-ignore" will do nothing if the following line is error-free  @typescript-eslint/ban-ts-comment

✖ 2 problems (1 error, 1 warning)
PROBE EXIT=1
```

Sonda geri alındı ve temizlik doğrulandı:

```
$ git diff --name-only src/lib/money.ts
[]                          # boş — dosya HEAD ile birebir
$ pnpm lint
POST-REVERT LINT EXIT=0
```

> Sondanın ilk koşusu `EXIT=2` ile düştü: `ENOENT … /.prisma-delegate-probe/probe.ts`. Bu benim değişikliğim değil — paylaşılan ağaçta komşu bir ajanın eslint'in dosya listesini topladığı an ile okuduğu an arasında yarattığı/sildiği geçici dosyaydı. Dizin artık yok; koşu tekrarlandığında yukarıdaki sonuç alındı.

### (d) `pnpm typecheck`

```
$ tsc --noEmit
TYPECHECK EXIT=0
```

### (e) `pnpm test` — YEŞİL DEĞİL, ama bu değişiklikten bağımsız

```
 Test Files  7 failed | 137 passed | 2 skipped (146)
      Tests  11 failed | 1696 passed | 8 skipped (1715)
TEST EXIT=1
```

Düşen dosyalar:

```
src/modules/m2/server/actions.test.ts
tests/brand-surfaces-render.test.tsx
tests/document-exporter.test.ts
tests/fabricated-fallbacks.test.ts
tests/modules/m10.test.ts
tests/modules/m2.test.ts
tests/modules/m7.test.ts
```

Bunlar paylaşılan ağaçtaki **komşu ajanların o an commit'lenmemiş düzenlemeleri**nden geliyor — `git status --porcelain -- src tests prisma`:

```
 M src/app/[locale]/(app)/[workspace]/concept-notes/actions.ts
 M src/lib/llm.generate.test.ts
 M src/lib/llm.ts
 M src/modules/m10/server/actions.ts
 M src/modules/m2/server/actions.ts
 M src/modules/m7/server/actions.ts
?? tests/modules/ai-module-gate.test.ts
```

Düşen süitler ile değiştirilen dosyalar bire bir örtüşüyor (m2/m7/m10/llm/brand).

**Kontrollü deney** — `eslint.config.mjs` HEAD sürümüne döndürülüp test yeniden koşuldu:

```
CONTROL (eslint config = HEAD) EXIT=1
 FAIL  src/modules/m2/server/actions.test.ts
 FAIL  tests/brand-surfaces-render.test.tsx
 FAIL  tests/document-exporter.test.ts
 FAIL  tests/fabricated-fallbacks.test.ts
 FAIL  tests/modules/m10.test.ts
 FAIL  tests/modules/m2.test.ts
 FAIL  tests/modules/m7.test.ts
```

**Birebir aynı 7 süit** — yani hatalar bu karttan ÖNCE de vardı; vitest zaten `eslint.config.mjs`'i okumaz. Değişiklik test-nötr. (Bu kırıklar bu kartın kapsamı değil; sahibi olan kartlar S12'de açık: m2/m7/m10 modül kapısı = TASK-MTVBL9HBML1ZH, llm/AiUsageLog = TASK-MTVBM0C2QWPCL. **Devredilen bulgu düzelmiş bulgu değildir** — bu satır kanıt değil, işaret.)

### (f) Commit (paylaşılan `dev` dalı, dar yol)

```
$ git log --oneline -3
bb983f1 docs(memory): a blocker three reports name is a card nobody opened
a6278bc docs(memory): webhook locale source, TODO blockers, E2E_PORT corrects a stale note
93a2195 docs(agent-results): record commit hash for TASK-MTV8W14FY9BKD

$ git commit -m "…" -- eslint.config.mjs
[dev 036d6b6] chore(lint): scope eslint to our own source
 1 file changed, 5 insertions(+)

$ git show --name-only --oneline HEAD
036d6b6 chore(lint): scope eslint to our own source
eslint.config.mjs
```

Geniş `git add -A` kullanılmadı; commit'te **yalnız** `eslint.config.mjs` var — komşuların commit'siz işi düşmedi.

## 3. Değişen dosyalar

| Dosya | Değişiklik |
|---|---|
| `eslint.config.mjs` | +5 satır (2 ignore deseni + açıklama yorumu) — commit `036d6b6` |
| `docs/agent-results/TASK-MTVBI1DP4DQGQ-blok-zincir-dev.md` | bu rapor (yeni) |

Dokunulmayanlar (kart gereği): `vitest.config.mts`, `.gitignore`, herhangi bir eslint kuralı/severity'si, `src/**` (sonda geri alındı — `git diff` boş).

## 4. Riskler

- **Kanıt script'leri artık lint'lenmiyor.** `docs/agent-results/**` altındaki `.mts` sondaları bilinçli olarak kapsam dışı: bunlar tek kullanımlık kanıt, ürün kodu değil. Biri oraya kalıcı yardımcı koymaya kalkarsa lint sessiz kalır — bu tür kod `src/` veya `scripts/` altına ait.
- **Dışlama kök-göreli.** `.claude/worktrees/**` deseni depo kökünden eşleşir. Bir worktree başka bir yola (`/tmp`, ev dizini) açılırsa zaten bu ağacın parçası olmaz; ama biri worktree'yi kök altında **başka** bir adla açarsa lint onu yeniden tarar. Bunu tamamen kapatmak `.gitignore`/worktree konvansiyonu işidir; kart kapsamı dışı.
- **Sonda geri alma yarışı:** paylaşılan ağaçta sondayı geri almadan başka bir ajan `git add -A` yapsaydı, kasıtlı hata commit'lenebilirdi. Sonda ile geri alma arasında tek bir lint koşusu var ve `git diff` ile temizlik doğrulandı; yine de bu desen paylaşılan ağaçta dar bir pencere.

## 5. Açık sorular

1. Kart `vitest.config.ts` diyor, gerçek dosya `vitest.config.mts`. Kart metni mi düzeltilmeli, dosya mı yeniden adlandırılmalı? (Ben ikisine de dokunmadım.)
2. `.claude/worktrees/**` uzun vadede `.gitignore`'a mı girmeli? Bugün bu worktree'ler ağaçta duruyor ve her araca (eslint, vitest, muhtemelen tsc/grep) ayrı ayrı dışlama yazmak gerekiyor. Tek noktadan çözüm PM kararı — TASK-MTVBIX1DV9HVO (bayat worktree temizliği) ile birlikte ele alınmalı.
3. `pnpm gate` bu koşuda **çalıştırılmadı** (kart a/b/c maddelerini istiyordu); `pnpm test` zaten komşu düzenlemeler yüzünden kırmızı olduğundan gate de kırmızı dönecekti ve bu kartla ilgisiz bir gürültü olurdu.

## 6. Sonraki adım

- Kırık 7 süit sahiplerine ait: TASK-MTVBL9HBML1ZH (m2/m7/m10 modül kapısı) ve TASK-MTVBM0C2QWPCL (AiUsageLog yazma hatası). Onlar kapandıktan sonra `pnpm gate` ilk kez uçtan uca okunabilir olmalı — o an biri gate'i **tam** koşup baseline'ı kaydetmeli.
- İsteğe bağlı: `.claude/worktrees` için tek-nokta çözümü (soru 2).

---

## Definition of Done

- [x] `pnpm lint` ÖNCE çıktısı raporda — 1960 error / 21724 warning, kaynak dağılımı ile (§2a)
- [x] `pnpm lint` SONRA çıktısı raporda — **0 error**, EXIT 0 (§2b)
- [x] Değişen TEK dosya `eslint.config.mjs`; `vitest.config.mts` ve `.gitignore`'a dokunulmadı (§3, `git show --name-only`)
- [x] Mevcut `.next/** · out/** · build/** · next-env.d.ts` girdileri korundu (§1 diff)
- [x] Hiçbir eslint kuralı devre dışı bırakılmadı, hiçbir severity düşürülmedi (§1)
- [x] **Mutasyon sondası:** `src/` altına kasıtlı hata (kullanılmayan değişken + `@ts-ignore`) eklendi, lint HÂLÂ yakaladı (1 error + 1 warning), sonda geri alındı ve temizlik `git diff` ile doğrulandı (§2c)
- [x] `pnpm typecheck` EXIT 0 (§2d)
- [ ] `pnpm test` yeşil — **HAYIR.** 7 süit kırık; kontrollü deneyle bu değişiklikten bağımsız oldukları kanıtlandı (aynı 7 süit, eslint config HEAD'e döndürülünce de düşüyor) ve sahipleri başka kartlar. **Bu kutu bilerek işaretlenmedi** (§2e)
- [x] Paylaşılan dal disiplini: commit öncesi `git log --oneline -3`, `git commit -- eslint.config.mjs` (geniş `git add -A` YOK), sonrası `git show --name-only` (§2f)
- [x] Sonuç dosyası `docs/agent-results/TASK-MTVBI1DP4DQGQ-blok-zincir-dev.md` yazıldı
- [x] **Platform beyanı** raporun başında (macOS'ta doğrulandı; Windows/Linux koşulmadı — glob desenleri platformdan bağımsız)
