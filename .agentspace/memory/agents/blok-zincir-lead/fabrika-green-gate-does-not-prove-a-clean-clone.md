---
name: fabrika-green-gate-does-not-prove-a-clean-clone
description: Yerelde yeşil kapı (typecheck/lint/test) temiz klonu KANITLAMAZ — untracked dosyalar suiti ayakta tutabilir; durum kontrolünde git status'a da bak
metadata:
  type: project
  updatedAt: 2026-09-08
---

2026-09-08 durum taramasında Fabrika `dev` dalında typecheck exit 0, lint 0 uyarı,
1299 test PASS ölçüldü — ama HEAD temiz bir klonda o testleri koşturamaz: commit'lenmiş
üç test dosyası (`src/lib/billing/subscription-sync.test.ts:19` ve iki kardeşi)
**untracked** olan `tests/helpers/partial-row.ts`'i import ediyordu. Aynı şekilde
`pnpm efatura:preflight` bir kartın DoD kanıtıydı ama `package.json` satırı commit
edilmemişti.

**Neden:** worker pane'leri iş bitince commit atmadan ölüyor (API limiti / uygulama
yeniden başlaması). Çalışma ağacında kalan dosyalar yerel koşuyu yeşil tutuyor, bu
yüzden ne worker ne lider farkı görüyor.

**Nasıl uygula:** durum kontrolünde kapı çıktısı YETMEZ — `git status --porcelain`
çıktısındaki untracked kaynak/test dosyalarını da tara ve "commit'li bir dosya bunu
import ediyor mu" diye sor. Kesin kanıt probu: `git archive HEAD | tar -x -C <tmp>`
ile HEAD'i çıkar ve orada koş. İlgili: [[fabrika-check-artifact-timestamps-against-dispatch]],
[[fabrika-cross-verification-needs-a-falsifying-probe]]
