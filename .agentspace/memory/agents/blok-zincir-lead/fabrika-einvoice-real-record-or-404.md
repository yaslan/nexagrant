---
name: fabrika-einvoice-real-record-or-404
description: Patron kararı — e-Fatura belgesi gerçek kayıttan üretilir, kayıt yoksa 404; tedarikçi kimliği env'den gelir
metadata:
  type: project
  updatedAt: 2026-09-07
---

2026-09-07, patron kararı (TASK-MTRD9QBJ2G32E, üç seçenek sunuldu, ŞIK **a** seçildi):

Fatura export rotası (`src/app/api/billing/invoices/[id]/export`) kapatılmayacak ve "DEMO damgası"
çözümü kullanılmayacak. Belge kiracının GERÇEK kaydından üretilir (`withTenant` zorunlu); kayıt yoksa
veya başka kiracıya aitse **404**. Tedarikçi kimliği (şirket adı, VKN, vergi dairesi, adres) koda
gömülmez — `src/lib/env.ts` üzerinden yapılandırma; değer yoksa belge üretilmez, açık hata döner.

Ek karar (aynı gün): `/pricing` Ultra kartındaki "GİB e-fatura ve resmî SLA" satırı **kartta
kalacak**, entegratör **canlıya alırken** bağlanacak. Yani bu bir pazarlama düzeltmesi değil, bir
**çıkış bloklayıcısı**: entegratör bağlanmadan yayına çıkılırsa satılan özellik teslim edilemez.
Kart: TASK-MTRJSOWFH6B45. Belgede bugün "mali değeri yoktur" bandı var; `Invoice.gibEnvelopeId`
gerçek zarf kimliğiyle dolunca bant kendiliğinden kalkıyor — ek kod işi değil, veri işi.

Sonuç: gerçek VKN / vergi dairesi artık bir **GO-LIVE ayarı** — TASK-MSND50ZJIQ3Z2'deki
"sunucuya çıkmadan doldurulacak kritik ayarlar" listesine girer.

İlgili: [[fabrika-fabrication-audit-must-cover-api-export-routes]]
