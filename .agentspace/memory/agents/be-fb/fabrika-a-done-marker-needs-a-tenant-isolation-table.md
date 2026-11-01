---
name: fabrika-a-done-marker-needs-a-tenant-isolation-table
description: Fabrika'da "bu iş yapıldı" işaretçisi ASLA AuditEvent'te yaşamaz — nullable tenantId'si onu tenant_or_shared sınıfına koyuyor, yani kiracı bağlamı dışında ne yazılabilir ne okunabilir; işaretçi tenant_isolation'lı kendi tablosunda ve parayı yazan transaction'ın içinde olmalı
metadata:
  type: project
  updatedAt: 2026-09-10
---

`AuditEvent.tenantId` `String?` — NULL "bu KVKK olayı hiçbir kiracıya ait değil"
demek. Bu yüzden tablo `tenant_isolation` değil **`tenant_or_shared`** politikası
taşıyor (`prisma/rls.sql`, TASK-MTU6HUB8FUHMG C-2) ve `scripts/rls-models.ts`'in
`NULLABLE_TENANT` kümesinde. Sonuç: kiracısı **OLAN** bir `AuditEvent` satırı,
ancak `app.tenant_id` o kiracıya ayarlıyken yazılabilir VE okunabilir.

Bugün uygulama `fabrika` (BYPASSRLS) rolüyle bağlandığı için bu hiç görünmüyor.
`fabrika_app` altında ölçüldü (TASK-MTVSBEO7VX6Y4): Stripe webhook'u parayı yazdı
(`Subscription=1 CreditLedger=1`), idempotency anahtarını yazamadı
(`AuditEvent=0`), guard okuması kör (`no tenant set: 0`) — ve iptal edilmiş bir
abonelik bayat bir `active` olayının tekrar gönderimiyle ACTIVE'e döndü, aylık
kredi tahsisi ikinci kez yazıldı.

**Why:** Denetim izi ile kilit aynı satır olmamalı. Denetim satırı bir gün başka
bir sebeple (KVKK süpürmesi) silinirse kilit de gider; ve `AuditEvent`'in RLS
sınıfı kilidin gerektirdiği yerde yaşamasına izin vermiyor.

**How to apply:** Bir "bu olay/iş yapıldı" işaretçisi gerekiyorsa:
1. Kendi tablosunu aç, `tenantId` **NOT NULL** (→ düz `tenant_isolation`,
   `withTenant`'ın içinde yaşar).
2. İşaretçi sütununa **UNIQUE** koy. Oku-sonra-yaz guard'ı tekrar gönderimi çözer,
   aynı olayın iki **eşzamanlı** teslimatını çözmez: ikisi de "satır yok" görür
   (READ COMMITTED), ikisi de yazar. Ölçüldü: UNIQUE indeks düşürüldüğünde 8
   eşzamanlı teslimat 8 kredi tahsisi yazıyor (777 → 6216); indeks yerindeyken 1.
3. İşaretçiyi parayı yazan transaction'ın **ilk** ifadesi yap; çakışma (P2002)
   transaction'ı geri alsın ve `skipped` dönsün. Tek transaction içinde ifade
   **sırası** atomikliğe hiçbir şey katmaz — sıranın değeri ancak veritabanının
   reddettiği bir kısıt varsa doğar. "Anahtarı paradan önce yaz" tek başına sahte
   bir güvence.
4. Ağ çağrısı yapan ya da `recordAlert` üzerinden çıplak singleton'a giden hiçbir
   işi o transaction'a sokma — 10'luk havuzda ikinci bağlantı kilitlenmedir.

**Aynı kusur hâlâ ağaçta:** `src/lib/iyzico.ts:591` düz `prisma.$transaction`
açıyor (`withTenant` değil, hiçbir yerde `set_config` yok) ve guard'ı yine
`AuditEvent` (`data->>'iyzicoEventId'`). Kart: TASK-MTVU5DI4C96DB. `fabrika_app`
geçişinin ön koşulu TEK kart değil.

İlgili: [[fabrika-a-wrapped-slice-is-not-rls-ready]] ·
[[fabrika-run-a-handler-under-the-rls-role]] ·
[[fabrika-deferred-to-another-card-is-not-fixed]]
