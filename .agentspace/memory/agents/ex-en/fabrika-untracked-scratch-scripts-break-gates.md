---
name: fabrika-untracked-scratch-scripts-break-gates
description: Paralel ajanın commit'lenmemiş scripts/_*.ts dosyaları lint/typecheck/build'i kırar — dosyalara dokunma; en ucuz kanıt --ignore-pattern, worktree ancak build gerekiyorsa
metadata:
  type: feedback
  updatedAt: 2026-09-08
---

Fabrika'da `pnpm typecheck` / `pnpm build` ana depoda kırmızı çıkabilir çünkü tsconfig `**/*.ts`
kapsıyor ve başka bir ajanın **untracked** geçici scriptleri (`scripts/_dogfood-*.ts`) taranıyor.
Bunlar CI checkout'unda YOK — yani kapı aslında yeşil.

**Why:** O dosyaları silmek/taşımak, hâlâ çalışan paralel ajanın işini bozar (bende iş sırasında yeni
bir `-probe4.ts` oluştu). Ortak `tsconfig.json`'ı geçici düzenlemek de yarış yaratır.

**How to apply:** Kapıyı CI'nin gördüğü ağaçta kanıtla:
`git worktree add /Users/macbook/AgentSpace/.fabrika-gate-wt HEAD` → `cp -Rc <repo>/node_modules <wt>/`
(APFS clonefile, ~60 sn, 3 GB için) → orada `pnpm lint/typecheck/build` → `git worktree remove --force`.
`node_modules`'ı **symlink'leme**: Turbopack `Symlink [project]/node_modules is invalid, it points out of
the filesystem root` diyerek build'i düşürür — gerçek (clone) kopya şart. Worktree'yi `/private/tmp`
altına da açma, aynı hataya girersin; aynı dosya sistemi kökünde (`/Users/...`) tut.

Aynı worktree "kapı kırmızıya dönebiliyor mu" kanıtı için de ideal: kasıtlı hatayı orada ekle, ana
depoya hiç dokunma.

İlgili: [[fabrika-lint-gate-green-narrow-exceptions]] · [[fabrika-parallel-agent-file-race]]


## Daha ucuz yol: worktree AÇMADAN kanıtla (2026-09-08, TASK-MTSI7YQWUZOFH)

Worktree pahalı (3 GB `node_modules` klonu) ve bu oturumda `git worktree add` **izin reddiyle
düştü**. Kırılan adım yalnız `lint` ise tek satır yeter — kimsenin dosyasına dokunmadan:

```bash
npx eslint $(for f in scripts/_g0-*.ts; do echo "--ignore-pattern $f"; done)
# EXIT=0, sıfır çıktı  → kapı senin değişikliğin yüzünden kırmızı değil
```

Aynı mantık `tsc` için `--exclude` ile çalışmaz (tsconfig gerekir), ama `lint`/`test` gibi
dosya-listesi alan adımlarda geçerli. `pnpm gate`'i bütün olarak koş, çıktısını **olduğu gibi**
rapora koy, sonra bu daraltılmış koşuyu ikinci kanıt olarak ekle — kapıyı yeşil göstermek için
adımı değiştirme.

Bu turdaki nüks: `scripts/_g0-apply-sql.ts`, `_g0-inspect.ts`, `_g0-k1dup.ts`, `_g0-verify.ts`,
`_g0-whoami.ts` — beşi de untracked, ikisi `no-explicit-any` ile `pnpm gate`'i tek başına
exit 1 yapıyor. Doğrulaması: `git ls-files <dosya>` boş dönüyorsa CI onu hiç görmüyor.
