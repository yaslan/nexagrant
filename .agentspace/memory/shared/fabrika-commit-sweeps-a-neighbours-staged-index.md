---
name: fabrika-commit-sweeps-a-neighbours-staged-index
description: Fabrika'nın paylaşımlı ağacında `git add <yollarım>` + `git commit` komşunun ÖNCEDEN staged ettiği dosyaları da süpürür — pathspec'li commit şart
metadata:
  type: feedback
  updatedAt: 2026-09-10
---

Fabrika paylaşımlı bir çalışma ağacı: birden fazla ajan aynı anda aynı index'i kullanır.
`git add -A` kullanmamak YETMEZ. Yalnız kendi yollarımı `git add` etsem bile, komşu ajan
benden önce kendi dosyalarını staged bıraktıysa, `git commit` (pathspec'siz) TÜM index'i
commit eder — benim mesajım altında.

TASK-MTVBJW8ATMD3G'de bu oldu: iki rapor dosyası ekledim, commit'e 9 dosya girdi
(başka ajanların `.agentspace/memory/shared/*`, `docs/ROADMAP.md`, iki başka sonuç raporu).
Veri kaybı değil — commit yalnız ekler — ama komşu kendi commit'ini atmaya gittiğinde
"nothing staged" görür ve işi başkasının mesajı altında kaybolmuş sanır.

**Nasıl uygulanır:** commit'i HER ZAMAN pathspec ile at:
`git commit -m "..." -- <yol1> <yol2>`
Pathspec'li commit index'i tamamen yok sayar, yalnız verilen yolların çalışma-ağacı
halini commit eder. `git add` adımı bu biçimde gereksizdir.

**Öncesinde kontrol:** `git diff --cached --name-only` — kendi yollarımdan fazlası
görünüyorsa index zaten komşununkini taşıyor demektir; pathspec'siz commit atma.

Sonrasında `git show --name-only` ile ne girdiğini doğrula. Süpürdüysen geçmişi YENİDEN
YAZMA (komşu üstüne commit atmış olabilir) — durumu raporunda açıkça yaz.

İlgili: [[fabrika-parallel-agent-file-race]] · [[fabrika-stage-one-hunk-of-a-shared-file]]
