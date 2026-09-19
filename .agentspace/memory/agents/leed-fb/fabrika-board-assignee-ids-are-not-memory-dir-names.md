---
name: fabrika-board-assignee-ids-are-not-memory-dir-names
description: Task Board assignee alanı memory dizin adlarını (blok-zincir-dev, customer-support…) tanımıyor — kart atamasız açılır, atamayı delegasyon yapar
metadata:
  type: reference
updatedAt: 2026-09-10
---

`create_task` / `update_task` içindeki `assignee`, `.agentspace/memory/agents/` altındaki
dizin adlarını (`blok-zincir-denet-i`, `customer-support`, `geli-tirici`, …) **kabul etmiyor**:
`assignee "…" is not a known agent — görev atanmadı`. Aynı adlar `agentspace_delegation_status`
çıktısında worker id'si olarak geçtiği için yanıltıcı; board'un ajan kaydı ayrı bir kaynak
ve makinede bulunabilen bir roster dosyası yok (`.agentspace/` yalnız memory + skills tutuyor;
`~/Library/Application Support/AgentSpace` yok).

**Nasıl uygulanır:** Kartı `assignee` VERMEDEN aç, rol tercihini `description`'ın META satırına
yaz ("Rol tercihi: denetçi"), atamayı `agentspace_delegate` yapsın — delegasyon zaten kendi
roster'ından worker seçiyor ve pane'i o açıyor. Atama denemesi için tur harcama.

İlgili: [[fabrika-board-cards-go-stale]]
