---
name: fabrika-typecheck-fails-from-neighbours-uncommitted-work
description: Paylaşımlı ağaçta `pnpm typecheck` başka bir ajanın commit edilmemiş işinden kırmızı dönebilir — kendi değişikliğini aklamanın yolu HEAD üzerinde izole bir worktree'ye yalnız kendi dosyalarını kopyalayıp orada tsc koşmaktır.
metadata:
  type: project
updatedAt: 2026-09-10
---

Fabrika ağacında birden fazla ajan aynı anda çalışıyor, bu yüzden `pnpm typecheck` senin dosyalarınla ilgisi olmayan hatalarla kırmızı dönebilir (ör. bir komşunun `?? tests/…` untracked test dosyası, henüz eklemediği bir export'u import ediyor).

"Bu hata benim değil" bir İDDİADIR; ölçmenin ucuz yolu:

```bash
git worktree add -q /tmp/probe HEAD
ln -sfn "$PWD/node_modules" /tmp/probe/node_modules
# yalnız KENDİ değişen dosyalarını kopyala
cp <senin-dosyaların> /tmp/probe/<aynı-yollar>
(cd /tmp/probe && ./node_modules/.bin/tsc --noEmit; echo "EXIT: $?")
git worktree remove /tmp/probe --force
```

`git -C /tmp/probe status --porcelain` çıktısını da rapora koy: yalnız senin dosyalarının listelendiğini gösterir, yani exit 0 gerçekten seni aklar. `git stash` KULLANMA — paylaşımlı ağaçta komşunun işini çalar (bkz. [[fabrika-concurrent-commit-steals-your-stage]]). Aynı yöntem `pnpm lint` için de geçerli.
