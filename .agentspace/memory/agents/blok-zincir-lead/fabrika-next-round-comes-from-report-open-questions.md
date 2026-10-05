---
name: fabrika-next-round-comes-from-report-open-questions
description: Sıradaki delegasyon turunun gerçek kaynağı pano değil, biten raporların "Açık sorular" bölümüdür — panodaki review yığını bitmiş işi gösterir, açık işi değil
metadata:
  type: feedback
  updatedAt: 2026-09-08
---

"Görevleri dağıt" geldiğinde panoya bakmak yanıltıcı: `review` kolonu BİTMİŞ
işle dolu, `todo`/`backlog` ise neredeyse boş çıkıyor. Gerçek backlog,
`docs/agent-results/` altındaki en yeni raporların **§ Açık sorular** ve
**§ Sonraki adım** bölümlerinde duruyor — worker'lar kapsam dışı bıraktıkları
kusurları oraya ADIYLA yazıyor ([[fabrika-ask-workers-to-report-not-fix-adjacent-lies]]).

**Why:** Kapsama sadık kalan worker, yolda gördüğü kusuru düzeltmiyor ama
bildiriyor. O bildirimler panoya kart olarak kendiliğinden dönmüyor; lider
çevirmezse kaybolur. 2026-09-08'de `ls -t *.md | head` + her raporun açık-sorular
bölümü, 7 ajana 7 bağımsız kart çıkardı — pano tek başına sıfır iş gösteriyordu.

**How to apply:** Dağıtımdan önce sırayla: (1) `agentspace_delegation_status`
ile kimin boşta olduğunu ölç, (2) `docs/agent-results` içinde `ls -t | head -12`,
(3) her rapordan `Açık sorular` + `Sonraki adım` bölümlerini oku, (4) her bulguyu
o alanın bağlamı olan ajana ver — kusuru ÖLÇEN kişi genelde en ucuz düzelten kişidir.
Bağımlı maddeleri aynı tura koyma ([[fabrika-boss-prefers-clean-chain-over-busy-team]]);
paralel turda her ajana ayrı dosya scope'u ver ve çakışan dosyayı görev metninde
"DOKUNMA, X orada çalışıyor" diye ADIYLA yaz.
