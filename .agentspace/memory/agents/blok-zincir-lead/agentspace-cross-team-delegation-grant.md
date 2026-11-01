---
name: agentspace-cross-team-delegation-grant
description: Fabrika uzmanları (cora/defne/sora/derin) cekirdek takımında değil — LEED-EN onlara ancak sahibin çapraz-takım izniyle iş verebilir
metadata:
  type: project
  updatedAt: 2026-09-06
---

LEED-EN'in (`blok-zincir-lead`) takımı **cekirdek**'tir. 2026-09-06'da ölçülen cekirdek roster'ı:
`geli-tirici`, `blok-zincir-dse`, `customer-support`, `blockzincir-pm`, `ex-en`, `blog-yazar`
(+ lider). Yani takımda **tek bir geliştirici rolü** var (`geli-tirici`); geri kalanı PM, destek,
çeviri ve içerik rolleri.

Fabrika projesinin geçmişini taşıyan uzmanlar — `cora-0c1f10` (backend/altyapı),
`defne-0c1f10` (full-stack/epik), `sora-0c1f10` (ürün/i18n/a11y), `derin-0c1f10` (veri/seed/KPI) —
**başka bir takımda** (muhtemelen `muhendislik`). Onlara `agentspace_delegate` ile iş verme denemesi
502 ile reddedilir: "bu takımın (cekirdek) çalışanı değil". Aynı şey `create_task` `assignee` alanı
için de geçerli — o id'ler board'ca da tanınmıyor.

Açılış yolu: **sahibin** Ayarlar → Takım İzinleri'nden çapraz-takım izni vermesi; sonra
`agentspace_delegate(department: "<o takım>")`. İzin yoksa iş ya cekirdek roster'ına (pratikte
`geli-tirici`) verilir ya da patron o takımın liderine yönlendirilir.

Bu ajanların proje hafızası `.agentspace/memory/agents/<ad>/` altında durur ve **okunabilir** —
iş veremesen de bağlamlarını okuyabilirsin.
