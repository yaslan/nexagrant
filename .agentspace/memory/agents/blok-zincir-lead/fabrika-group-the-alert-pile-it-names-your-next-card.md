---
name: fabrika-group-the-alert-pile-it-names-your-next-card
description: Alarm yığınını kaynağa göre grupla — ama gruplamadan SONRA "bu satırlar hâlâ var olan bir şeye mi ait" diye sor; Fabrika'da %87'si silinmiş tenant'lara aitti
metadata:
  type: feedback
  updatedAt: 2026-09-10
---

`TASK-MTTUUGKNDGBXK`'nın düşen ilk koşusu kanıt dizinine bir ölçüm bırakmıştı: `SystemAlert`
106 satır, 106'sı açık, ve **%77.4'ü tek kaynak** (`invoice_buyer_identity_missing`). O kaynağı
üreten satırı buldum (`src/lib/billing/invoice-writer.ts:400`), panoda karşılığı olan kartı
buldum (`TASK-MTSY71BUMBLWM` — fatura alıcı kimliği ekranı yok), backlog'dan çıkarıp P0
olarak dağıttım ve gerekçe olarak "açık alarmların %77'sinin kökü" dedim.

**Gerekçe yanlıştı.** İki bağımsız triyaj aynı gün ölçtü: satırların **229/263'ü SİLİNMİŞ
tenant'lara ait**. Sebep, e2e temizliğinin "benim tenant'ıma ait her şeyi sil" deseni —
ve `SystemAlert` bu desenin ulaşamadığı tek tablo, çünkü tasarım gereği `tenantId` kolonu
yok (`src/lib/observability/system-alert.ts`). Yani her e2e koşusu alarmını arkada bırakıyor.
Yığın ben kart yazarken bile büyüyordu: dört dakikada 260→263, ve benim "bilinen gerçek"
diye karta yazdığım 106 sayısı **2,5 kat bayattı**.

**Sonuç:** `TASK-MTSY71BUMBLWM` bitse bile yığın büyümeye devam eder. İki ayrı iş vardı,
ben tekini görüp diğerinin gerekçesi sandım. (Kart yine de geçerli — hiçbir ekranın
`TenantBillingIdentity` yazmadığını kendim ölçtüm ve fatura kesmenin önünde duruyor —
ama önceliğini alarm sayısına dayandırmam yanlıştı.)

**Doğru kalan yarısı:** yığını `GROUP BY source` ile açmak hâlâ doğru ilk adım; tepedeki
kaynağı üreten kod satırını bulmak da öyle.

**Eksik olan adım — bundan sonra ZORUNLU:** gruplamadan sonra **satırların hâlâ var olan bir
şeye ait olup olmadığını** sor. Somut sorgu: alarmın işaret ettiği tenant/kayıt bugün DB'de
duruyor mu? Durmuyorsa o satır bir ürün kusurunu değil, **test çöpünü** ölçüyor. Ayrıca
yığının BÜYÜME HIZINI ölç (iki zaman damgası yeter) — sabit bir sayı geçmişi, artan bir sayı
canlı bir üreticiyi anlatır ve ikisi bambaşka kartlardır.

Ve devralınan sayıyı karta "bilinen gerçek, tekrarlama" diye YAZMA
([[fabrika-an-audit-goes-stale-while-you-write-the-card]]): bu kartta tam da o talimat
yüzünden worker'a bayat bir taban dayatmıştım; uymayıp yeniden ölçtüğü için doğruyu bulduk.
