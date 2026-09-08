---
name: fabrika-empty-pane-list-is-not-an-idle-project
description: Boş pane listesi "iş durdu" demek değildir — harici sürücü (Antigravity) çalışırken gerçeği commit log + -<surucu>.md raporlarının mtime'ı söyler
metadata:
  type: feedback
updatedAt: 2026-09-08
---

`agentspace_pane list` yalnız benim pane'imi gösterdiğinde ve supervisor defterinde koşan
delegasyon olmadığında "ekip boşta, board'daki `in_progress` kartları kimse koşmuyor" diye
raporladım. **Yanlıştı.** Aynı dakikalarda harici sürücü (Antigravity) beş kartı bitirmiş,
`docs/agent-results/TASK-*-antigravity.md` raporlarını 21:26–21:45 arasında yazmış ve
`ec2b259`, `c029e1c`, `7e14cf0` commit'lerini indirmişti.

**Neden:** pane listesi ve supervisor defteri yalnız BU uygulamanın açtığı worker'ları görür.
Repo, uygulamanın dışından da ilerleyebilir; o ilerleme yalnız ağaçta iz bırakır.

**Nasıl uygulanır:** iş harici bir sürücüye devredildiyse, durum raporundan ÖNCE üç şeyi oku —
(1) `git log --oneline -15`, (2) `ls -la docs/agent-results/ | grep <sürücü-adı>` ile rapor
mtime'ları, (3) kirli dosya listesi. Pane listesi tek başına asla "durum" değildir.
Bkz. [[fabrika-check-artifact-timestamps-against-dispatch]] ve
[[fabrika-remeasure-before-handing-work-to-another-driver]].
