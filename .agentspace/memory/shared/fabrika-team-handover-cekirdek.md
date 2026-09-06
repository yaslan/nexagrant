---
name: fabrika-team-handover-cekirdek
description: Fabrika iki ajan takımı arasında devredildi — eski takımın raporlarını dosya adına değil içeriğine göre ayırt et; ROADMAP.md artık doğrulanmış durumda
metadata:
  type: project
  updatedAt: 2026-09-06
---

Fabrika projesi 2026-09-06'da **eski takımdan Çekirdek takımına** devredildi.
`docs/agent-results/archive-team-0c1f10/` artık eski takımın (mühendislik takımı — `cora`,
`defne`, `sora`, `derin`, hangi rol/proje adıyla imzalanmış olurlarsa olsun) TÜM raporlarını
tutuyor; kökte yalnız Çekirdek'in imzaladığı raporlar var (bkz. `docs/agent-results/README.md` ve
`docs/agent-results/HANDOVER-2-blockzincir-pm.md` tamamlama raporu).

**Önemli düzeltme (HANDOVER-2'de öğrenildi):** `-0c1f10` dosya-adı soneği eski takımı GÜVENİLİR
şekilde ayırt etmiyor — bazı eski-takım raporları hiç sonek taşımadan, hatta yanıltıcı isimlerle
(`TASK-MTQ3DZS6W6DFC-product.md` içeriği `Ajan: Sora (sora-0c1f10)` diyor) kayda geçmiş. Doğru
yöntem: raporun kendi "Ajan:"/"Yürüten ajan:" satırını oku, ya da adın
`.agentspace/memory/agents/<ad>/` altında karşılığı olup olmadığına bak (o karşılık varsa ve
`blok-zincir-lead`'in [[agentspace-cross-team-delegation-grant]] hafızasındaki cekirdek
roster'ında değilse, eski/başka takımdır). Dosya adına güvenip mekanik taşıma yapma.

Çekirdek takımı roster'ı (2026-09-06 itibariyle): `geli-tirici`, `blok-zincir-dse`,
`blok-zincir-lead`, `customer-support`, `blockzincir-pm`, `blog-yazar`, `ex-en`.

Rapor dosyası adlandırması hâlâ TUTARSIZ olabilir — aynı iş birden çok adla durabilir. Ölçülmüş
örnek: `DALGA-1-geli-tirici.md` ile `TASK-MTQ61HQDX035M-geli-tirici.md` **bit-bit aynı dosyaydı**
(md5 `bfced4bf...`) — ikincisi (görev kodlu) tutuldu, ilki silindi. Yeni bir rapor gördüğünde
"yeni bir iş" sanmadan önce md5/içerik karşılaştır.

`docs/ROADMAP.md`'nin 29 kutusu artık **HANDOVER-2'de tek tek doğrulandı** (git log + kod +
docs/agent-results/ ile) — 21'i `[x]`, 8'i `kısmi: <ne eksik>` notuyla. Bu iş bittiğine göre bu
notun eski "29 kutunun 0'ı işaretli" iddiası artık geçerli değil; ROADMAP.md'nin kendisi güncel
kaynak. Bkz. [[fabrika-parallel-agent-file-race]].
