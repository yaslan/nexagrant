---
name: fabrika-rls-migration-scan-widened-clean-plus-grep-gotcha
description: TASK-MTUGK2OUVAFDN sonucu — CalendarConnection'daki 4 RLS sapmasi diger 7 migration dosyasinda TEKRARLANMADI (izole hataydi); ayrica cift-bosluklu FORCE deyimi tek-bosluk grep'i atlatir
metadata:
  type: project
updatedAt: 2026-09-09
---

`CalendarConnection` migration'ında bulunan dört RLS sapması (`AS RESTRICTIVE`,
`FORCE` eksik, `current_setting`'in `missing_ok` argümanı eksik, sahte `is_system`
baypası — bkz. [[fabrika-rls-audit-check-four-things-not-one]] madde 4) diğer yedi
migration dosyasında (`add-feedback.sql`, `add-m6-evaluator-lens.sql`,
`add-lifetime-licence.sql`, `auditevent-tenant-or-shared.sql` + `.down.sql`,
`add-plan-versioning/migration.sql`, `add-m10-dual-approval-persistence/migration.sql`)
**taranmış ve hiçbiri bulunmamıştır** — CalendarConnection hatası izoleydi, sistemik
değil. Rapor: `docs/agent-results/TASK-MTUGK2OUVAFDN-blok-zincir-denet-i.md`.

İki aile bilinçli istisna (sapma değil): `lifetime_licence_count()` SECURITY DEFINER
fonksiyonu (`rls.sql:56-71` ile aynı gövde) ve `tenant_or_shared` deseni (nullable
`tenantId` — `AuditEvent`, `Document`, `Chunk`, `ConceptTemplate` ailesi, `rls.sql:36-47`).
`add-plan-versioning`'deki `Plan`/`PlanVersion`/`PlanFeature` politikaları ise
`tenant_isolation` ailesinden değil, platform-tablo ailesinden (`rls.sql:78-93`) —
orada FORCE zaten yok ve bu bir sapma değil, çünkü platform tablolarına yazma tablo
sahibi rolüyle yapılıyor, FORCE yalnız sahibi bağlar.

**Grep gotcha:** `grep "FORCE ROW LEVEL SECURITY"` (tek boşluk) iki dosyada
(`add-feedback.sql:73`, `add-lifetime-licence.sql:53`) `FORCE  ROW LEVEL SECURITY`
(çift boşluk) yüzünden yanlış-negatif verdi — dosya `Read` ile tam okunmasaydı "FORCE
yok" diye yanlış rapor edilirdi. RLS metin taramasında tek bir grep deseni yeterli
KANIT değildir; her dosyayı `Read`'le de aç, grep'i doğrulama için kullan, tek kaynak
olarak değil.
