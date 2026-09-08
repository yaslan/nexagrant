---
name: fabrika-delegation-verdict-wrong-both-directions
description: Delegasyon defterinin hükmü İKİ YÖNDE de yanlış olabilir — "failed" biten işi gizler, "tespit=marker" ise hiç kanıt olmadığı demektir
metadata:
  type: feedback
  updatedAt: 2026-09-08
---

2026-09-08, S12 Dalga 4 kapanışı. Defterin dört hükmünü tek tek ölçtüm; **ikisi yanlıştı**:

- `blok-zincir-denet-i … BAŞARISIZ · pane exited (code 129)` → iş aslında **bitmiş ve kanıtlıydı**.
  Rapor yazılmıştı ama adı `TASK-MTS808DKQTOQ9.md` idi: `-<ajanadı>` eki yoktu, bu yüzden
  denetleyici beklediği yolda bulamadı. 7 gerçek tıklama karesi ve dört commit ağaçtaydı.
- `ex-en … BİTTİ` ve `blog-yazar … BİTTİ` → ikisi de `tespit=marker`, yani **hiç kanıt dosyası yok**.
  İş gerçekten yapılmıştı, ama bunu ancak `git log` gösterdi (`fd58867`, `37202a5`); rapor yazılmamıştı.

Kural: bir dalgayı kapatırken defterin hükmüne DEĞİL, üç ölçüme bak:
1. `ls -ltT docs/agent-results/` — kanıt dosyası var mı, mtime görevin başlangıcından SONRA mı,
   ve **`TASK-<ID>*` ile ara** (yalnız `TASK-<ID>-<ajan>.md` ile değil — ek eksikse dosya kaçar).
2. `git log --oneline` — commit başlığı o kartın işini anlatıyor mu.
3. Kartın iddiasını kendin ölç (`pnpm lint`, `grep`, ilgili dosyayı aç).

`tespit=marker` = kanıtsız; `tespit=evidence` = dosya var (içeriği yine de okunmalı,
bkz. [[fabrika-evidence-file-may-answer-a-different-task]]). Kod 129'lu "failed"i ölçmeden atma,
bkz. [[fabrika-dead-pane-work-measure-before-discarding]]. Adı eksik raporu `git mv` ile düzelt,
yoksa sonraki dalga aynı işi ikinci kez dağıtır.
