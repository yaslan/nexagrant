---
name: fabrika-g0-evidence-placeholder-laundering
description: Kanıt kaydını non-null bir sütuna yazarken koyduğun dolgu değeri, bir sonraki koşuda "ölçülmüş veri" diye geri okunur — bayrakla işaretle, hem create hem update dalında koru
metadata:
  type: feedback
  updatedAt: 2026-09-07
---

Fabrika G0 puanlayıcısını yazarken (TASK-MTQ63RR8Z0G8E) kendi kodumda iki aşamalı bir hata yaptım;
deseni her "hesabı kanıtıyla birlikte sakla" işinde tekrar edecek.

`TopicMatch.breakdown`'a puan dökümünü yazmak istedim ama aynı tablodaki `fitScore` **non-null**.
Satırı yaratırken oraya bir şey yazmak zorundaydım ve kullandığım `alignment` değerini yazdım.
Sonuç: bir sonraki koşu o satırı okuyup `fitScore`'u **K1 eşleşmesi sanıyor**, "alignment ölçüldü"
diye işaretliyor ve kanıt kapsamı %18 → %48'e şişiyordu. Tek bir yeni olgu olmadan.
İkinci hata: bayrağı ekledikten sonra `upsert`'ün **update dalı bayrağı düşürüyordu**, yani
backfill'den sonraki ilk yazma dolguyu tekrar kanıta terfi ettiriyordu.

**Why:** "eksik veri" ile "ölçülmüş sıfır" arasındaki farkı kaybettiğin an, uydurma sayıyı silmek
için yazdığın kod yeni bir uydurma sayı üretmeye başlar. Kapsam/güven metriği de sessizce yalan söyler.

**How to apply:**
- Dolgu değeri yazmak zorundaysan, aynı satıra **makine tarafından okunabilir bir bayrak** koy
  (`breakdown.g0ScorerPlaceholderFitScore: true`) ve okuyucu tarafta o bayrağı kontrol et.
- Bayrağı **create ve update dallarının ikisinde de** yaz. Bayrağın gerekip gerekmediğini
  hesaplamanın **kendi kaynak izinden** türet (ör. "alignment gerçekten `TopicMatch.fitScore`'dan
  mı ölçüldü"), ekstra sorgu atma.
- Bu sınıf hatayı **birim test yakalamaz**; gerçek DB'de backfill'i **art arda iki kez** koşup
  kapsamın kaymadığını gör. Ben ancak üçüncü koşuda fark ettim.

İlgili: [[fabrika-g0-score-never-computed]]
