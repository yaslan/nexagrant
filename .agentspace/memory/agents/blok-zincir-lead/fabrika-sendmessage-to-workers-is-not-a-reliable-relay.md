---
name: fabrika-sendmessage-to-workers-is-not-a-reliable-relay
description: Koşan worker'a karar iletmenin güvenilir yolu SendMessage değil — mesaj alıcı onayında takılıyor; kararı görev kartına ve ADR'ye yaz
metadata:
  type: feedback
updatedAt: 2026-09-08
---

2026-09-08'de patron TCMB kesinti kararını verdi ve karar, o an Faz 2'yi koşan
geliştiriciye ulaşmalıydı. `ListAgents` üç peer oturum gösterdi (worker pane'leri),
`SendMessage` üçüne de "success" döndürdü — ama arkasından şu geldi:

> Your message to another session was held for the recipient user's approval.
> Not delivered to that session's Claude yet.

Yani **"success" teslim demek değil.** Üç mesaj da onay kuyruğunda kaldı, worker
kararı görmedi. Patrona "karar geliştiriciye ulaştı" demiştim; düzeltmek zorunda kaldım.

**Nasıl uygula:** koşan bir worker'a karar/talimat iletmen gerektiğinde SendMessage'a
GÜVENME — teslim edildiğini varsayıp patrona "ulaştı" deme. Güvenilir kanallar:
1. **Görev kartının `description`'ını güncelle** (`update_task`) — worker karta bakıyor,
   board anında yansıtıyor. Kararı en üste 🔔 başlıklı bir blok olarak koy ki
   "bu madde artık soru değil" görünsün.
2. **Kararı kalıcı belgeye yaz** (ADR/`docs/`) ve commit'le — worker'a zaten
   "şunu ZORUNLU oku" demiştin.
3. Worker'a görevi verirken zaten "karar gelene kadar DUR ve sor" dediysen, sorduğunda
   cevapla — bu en güvenilir yol, ama worker'ı bekletir.

SendMessage'ı yalnız **ek** bir bildirim olarak kullan, tek kanal olarak değil.
Bkz. [[fabrika-empty-pane-list-is-not-an-idle-project]]
