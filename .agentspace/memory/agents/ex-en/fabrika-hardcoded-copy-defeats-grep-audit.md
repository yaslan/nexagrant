---
name: fabrika-hardcoded-copy-defeats-grep-audit
description: Bir denetimin "grep ile bulunamadı → özellik yok" bulgusu, copy sabit gömülüyse yanlış teşhis verir — yüzeyi bul ve tarayıcıda aç, denetimin grep'ini tekrarlama
metadata:
  type: feedback
  updatedAt: 2026-09-07
---

TASK-MTQTYE287FERM: denetim raporu "Evaluator Lens etiketi kodda HİÇ YOK — ne TR ne EN
karşılığı grep ile bulunamıyor" dedi ve kart bu teşhisle açıldı. İki bağımsız hata vardı:

1. **Denetim eskimişti** — anahtarlar denetimden sonra inen commit'lerle (02f7fd2,
   8dd3658) zaten eklenmişti.
2. **Denetimin grep'i, var olan bir rozeti kaçırdı** — Evaluator Lens sayfasında rozet
   ekranda GÖRÜNÜYORDU, ama copy `client.tsx` içine **sabit Türkçe** gömülüydü ve
   denetimin aradığı anahtar adından (`internalPreAssessment`) farklı sözcüklerle
   yazılmıştı ("İç Ön Değerlendirmedir:" — sonda "-dir" eki).

Yani gerçek kusur "etiket yok" değil, **"etiket i18n'siz, İngilizce kullanıcı okuyamıyor"**dı.
Kartı olduğu gibi uygulasaydım var olan rozetin yanına ikinci bir rozet eklerdim.

**Why:** Bir grep, aradığı dizeyi bulamadığında iki şeyi ayırt edemez — özellik yok mu,
yoksa özellik başka sözcüklerle mi yazılmış. Sabit gömülü copy tam olarak ikinci durumu
üretir ve i18n'siz olduğu için anahtar adıyla da eşleşmez.

**How to apply (Explorer olarak, bir denetim/bug kartını uygulamadan önce):**

1. Denetimin **grep'ini tekrarlama**, **yüzeyini bul**: özelliği gösteren route/bileşen
   hangisi? Önce o dosyayı oku.
2. Sonra tarayıcıda **aç ve bak** — "kodda yok" ile "ekranda yok" farklı iddialardır.
3. Eksikliği ararken anahtar adını değil **anlamı** ara: `grep -iE "ön değerlendirme|
   preliminary|resmî|official"` gibi geniş tara, sonra daralt.
4. Teşhis kartla uyuşmuyorsa **kartı düzelt ve raporla** — kart metni de bir kaynaktır,
   kesin hüküm değil. Bulduğun gerçek boşluğu kapat, uydurmayı değil.
5. Rapora denetimin nerede haklı, nerede bayat olduğunu **açıkça yaz**; yoksa bir sonraki
   ajan aynı bayat bulguyu tekrar kanıt sanır.

İlgili: [[fabrika-m6-disclaimer-surfaces]] · [[fabrika-board-cards-go-stale]]
