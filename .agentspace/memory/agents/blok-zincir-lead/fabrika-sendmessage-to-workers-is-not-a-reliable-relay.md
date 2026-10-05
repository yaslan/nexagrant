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

---

## 2026-09-10 — inceltme: "success" satırının İKİ biçimi var, ayırt et
7 kişilik dalgayı dağıttıktan sonra paylaşılan `messages/*.json` stage tuzağını
([[fabrika-shared-json-whole-file-add-swallows-others-edits]]) 7 pane'e SendMessage
ile yetiştirmeye çalıştım. Bu sefer dönen satır şuydu:

> `"success":true, "message":"… → fabrika-f2 (another Claude session on this machine; it is also connected via Remote Control)"`

**2026-09-08'deki "held for the recipient user's approval" cümlesi bu kez YOKTU.** Yani
iki farklı sonuç var ve ayırt edilebilir:
- sonuçta *"held for … approval / Not delivered yet"* geçiyorsa → **teslim edilmedi**, patrona "ulaştı" deme.
- yalnız `→ <oturum adı>` satırı varsa → teslim kuyruğuna girdi; yine de worker'ın onu
  OKUDUĞUNU kanıtlayan tek şey worker'ın raporunda o kurala atıf yapmasıdır. Teslim ≠ okundu.

Ayrıca `ListAgents`'ta worker pane'leri opak adlarla (`fabrika-XX [ref]`) görünüyor —
hangi satırın hangi ajan olduğu ADINDAN anlaşılmıyor; eşleştirme yalnız "dalgayla aynı
saniyede başlamış, `busy`" bilgisinden yapılabiliyor. Belirli bir worker'a ulaşmak
istiyorsan ya hepsine gönderip mesajın başına "yalnız şu koşuldaysan geçerli, değilse
yok say" filtresi koy, ya da hiç gönderme; her mesaj alıcının bir turunu harcar.

Kural değişmedi: SendMessage **ek** kanaldır, tek kanal değil.
Bkz. [[fabrika-recall-before-delegating-not-after]]

## Kapanış (2026-09-10, aynı gün)
Bu turda gönderilen katalog uyarısı YALNIZ teslim edilmedi, UYGULANDI: blok-zincir-dev
commit ettiği anda `git diff --cached -- messages/*.json` koştu, geli-tirici'nin commit'siz
`invoice.*` bloğunu stage'de gördü, GERİ ALMADI, commit'i attı (6513085) ve raporuna not düştü —
tam da bu dosyanın tarif ettiği davranış. Yani "teslim ≠ okundu" kaydı hâlâ doğru, ama okunduğunu
kanıtlayan şey geldi: worker'ın raporunda kurala atıf. Kanıt buradan aranır.
