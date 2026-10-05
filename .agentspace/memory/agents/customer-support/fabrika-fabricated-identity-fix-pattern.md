---
name: fabrika-fabricated-identity-fix-pattern
description: Fabrika'da uydurma kişi adı kusurunun yerleşik düzeltme deseni — ApprovalActor/userId, displayUserName zinciri ve tablo açmak yerine eksik alanı adıyla bildirme
metadata:
  type: project
  updatedAt: 2026-09-07
---

Fabrika'da "kod sabit bir gerçek kişi adı yazıyor" kusuru tek seferlik değil, bir SINIF.
İki kart kapandı (TASK-MTR5BGKNELCO2 uygulama çerçevesi, TASK-MTR60M5ESB5PZ M10 çift onay
denetim kaydı), üçüncüsü açıldı (TASK-MTRHZIWHU2SKA: `document-exporter.ts` indirilen
belgenin imza satırı + M11 yazar atfı). Yerleşen desen:

1. **GÖSTERİM** yüzeyinde (kullanıcıya "sen busun" diyen çerçeve): `src/lib/user-display.ts`
   → `displayUserName(name, email, t('unnamedUser'))`. Sıra: gerçek ad → e-posta yerel
   kısmı → çevrilmiş "isimsiz" etiketi. YENİDEN YAZMA, çağır.
2. **KAYIT** yüzeyinde (denetim izi, imza, atıf): gösterim yetmez. `{ userId, displayName }`
   çifti zorunlu; varsayılan YOK; eksikse `MissingApprovalActorError` gibi bir hatayla
   akış İLERLEMEZ (`src/lib/tenant.ts`'in kiracıya uyguladığı "yoksa reddet" kuralının aynısı).
   Aktör YALNIZ oturumdan okunur, istek gövdesinden ASLA — parametreyi tamamen SİL ki
   istemci imzalayanı adlandıramasın (`fn.length` ile test edilebilir).
3. Şemada karşılık yoksa **tablo AÇMA** — eksik alanı/tabloyu ADIYLA raporla, karar patronun.
   M10'da eksik olan alan değil tablonun tamamıydı: çift onay durumu hiçbir yere yazılmıyor.
   En yakın mevcut tablo `AuditEvent` (`actorId` alanı hazır).
4. Kanıt: DB'yi 67 tablonun her text/json sütununda ILIKE ile tara, SAY, ama SİLME.
5. `grep -rn "<ad>" src` çoğu zaman BOŞ ÇIKMAZ ve çıkmamalı: `auth.ts` DEMO_PROFILES,
   giriş ekranı demo hesap kartları, blog yazar örneği MEŞRU içerik. Kapsamı daralt
   (`grep <ad> <kendi dosyaların>`) ve kalanları tek tek gerekçelendir.

Bkz. [[fabrika-unreachable-server-action-probe]].
