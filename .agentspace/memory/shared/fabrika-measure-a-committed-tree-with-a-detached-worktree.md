---
name: fabrika-measure-a-committed-tree-with-a-detached-worktree
description: Paylaşılan ağaçta repo-geneli bir kapıyı ölçerken çalışma ağacı komşuların yarım işiyle kirlidir — git worktree add --detach HEAD ile izole kopyada ölç, kimsenin dosyasına dokunmadan
metadata:
  type: reference
  updatedAt: 2026-09-10
---

Beş ajanın aynı çalışma ağacında çalıştığı bir sprintte repo-geneli bir kapıyı (`tsc` bayrağı, lint
kuralı, statik tarayıcı) ölçmek istiyorsan: **çalışma ağacı sana komşuların yarım yazılmış kodunu
gösterir.** Ölçülen kırmızı senin kararını yanlış yönlendirir.

Ölçülen olay (2026-09-10, TASK-MTVPPDW8NXKLD): `noUncheckedIndexedAccess` bayrağını kalıcı açmadan
önce ölçüm alındı; çıkan kırmızılar üç ayrı koşuda üç farklı dosyaydı
(`scripts/efatura-preflight.ts` → `src/lib/inngest/jobs/alerts-sweep.ts` →
`src/lib/billing/subscription-sync.ts`), hepsi komşuların **commit edilmemiş** ara hâliydi ve
kendiliğinden kapandı. Bunlardan birini "benim işim" sanıp düzeltmek başkasının dosyasını ezmek olurdu.

Yöntem:
```bash
git worktree add --detach <scratch>/head-wt HEAD          # kimsenin dosyasına dokunmaz
ln -s "$PWD/node_modules" <scratch>/head-wt/node_modules  # kurulum tekrarlanmaz
# kardeş probe config'i ORAYA yaz, ölç
git worktree remove --force <scratch>/head-wt
```

İki ayırt edici kontrol, kararı vermeden önce:
1. **Bayraklı mı bayraksız mı?** Aynı hatayı bayraksız `pnpm typecheck` de veriyorsa o hata senin
   değişikliğinin değil, komşunun yarım kodunun. (TS2304 "Cannot find name" tipik işaret.)
2. **Satır numarası koşudan koşuya kayıyorsa** o dosya ŞU AN yazılıyor demektir — bekle, düzeltme.

`git stash` paylaşılan ağaçta bir seçenek DEĞİL: komşunun işini de saklar.
Bkz. [[fabrika-gate-scope-follows-the-git-index]], [[fabrika-measure-a-global-compiler-flag-with-a-sibling-config]],
[[fabrika-parallel-agent-file-race]].
