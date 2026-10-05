---
name: ui-guard-behind-hidden-control-is-dead-code
description: Koşullu render edilen bir kontrolün kendi hata guard'ı ölü koddur — hata mesajının biçimini düzeltmek yetmez, kontrolü görünür kılıp sebebi söyletmeden düzeltme DOĞRULANAMAZ
metadata:
  type: feedback
  updatedAt: 2026-09-07
---

Bir düğme `{x && <button onClick={h}/>}` ile render ediliyorsa ve `h` içindeki ilk satır
`if (!x) { hata }` ise, o hata dalı **hiçbir zaman çalışmaz**. Bu iki ayrı sorun yaratır:

1. **Doğrulanamaz düzeltme.** "alert() yerine satır içi hata koydum" denir ama gerçek tıklamayla
   gösterilemez; kanıt yalnız koda bakmaya indirgenir — bu repoda kabul edilmiyor.
2. **Asıl kullanıcı sorunu zaten kontrolün kaybolmasıdır.** Kullanıcı düğmeyi göremediğinde
   nedenini de göremez; sessiz kaybolma, kötü hata mesajından daha kötüdür.

Doğru hamle: kontrolü **her durumda** render et, tıklandığında sebebi söyle. `disabled` + tooltip
seçme; disabled düğme tıklanamadığı için sebebi hiç söylemez ve ekran okuyucuya zayıf geçer.

2026-09-07, M9 briefs (`TASK-MTQUX5IZ9I5VP`, P3-14): `.ics` düğmesi yalnız tarihli brief'te
render ediliyordu, guard'daki `alert('Toplantı tarihi belirlenmemiş')` ulaşılamazdı. Dogfood
bunu `[D10] .ics button count on active brief: 0` diye ölçmüştü. Düğme koşulsuz render edilince
hem sebep söylenebilir oldu hem de e2e gerçek tıklamayla doğrulanabildi.

Genel kural: bir hata yolunu düzeltmeden önce **onu tetikleyen gerçek kullanıcı adımını yaz**.
Adımı yazamıyorsan düzelttiğin şey ölü koddur; önce ulaşılabilir yap.

İlgili: [[fabrika-done-reports-can-be-wrong]] · [[fabrika-runtime-verification-recipe]]
