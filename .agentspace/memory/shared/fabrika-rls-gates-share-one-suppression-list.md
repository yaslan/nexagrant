---
name: fabrika-rls-gates-share-one-suppression-list
description: Fabrika'nin iki RLS kapisi da scripts/rls-models.ts'teki SYSTEM_WIDE kumesinden besleniyor - oraya yazilan tablo her iki kapida da kalici olarak gorunmez olur
metadata:
  type: project
updatedAt: 2026-09-09
---

`pnpm rls:check` (statik) ve `pnpm rls:verify` (canli) ayri betikler ama **ayni**
`tenantScopedModels()` fonksiyonundan besleniyor. O fonksiyon `SYSTEM_WIDE` kumesindeki
her adi eliyor. Sonuc: bir tabloyu oraya yazmak, iki kapiyi birden o tablo icin kalici
olarak kor eder - kapi asla kirmizi yanmaz.

TASK-MTU64JWHRNDL denetiminde bulundu: `ClaimEvidenceLink` ve `EvidenceReminder` bu
kumede. Ikisi de `Claim`/`Evidence` (kiraciya ozel) tablolarina FK ile bagli, yani
kiraci verisi tasiyorlar; ama kendi `tenantId` sutunlari olmadigi icin "sistem tablosu"
diye siniflanmislar ve `rls.sql`'de hic gecmiyorlar - RLS bile acik degil.
`EvidenceReminder.recipientEmails` bir e-posta dizisi (kisisel veri).

Bugun sorgu yolu yok, yani veri henuz yok; ilk yazma yolu eklendigi anda risk sessizce
acilir. **CLAUDE.md kural 1 "tenantId tasiyan tablo" diye uygulaniyor; FK ile kiraciya
baglanan tablolar kuralin disindan geciyor.**

**DUZELTILDI — TASK-MTU6HUB8FUHMG B-1 (2026-09-09, commit af75623).** Iki tabloya da
`tenantId String` eklendi (`prisma/migrations/add-evidence-link-tenant-id.sql`; olculdu:
her ikisi de 0 satir, backfill gerekmedi), `tenant_isolation` dizisine yazildi, `SYSTEM_WIDE`'dan
cikarildi. `pnpm rls:check` 43 -> 44 model. `tests/rls-coverage.test.ts` artik **kumenin
kendisini** dogruluyor: `SYSTEM_WIDE` uyesi hicbir modelde `tenantId` olamaz — yani bu hata
sinifi sessizce geri gelemez. `AuditEvent` de ayni gorevde (C-2) `tenant_or_shared`'a tasindi.
**Hala acik:** canli kapinin `tenant_or_shared` / `platform_*` / FORCE / RESTRICTIVE
korlugu — asagidaki paragraf gecerliligini koruyor.

Canli kapinin ek kapsam bosluklari (ayni denetim): yalniz `policyname = 'tenant_isolation'`
sorguluyor - `tenant_or_shared` (Document/Chunk/ConceptTemplate) ve `platform_*`
(Plan/PlanVersion/PlanFeature) hic olculmuyor; `relforcerowsecurity` ve
`pg_policies.permissive` hic sorulmuyor, yani ENABLE var/FORCE yok ya da RESTRICTIVE
bir politika kapidan yesil gecer.

Ilgili: [[fabrika-rls-audit-check-four-things-not-one]] · [[fabrika-moving-a-table-between-rls-policy-classes]]
