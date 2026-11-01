---
name: fabrika-post-commit-stamp-must-not-fail-request
description: Doğruluk kaynağı satır yazıldıktan SONRA çalışan "sonucu damgala" güncellemesi korumasızsa, kaydedilmiş bir bildirimi kullanıcıya "kaydedilemedi" diye gösterir — Fabrika'da gerçek gönderimde ölçüldü
metadata:
  type: feedback
  updatedAt: 2026-09-07
---

Fabrika'da bir yazma akışı sık sık şu sırayı izliyor: **(1) doğruluk kaynağı satırı yaz →
(2) yan etki (dosya/uyarı) → (3) yan etkinin sonucunu satıra damgala.** 3. adım
korumasız bırakılırsa, fırlattığında route'un `catch`'ine düşer ve **500** olur — oysa
1 ve 2 çoktan kalıcıdır.

2026-09-07, TASK-MTQUN8VV6DK8C: gerçek formu doldurup "Gönder"e bastığımda kullanıcı
*"kaydedilemedi, tekrar deneyin"* gördü. Veritabanında ise hem `Feedback` satırı hem
onun `SystemAlert` uyarısı **duruyordu**. Kırılan tek şey
`feedback.update({ alertStatus, alertId })` idi. Kullanıcıya söylenen şey verinin
durumuyla **taban tabana zıttı**; tekrar denemesi mükerrer kayıt üretirdi.

**Why:** Dosyanın kendi başlığı zaten "son adımlar gönderimi düşürmez" diyordu; sözleşme
yorumda vardı, kodda yoktu. Bu sınıf hata birim testinden **kaçar** (mock'lanmış prisma
patlamaz) ve typecheck'ten de kaçar. Yalnız gerçek tıklama + sonra DB'ye bakmak yakalar:
UI "hata" derken satırın orada durduğunu görmek gerekir.

**How to apply:**

1. Doğruluk kaynağı satırı yazıldıktan **sonraki** her adımı `try/catch` içine al.
   Yakalarken sessizce yutma: `logger.error` + kendi `recordAlert`'ini yaz.
2. Bir yazma akışını doğrularken **UI'ın söylediğine güvenme, DB'ye bak**. "Hata" gören
   ekranın arkasında kalıcı satır olabilir (ve tersi).
3. "En iyi çaba" sözü yorumda kalmışsa kodda yoktur — yorumu gördüğünde `try` var mı diye
   bak, yoksa ekle.
4. Tetikleyici bu vakada bayat Prisma istemcisiydi
   ([[fabrika-dev-server-stale-prisma-client]]), ama kırılganlık ondan bağımsızdı:
   damgalama her zaman düşebilir (kilit, timeout, bağlantı).

İlgili: [[fabrika-no-sentry-systemalert-decision]] · [[fabrika-runtime-verification-recipe]] ·
[[fabrika-done-reports-can-be-wrong]]
