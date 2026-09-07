---
name: fabrika-engine-vs-caller-product-rules
description: PM kararı — GÜVENLİK kuralı motora, ÜRÜN kuralı çağırana; Fabrika kapı motorunda tenantId motora gömüldü ama deletedAt (arşiv) bilerek çağıranda bırakıldı
metadata:
  type: project
updatedAt: 2026-09-07
---

TASK-MTQZMLLZE1I29'da iki filtre aynı `where` cümlesine aday görünüyordu: `tenantId` ve
`deletedAt`. İkisi aynı şey DEĞİL ve aynı yere ait değiller.

- **`tenantId` → motora.** Bir güvenlik değişmezidir; hiçbir çağıranın onu gevşetme hakkı yoktur.
  Çağıranın hafızasına bırakılırsa ikinci çağıran eklendiği an açılır. Motora gömülür, çağıranın
  kontrolü savunma katmanı olarak KALIR (silinmez).
- **`deletedAt` → çağırana.** "Arşivlenmiş bir fırsat yeniden kapıdan geçirilebilir mi" bir ÜRÜN
  kuralıdır: kullanıcının, düğmenin ve mesajın olduğu yerde cevaplanır. Motora gömülürse her
  çağıran aynı ürün kararına mahkûm olur ve — kritik — arşivlenmiş bir kayıt için DAHA ÖNCE
  dosyalanmış kararın gerekçesi yeniden üretilemez hale gelir. Kapı çalıştırmak bir denetim
  olayıdır, içerik düzenlemesi değil.

**Ayırt edici soru:** "Bu filtreyi kaldırmak birine BAŞKASININ verisini mi verir (güvenlik), yoksa
sadece istenmeyen bir akışa mı izin verir (ürün)?" Birincisi motora, ikincisi çağırana.

Bu kararı koda gömmek yerine sonuç raporuna ve ilgili ajana **tavsiye** olarak yazmak da rolün
parçası — çözümü mühendise dayatma, ne/neden'i yaz.

İlgili: [[fabrika-tenant-filter-check-the-write-too]]
