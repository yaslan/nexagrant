---
name: fabrika-fabrication-audit-must-cover-api-export-routes
description: Uydurma veri taramaları UI bileşenlerinde kalırsa API export rotalarındaki sahte resmî belgeleri kaçırır
metadata:
  type: project
  updatedAt: 2026-09-07
---

Fabrika'da "uydurma veri" temizliği dalgaları hep UI bileşenlerini taradı; ama en ağır ihlal
`src/app/api/billing/invoices/[id]/export/route.ts` içindeydi: sabit kodlanmış VKN, vergi dairesi,
UUID ve `isEfaturaUser: true` ile indirilebilir XML/PDF "e-fatura". Bir bileşen taraması bunu
göstermez, çünkü ekranda yalnız bir indirme bağlantısı görünür.

Kural: uydurma/resmiyet iddiası taramasında `src/app/api/**` route dosyalarını ve belge üreten
lib'leri (`src/lib/efatura*` gibi) AYRI bir kalem olarak tara — dosya adı değil, üretilen ÇIKTI
resmî belge gibi mi görünüyor diye sor. Bkz. TASK-MTRD9QBJ2G32E.

İlgili: [[fabrika-ask-workers-to-report-not-fix-adjacent-lies]]
