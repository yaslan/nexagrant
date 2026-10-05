---
name: fabrika-a-notnull-column-forces-the-logging-hole-open
description: Fabrika'da bir uyum/kayıt deliğini kapatırken hedef sütunun NOT NULL olması "o çağrıyı hiç kaydetme"ye zorlar — kapsamı BEYAN EDEN bir sabit yaz, dolgu değil, ve nullable şemayı ayrı kart olarak öner
metadata:
  type: project
  updatedAt: 2026-09-08
---

`AiUsageLog.tenantId` **NOT NULL**. RAG yolunun canlı rotası (`/api/admin/documents/upload`)
ise `tenantId: null` ile çağırıyor — paylaşılan kamusal korpus. Yani kaydı eklemek istediğinde
şema seni iki kötü seçeneğe sıkıştırıyor: (a) kiracısız çağrıyı hiç kaydetme — kapatmaya
çalıştığın deliğin ta kendisi; (b) bir değer uydur.

Çıkış yolu üçüncü seçenek: **kapsamı BEYAN EDEN** bir sabit (`PLATFORM_SCOPE_TENANT_ID =
'__platform__'`). Dolgu değil çünkü *doğruyu* söylüyor ("bu çağrının kiracısı yok"), oysa dolgu
bilinmeyenin yerine geçer — [[fabrika-g0-evidence-placeholder-laundering]] ile ayrım tam burada.
Güvenli olmasının somut nedenleri: gerçek id'ler cuid ya da `demo-tenant` gibi slug, alt-çizgi
sarmalı kullanılmıyor → çakışma yok; hiçbir `Tenant` satırıyla eşleşmediği için RLS altında her
kiracıya görünmez; `CreditLedger.tenantId` gerçek FK olduğu için karşılığında yanlışlıkla kredi
satırı yazılamaz. Üçünü de kodda gerekçe olarak YAZ, yoksa bir sonraki okuyan bunu dolgu sanır.

Şema düzeltmesini (`tenantId String?`) ayrı kart olarak öner — özellikle şema dosyası başka bir
ajanın açık çalışma ağacındaysa. Bkz. [[fabrika-team-handover-cekirdek]].
