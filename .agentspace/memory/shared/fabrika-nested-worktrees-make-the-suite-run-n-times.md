---
name: fabrika-nested-worktrees-make-the-suite-run-n-times
description: ÇÖZÜLDÜ 2026-09-10 — iki iç içe worktree kaldırıldı ve vitest.config.mts artık .claude/worktrees/** dışlıyor; kural olarak izole worktree'yi HÂLÂ depo ağacının DIŞINA aç
metadata:
  type: project
  updatedAt: 2026-09-10
---

> **DURUM 2026-09-10 (TASK-MTVBIX1DV9HVO):** Her iki worktree kaldırıldı; ayrıca
> `vitest.config.mts:6` `'**/.claude/worktrees/**'` dışlamasını taşıyor (`ec3f844b`) — yani
> süit artık N kez koşmuyor. **Kural değişmedi:** izole worktree depo ağacının DIŞINA açılır.
> Kaldırma tarifi için: [[fabrika-prove-a-dirty-worktree-is-redundant-before-removing]].

## Ölçüm
```
$ git worktree list
/Users/macbook/AgentSpace/fabrika                                      a55ae2c [dev]
/Users/macbook/AgentSpace/fabrika/.claude/worktrees/e2e-fix            414e705
/Users/macbook/AgentSpace/fabrika/.claude/worktrees/zztest-validation  414e705

$ npx vitest run tests/retired-brand-name.test.ts
 Test Files  3 failed (3)          ← TEK dosya istendi
 FAIL  tests/retired-brand-name.test.ts
 FAIL  .claude/worktrees/e2e-fix/tests/retired-brand-name.test.ts
 FAIL  .claude/worktrees/zztest-validation/tests/retired-brand-name.test.ts
```
İki worktree `414e705`'te, ana ağaç `a55ae2c`'te. Yani `pnpm test` **HEAD'in kodunu değil, iki
eski ağacın kodunu da** ölçüyor.

## Neden tehlikeli
- **Bugün:** yalancı KIRMIZI — ana ağaçta düzelttiğin şey bayat kopyada duruyor, kapı kırmızı
  kalıyor ve sen kendi değişikliğini suçluyorsun.
- **Yarın:** yalancı YEŞİL — ana ağaçta kırılan bir şey bayat kopyada hâlâ geçiyorsa toplam yeşil
  görünebilir.
- Her "N test geçti" sayısı şişik; kapanış raporlarındaki test sayıları karşılaştırılamaz hale gelir.

## Nasıl önlenir
- İzole worktree'yi **depo ağacının DIŞINA** aç (ör. scratchpad altına), `.claude/worktrees/` gibi
  repo-içi bir yola değil.
- Repo içine açmak zorundaysan iş biter bitmez `git worktree remove` — ama önce
  `git -C <yol> status --short` ile içinde commit'siz iş olmadığını KANITLA; başkasının worktree'si
  olabilir, silmek geri alınamaz.
- Kalıcı kapı: vitest `exclude`'una iç içe worktree DESENİ (tek dizin adı değil).

Aynı aile: [[fabrika-playwright-reuseexistingserver-ci-guard]] (bayat dev sunucusu) ·
[[fabrika-rls-green-on-a-bypassrls-connection]] — üçü de "kapı yeşil ama ölçtüğü şey senin ağacın değil".
