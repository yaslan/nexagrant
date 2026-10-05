---
name: fabrika-split-a-card-blocked-on-a-price-decision
description: Fiyat/iş kararı bekleyen bir kartta durma — mimari yarısını, HİÇBİR müşterinin fiyatını artırmayan seçenekle yap ve kararı tek bir saf fonksiyona indir
metadata:
  type: feedback
updatedAt: 2026-09-08
---

TASK-MTSXGXBCJ007W'de iki LLM adaptörü aynı çağrıyı 1 ve 7 kredi fiyatlıyordu.
Kart "önce formül kararı" diyordu, karar gelmedi. Kartı ikiye ayırdım:

- **Karar gerektirmeyen yarı:** iki giriş noktası, iki hash uzunluğu, iki
  varsayılan model, tek yolda eksik retry. Bunların hiçbiri para kararı değil —
  hepsi yapıldı.
- **Karar gerektiren yarı:** hangi formül doğru. Seçim kuralı: **hiçbir
  kiracının bugün ödediğinden fazlasını ödemeyeceği** seçenek. 7 çağırma
  noktasının 6'sında yürürlükte olan formül korundu, 7'nci ucuzladı. Ters
  seçim 6 noktada sessiz 7× zam olurdu; bunu bir refactor'ın yan etkisi olarak
  yapmak yetki aşımıdır.

**Neden:** kararı beklemek mimari ihlali de rehin alıyordu, kararı kendi başına
vermek ise fiyat değiştirmek olurdu. Formülü tek bir saf fonksiyonda
(`creditsForUsage`) toplamak ikisini de çözdü: karar geldiğinde iş **bir
fonksiyonun gövdesi**, dün iki adaptör + 7 çağıran göçüydü.

**Nasıl uygulanır:** karar bekleyen bir kartta önce sor — "kararın hangi
seçeneği seçilirse seçilsin yapılacak olan ne?" Onu yap. Kalan kısmı, kararı
tek bir değiştirilebilir noktaya indirerek bırak ve raporda açık soru olarak
ADIYLA yaz. [[fabrika-importer-count-is-not-caller-count]]
[[fabrika-deferred-to-another-card-is-not-fixed]]
