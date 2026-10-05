---
name: prove-a-privacy-gate-by-removing-it-and-read-which-assertion-falls
description: Sızıntı/yetki testini kapıyı geçici kaldırıp koş — sadece "düştü mü" değil HANGİ iddianın düştüğünü oku; taşıyıcı katmanın sandığın katman olmadığını orada görürsün
metadata:
  type: feedback
updatedAt: 2026-09-10
---

Fatura kimliği ekranında (TASK-MTSY71BUMBLWM) "yetkisiz rol VKN/TCKN'yi almamalı" testi ilk
koşuşta yeşil geçti. Yeşil geçen bir sızıntı testi hiçbir şey kanıtlamaz — kapı olmasa da geçiyor
olabilir. Kontrollü deney: `page.tsx`'teki `if (canEditIdentity)` okuma kapısını `if (true)` yapıp
aynı spec'i yeniden koştum.

Test düştü — ama **beklediğim iddiadan değil**. Düşen satır ham VKN değil, *vergi dairesi* oldu:

- `maskVknTckn` sunucuda çalıştığı için **kapı tamamen kalksa bile** ham numara tarayıcıya inmiyor.
- Ama kimliğin geri kalanı (unvan, vergi dairesi, adres) iniyor.

Yani iki bağımsız katman var — **sunucu tarafı maskeleme** numarayı, **rol kapısı** kimliğin geri
kalanını koruyor. Kapıyı "numarayı koruyan şey" sanıp maskelemeyi sadeleştirseydim, sızıntıyı
kendi elimle açardım; testler yine yeşil kalırdı.

**Neden:** Bir test yeşilse hangi mekanizma sayesinde yeşil olduğunu bilmiyorsundur. Kontrollü
deney bunu söyler, ve düşen İDDİANIN ADI hangi katmanın taşıyıcı olduğunu tam olarak gösterir.

**Nasıl uygularım:**
- Yetki/gizlilik testi yazınca kapıyı bir kez kaldır, koş, kareyi/çıktıyı rapora koy, kapıyı geri
  koy ve `git diff` ile geri geldiğini doğrula. Kanıt dosyasına "kontrollü deney" başlığıyla ekle.
- Düşen iddianın adını oku. Beklediğinden farklıysa, sistemde senin modelinde olmayan ikinci bir
  koruma var demektir — onu bul ve yorumla belgele, yoksa bir sonraki kişi sadeleştirip siler.
- Sızıntı testinde `innerText` değil `page.content()` kullan: RSC/serialize edilmiş sunucu yükü
  ancak orada görünür; CSS ile gizlenmiş bölüm `innerText` testini geçer.

Bkz. [[fabrika-prove-a-gate-failure-is-not-yours]] — aynı refleks (kontrollü deney), farklı hedef.
