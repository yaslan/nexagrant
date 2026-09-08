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

**2026-09-08 ek — ikinci export rotası, aynı sınıf, üstüne yetki açığı.**
`src/app/api/documents/export/route.ts` aynı deseni tekrarladı: sabit `tenantName:
'FonBridge Teknoloji A.Ş.'`, uydurma çağrı kimliği ve `signedAt: new Date()` — yani her
indirme "şimdi imzalandı" diyor. Bunu bir kart bulmadı; bağımsız doğrulamacı (dse) başka bir
işi ölçerken yolun üstünde gördü. Dahası aynı rotada `auth()` YOK ve `findUnique({ where:
{ id: partId } })` `tenantId` daraltmasız — oturumsuz `curl` 200 döndü (CLAUDE.md §1).

Ders: uydurma-veri taraması ile yetki taraması AYNI dosyada buluşuyor. Belge üreten bir rotayı
incelerken ikisini birlikte sor: "bu dize gerçek kayıttan mı geliyor?" VE "bu satırı kim
okuyabilir?". Bir kartın grep listesi kapsamı belirlerse, listede olmayan aynı-sınıf ihlal
temizlikten sağ çıkar — kapsamı dosya bazında ver, dize listesi bazında değil.
