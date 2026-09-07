---
name: fabrika-boss-prefers-clean-chain-over-busy-team
description: Patron, bağımlı adımlarda paralellik yerine sıralı doğrulamayı seçiyor — boşta duran ekip, bulanık kanıttan iyidir
metadata:
  type: feedback
updatedAt: 2026-09-07
---

2026-09-07, faturalama zinciri (katalog → paneller → DB geçişi): iki kez üst üste
sıralı ilerlemeyi seçti — önce "panelleri önce bitir, DB geçişini ayrı yap", sonra
boştaki 5 worker'a teknik borç kartı vermeyi reddedip "zincir bitene kadar ekip beklesin"
dedi.

**Neden:** adımlar birbirine bağımlıyken paralellik kanıtı bulanıklaştırıyor. Panel
katalogdan okumaya başlayınca ekrandaki rakam kanıt oluyor; DB geçişi aynı anda koşsaydı,
yanlış bir fiyatta sebebin katalog mu, panel mi, migration mı olduğu ayırt edilemezdi.

**Nasıl uygula:** bağımsız işlerde 6 paralel worker varsayılan (dalgalar böyle koştu ve
işe yaradı). Ama bir iş zinciri varsa paralellik ÖNERME — sırayı öner, her adımın kanıtını
al, sonra sonrakini başlat. Boşta kalan kapasiteyi doldurmayı teklif etmek serbest ama
ısrar etme; patron için ölçüm netliği, worker doluluğundan önce geliyor.

Bkz. [[fabrika-file-ownership-delegation-works]] · [[fabrika-verify-what-a-gate-measures]]
