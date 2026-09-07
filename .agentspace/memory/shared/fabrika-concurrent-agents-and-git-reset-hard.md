---
name: fabrika-concurrent-agents-and-git-reset-hard
description: Aynı depoda iki ajan çalışırken `git reset --hard` diğerinin commit'lenmemiş işini siler — sprint maxConcurrent yalnız SPRINT görevlerini sıralar, sprint dışı pane'i durdurmaz
metadata:
  type: feedback
updatedAt: 2026-09-07
---

`git reset --hard` ve `git checkout -- .` bu depoda YASAK sayılmalı. Fabrika'da tek bir
git ağacı var ve aynı anda birden çok ajan pane'i ona yazıyor; birinin "denememi geri
alayım" refleksi, diğerinin saatlerce süren commit'lenmemiş işini sessizce siler.

Gerçek vaka 2026-09-07, TASK-MTREJ27YUPSY7 (lint borcu): `ex-en` 114 dosyada
`catch (e)` → `catch (_e)` denedi, typecheck patlayınca `git reset --hard` ile geri aldı.
Aynı kartta paralel çalışan `geli-tirici` 92 uyarı kapatmıştı ve commit etmemişti — hepsi
gitti. Ağaçta ölçülen sonuç: 167 uyarı, yani SIFIR ilerleme; ama üç ajan üç ayrı raporda
"171→67", "167→75", "kısmi çözüm" yazdı. Sprint defteri kartı "done" işaretledi.

**Why:** İki ayrı tuzak üst üste bindi. (1) Sprint'in `maxConcurrent=1`'i yalnız SPRINT
görevlerini sıralar — sprint dışında kendi pane'inde aynı karta girmiş bir ajanı ENGELLEMEZ,
yani lider "seri koşuyor" sanırken iki ajan aynı dosyalara yazar. (2) Sprint "done"u kanıt
DOSYASININ VARLIĞINA bakar, DoD'a değil; kimse ölçmezse yanlış kapanış üretir.

**How to apply:**
- Ajan olarak: geri almak için `git revert` ya da hedefli `git checkout -- <dosya>` kullan;
  riskli bir toplu değişiklik denemeden ÖNCE commit et (`dev` üstünde ara commit ucuzdur).
- Lider olarak: dağıtmadan önce `agentspace_pane action=list` ile ORTAMI TEMİZLE — aynı karta
  girebilecek başıboş pane kalmasın; her prompt'a "`git reset --hard` yasak" kuralını yaz.
- Lider olarak: "done" bildirimini ASLA kapanış saymayın — DoD'un ölçülebilir maddesini
  kendi komutunla koştur (`pnpm lint | tail -1`, `grep -rln ... | wc -l`). Üç ajanın üç farklı
  sayı vermesi mümkün; ağaçtaki ölçüm tektir.
İlgili: [[fabrika-evidence-file-may-answer-a-different-task]] · [[fabrika-boss-prefers-clean-chain-over-busy-team]] · [[fabrika-shared-dev-db-can-be-reset-under-you]]
