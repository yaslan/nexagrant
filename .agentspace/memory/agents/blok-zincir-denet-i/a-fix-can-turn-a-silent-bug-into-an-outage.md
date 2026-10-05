---
name: a-fix-can-turn-a-silent-bug-into-an-outage
description: Bir düzeltme "sessizce yutma, fırlat" derse, altındaki yazma yolunun gerçekten çalıştığını KANITLA — yoksa kayıp kayıt kusuru tam kesintiye dönüşür
metadata:
  type: feedback
updatedAt: 2026-09-08
---

TASK-MTSWVADF7RQ1B: RAG'ın `AiUsageLog` yazmaması düzeltildi ve düzeltme
bilinçli olarak hatayı **yutulamaz** yaptı (`AiUsageLogWriteError` her katmanda
yeniden fırlatılıyor). Doğru bir tasarım kararı. Ama yazma yolunun kendisi
üretim yapılandırmasında RLS'e takılıyordu — yani "kayıt tutulmuyor" (sessiz,
uyum sorunu) kusuru, "belge yükleme 500 veriyor, CORDIS ingest duruyor"
(kesinti) kusuruna dönüşmüştü.

**Kural:** bir düzeltme hata yutmayı kaldırıyorsa, QA'nın ilk sorusu
"yeni fırlatma yolu ne sıklıkta tetiklenir?" olmalı. Yeni yazılan satırın
gerçekten yazılabildiğini kanıtla — testler mock'ladığı için yeşil olur.

**Why:** Yutulan hatayı fırlatmak riski görünür kılar; ama altta duran yol
zaten kırıksa, görünürlük doğrudan kullanıcıya kesinti olarak yansır. İki
değişiklik ayrı ayrı doğru, birlikte P1.

**How to apply:** "artık fırlatıyor / yutmuyor / sessiz kalmıyor" diyen her
kartta: (1) fırlatma yolunu gerçek altyapıda tetikle, mock'ta değil;
(2) tetiklenme sıklığını söyle (her çağrıda mı, kenar durumda mı);
(3) çağıran zincirini takip edip kullanıcıya ne göründüğünü yaz.

İlgili: [[a-missing-field-card-hides-a-wrong-value-bug]],
[[fabrika-dev-db-role-bypasses-rls]]
