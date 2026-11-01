---
name: fabrika-swallowed-catch-returns-fake-success
description: Fabrika'da `catch { console.warn(...) }` + sabit `return { success: true }` deseni yazma başarısızlığını yeşil tike çeviriyor — bir catch bloğu, dönüş değerini DEĞİŞTİRMİYORSA hatayı raporlamıyor, gizliyor demektir
metadata:
  type: feedback
  updatedAt: 2026-09-07
---

Bu depoda tekrar eden bir sessiz-başarısızlık deseni var:

```ts
try {
  await prisma.tenant.update({ where: { id }, data: { domain } });   // kolon YOK → her zaman fırlatır
} catch (e) {
  console.warn(`[configureEnterpriseSso] DB update bypassed: ${errorMessage(e)}`);
}
return { success: true, ssoConfig: { ...} };    // <-- catch'e RAĞMEN her zaman true
```

Sonuç: admin ekranı yeşil "kaydedildi" tiki gösteriyor, veritabanına hiçbir şey yazılmamış.
Kullanıcı için bu, hiç çalışmayan bir özellikten **daha kötü**: yanlış bir güvence veriyor.

**Kural:** Bir `catch` bloğunun dönüş değeri üzerinde etkisi yoksa, o catch hata *işlemiyor*,
hatayı *yutuyordur*. Üç meşru davranıştan birini seç ve hangisini seçtiğini yorumda yaz:
1. **Raporla:** `return { success: false, reason: '...' }` + `recordAlert(...)` — çağıran karar verir.
2. **Yeniden fırlat:** iş kısmen yapılmışsa sahte özet döndürme (`totalSearches: 0` = yalan).
3. **Gerçekten önemsiz:** neden önemsiz olduğunu yorumda gerekçelendir (ör. `revalidatePath`).

`console.warn` bunlardan **hiçbiri değildir** — kimse sunucu loglarını okumuyor. CLAUDE.md kural 6
zaten `SystemAlert` istiyor: `recordAlert({ level, source, message, meta })`
(`src/lib/observability/system-alert.ts`). O modül asla fırlatmaz, meta'yı sanitize eder.

**Dikkat — `SystemAlert`'in RLS politikası YOK** (prisma/rls.sql'de iki listede de değil).
Alert meta'sına `tenantId`, `userId`, e-posta, rapor başlığı **koyma**; kiracıya-özel satırı
**id ile** referansla, yetkili ekran join'lesin. `sanitizeMeta` anahtar adına göre eliyor,
düşünmenin yerine geçmiyor.

Ayrıca: alert'i çağıranın transaction'ı (`tx`) üzerinden yazma. Transaction geri alınırsa
başarısızlık kaydı da silinir. `recordAlert` bilerek tekil `prisma`'yı kullanır.

Ölçülmüş örnekler (TASK-MTRKWBLXUYSHS, 2026-09-07): `lib/sso.ts` (sahte `success: true`),
`lib/calendar/sync.ts` (catch'in İÇİNDEKİ alert yazımı da fırlatıyordu, yani hatayı sınırlaması
gereken blok ikinci bir hata üretiyordu). Kök neden ikisinde de hayalet kolondu →
[[fabrika-prove-a-prisma-query-shape-without-a-db]].

İlgili: [[fabrika-fabrication-audit-must-cover-defaults]] · [[fabrika-db-mock-invents-the-model]]
