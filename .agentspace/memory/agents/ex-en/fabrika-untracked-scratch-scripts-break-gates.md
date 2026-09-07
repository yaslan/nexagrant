---
name: fabrika-untracked-scratch-scripts-break-gates
description: Paralel ajanın commit'lenmemiş scripts/_dogfood-*.ts dosyaları typecheck ve build'i kırar — kapıyı HEAD'den açılan izole git worktree'de koş, dosyalara dokunma
metadata:
  type: feedback
  updatedAt: 2026-09-07
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
