---
name: fabrika-rls-blocks-writes-loudly-but-empties-reads-silently
description: RLS altında sarmalayıcısız YAZMA 42501 ile bağırır ama sarmalayıcısız OKUMA sessizce 0 satır döner — kusur, sebebinden uzakta makul bir iş hatası kılığında yüzeye çıkar
metadata:
  type: project
  updatedAt: 2026-09-08
---

2026-09-08, TASK-MTSYH8LDGV5YU (F-1) düzeltilirken `fabrika_app` (NOBYPASSRLS) rolüyle ölçüldü.

`withTenant` dışından yapılan erişimin **iki farklı** davranışı var, ve tehlikeli olan ikincisi:

| | Politika dalı | Sonuç | Görünürlük |
|---|---|---|---|
| YAZMA | `WITH CHECK` | `42501 new row violates row-level security policy` | **gürültülü** — fırlatır, loglanır |
| OKUMA | `USING` | her satır için `NULL` → tablo **boş** okunur | **sessiz** — hata yok, log yok |

Okuma dalı hata fırlatmadığı için kusur, kaynağından uzakta ve **makul bir iş hatası kılığında**
yüzeye çıkar. Ölçülen örnek: `getCreditBalance` sarmalayıcı dışındaydı, 500 kredilik bir kiracı için
`0` döndü, ve `generateCompletion`'ın **ilk** adımı olduğu için kullanıcı şunu gördü:

    "Insufficient AI credits. Please purchase more credits or upgrade your plan."

Gerçek sebep RLS'ti; mesaj faturalandırma diyordu. Sağlayıcıya hiç ulaşılmadı, dolayısıyla ortada
incelenecek bir `AiUsageLog` hatası da yoktu. Denetim turu kusurun yalnız **yazma** yarısını
(`embedText`) görmüştü — çünkü yalnız o yarısı bağırıyor.

İki kalıcı sonuç:

1. **Bir RLS bulgusunu "şu satır patlıyor" diye sınırlama.** Aynı dosyadaki sarmalayıcısız
   OKUMALARI da say: bunlar patlamaz, yalan söyler. Bir bulgu kartı yalnız fırlatan satırı
   adlandırıyorsa envanter eksiktir — kodu kendin tara.
2. **"Kredi/kota/sonuç yok" diyen bir hata mesajı, RLS kapsamı şüphesi altında delil değildir.**
   Boş bir agregasyon "veri yok" ile "veriyi göremiyorum"u ayırt etmez. Sarmalayıcı içinden
   tekrar ölç.

Ölçüm rolü olmadan bunların hiçbiri görünmez:
[[fabrika-local-green-is-worthless-under-a-bypassrls-role]] (yazma yarısı ve neden dev rolüyle
kanıt alınamaz) · [[fabrika-a-count-is-not-coverage]] (sayının kapsamı gizlemesi, aynı refleks).
