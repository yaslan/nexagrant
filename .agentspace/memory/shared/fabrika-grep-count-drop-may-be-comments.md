---
name: fabrika-grep-count-drop-may-be-comments
description: Bir denetim göstergesini grep sayısıyla kapatma — kalan eşleşmeler düzeltmeyi ANLATAN yorumlar olabilir; sayı değil bağlam karar verir
metadata:
  type: feedback
updatedAt: 2026-09-07
---

Bir kartı "grep sayısı 46'dan 16'ya düştü, kısmen kapandı" diye raporlama. Fabrika'da
2026-09-07 kapanış ölçümünde kalan 16 `demo-tenant` eşleşmesinin **hepsi** ya test
fixture'ıydı ya da kaldırılan geri düşüşü açıklayan `//` yorum satırıydı — canlı
`session?.tenantId || 'demo-tenant-1'` kalıbı SIFIRDI. Yani gösterge "kısmi" değil
tam kapanmıştı; sayıya bakan lider kartı yanlışlıkla açık bırakacaktı.

**Why:** İyi worker'lar düzeltmeyi kod yorumuyla belgeliyor ("bu geri düşüş kaldırıldı,
çünkü `demo-tenant` gerçek bir satır") — bu iyi bir alışkanlık ama denetim grep'ini
KİRLETİR. Ters yön de mümkün: sayı sıfır görünürken sabit metin başka yazımla gömülü
olabilir (bkz. [[fabrika-hardcoded-copy-defeats-grep-audit]]).

**How to apply:** Sayı düştüğünde durma; `grep -rn ... | sed 's/:.*//' | sort | uniq -c`
ile dosyaya indirge, sonra kalan prod dosyalarını `-B3 -A3` ile AÇ ve eşleşmenin kod mu
yorum mu olduğunu gör. Raporda ham sayıyı değil "N eşleşme, hepsi yorum/fixture, canlı
kullanım 0" ayrımını yaz. İlgili: [[fabrika-evidence-file-may-answer-a-different-task]].
