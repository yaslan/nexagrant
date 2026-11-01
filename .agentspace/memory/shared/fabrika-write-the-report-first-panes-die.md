---
name: fabrika-write-the-report-first-panes-die
description: Worker pane'leri uygulama yeniden başlayınca kaybolur ve rapor sona bırakıldıysa iş kanıtsız kalır — raporu en başta aç, ilerledikçe yaz
metadata:
  type: feedback
  updatedAt: 2026-09-09
---

2026-09-09'da fabrika/cekirdek'te aynı şey üç kez oldu: uygulama yeniden başladı, worker
pane'i kayboldu, supervisor "BAŞARISIZ · kanıt: docs/agent-results/<KOD>-<ajan>.md" dedi ve
o dosya **hiç oluşmamıştı** — bildirimdeki yol BEKLENEN yoldur, gerçek kanıt değil.

Her seferinde iş aslında kaybolmamıştı: değişiklikler çalışma ağacında duruyordu
(blok-zincir-dev'in +127 satırlık `module-gate.spec.ts` düzeltmesi, blok-zincir-denet-i'nin
`plan-admin.test.ts`'e yazdığı 116 satır). Kaybolan şey **ne yapıldığının anlatısıydı**:
hangi hipotez denendi, ne ölçüldü, neyin eksik kaldığı. Bir sonraki tur bunu `git diff`ten
yeniden çıkarmak zorunda kaldı.

Kural (worker'a görev metninde yazılmalı): **raporu işin SONUNDA değil, EN BAŞINDA aç ve
ilerledikçe yaz.** Yarıda kalırsan bile ne yaptığın dosyada durur ve devralan sıfırdan
başlamaz. Ayrıca lead için: "BAŞARISIZ" bildirimi gelince önce `ls docs/agent-results/` ile
dosyanın gerçekten var olup olmadığına ve `git status` ile ağaçtaki artıklara bak — iş
çoğu zaman yarım, sıfır değil.

Devralma görevini yazarken "sıfırdan başlama, önce `git diff -- <dosyalar>` ile ne yazdığını
oku" cümlesini koy; worker aksi hâlde aynı işi baştan yapar.

İlgili: [[fabrika-supervisor-failed-verdict-may-be-a-derived-path-miss]] · [[fabrika-report-that-stops-before-the-gate-line]]
