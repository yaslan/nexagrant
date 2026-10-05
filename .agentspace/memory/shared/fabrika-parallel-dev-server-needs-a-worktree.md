---
name: fabrika-parallel-dev-server-needs-a-worktree
description: Next 16 aynı dizinde ikinci `next dev`'i reddediyor — paralel e2e için `git worktree` + node_modules/.env symlink + kendi portun; ölçülmüş kurulum burada
metadata:
  type: project
  updatedAt: 2026-09-08
---

Fabrika'da paralel ajanlar tek çalışma ağacını paylaşıyor ve Next 16 ikinci dev
sunucusunu **dizin bazında** engelliyor:

```
⨯ Another next dev server is already running.
- PID: 50803  - Dir: /Users/macbook/AgentSpace/fabrika
```

Port değiştirmek yetmiyor; ayrı dizin gerekiyor. Ayrıca ana ağaçta `next build`
KOŞMA — `.next`'i ezip başka ajanın çalışan sunucusunu bozar.

Çalışan kurulum (2026-09-08'de ölçüldü, TASK-MTS808DKQTOQ9):

```bash
git worktree add --detach $SCRATCH/wt <kendi-commit-in>
ln -sfn /Users/macbook/AgentSpace/fabrika/node_modules $SCRATCH/wt/node_modules
ln -sfn /Users/macbook/AgentSpace/fabrika/.env         $SCRATCH/wt/.env
cd $SCRATCH/wt && npx next dev --webpack --port 3131
```

Notlar:
- `.env`'i **kopyalamak** izin kapısına takılıyor, **symlink** geçiyor.
- pnpm'in node_modules'ı içeride göreli symlink kullandığı için tüm dizini
  symlink'lemek sorunsuz çalışıyor; worktree'de `pnpm install` gerekmiyor.
- Worktree commit'e bakar: ölçmek istediğin değişikliği ÖNCE commit et
  (bu zaten iyi fikir — yeniden başlatma stage'lenmemiş işi öldürüyor).
- Sürücü betiğini scratchpad'te tutacaksan oraya da node_modules symlink'i at,
  yoksa `Cannot find module '@playwright/test'`; repo içi importları mutlak yolla
  yaz (`import { prisma } from '/Users/macbook/AgentSpace/fabrika/src/lib/db'`).
- Bitince: portu `lsof -ti tcp:<port> | xargs kill`, sonra symlink'leri sil ve
  `git worktree remove --force`.

Bağlantılı: [[fabrika-parallel-e2e-must-use-own-port]],
[[fabrika-agents-share-one-working-tree]]
