---
name: fabrika-three-migrations-state-no-rls-policy
description: KAPANDI (2026-09-10) - Invoice/TenantBillingIdentity/MeetingBrief migration'larina politika eklendi, karar A gelenegi, kapi artik CHECK 4b ile migration'lari da okuyor (pnpm rls:check)
metadata:
  type: project
  updatedAt: 2026-09-10
---

**Durum: KAPANDI** (TASK-MTVDSSJTZCY4T, commit `f29b209`). Asagisi hem karari hem kapiyi
tarif ediyor; bulgu artik acik degil, **kural** haline geldi.

**Karar — A gelenegi dogrudur:** kiraci tablosu kuran migration, politikayi **ayni dosyada**
kurar (`ENABLE` + `FORCE` + `DROP POLICY IF EXISTS` + `CREATE POLICY`), ifade
`prisma/rls.sql:19-21` ile **birebir**. `prisma/rls.sql` tek dogruluk kaynagi olmayi surduruyor
ve `pnpm db:rls` her koşuşta yeniden kuruyor; migration'daki kopya yalniz aradaki pencereyi
kapatiyor. Kural tek paragraf halinde `docs/DATA_MODEL.md` §16'da, atif
`docs/RELEASE_CHECKLIST.md` §1'de.

**Gerekce olculdu** (temiz DB, uc migration uygulandi, `db:rls` KOSULMADI): `Invoice`,
`TenantBillingIdentity`, `MeetingBrief` → `relrowsecurity=f`, politika 0; `app.tenant_id='tenant-a'`
kurulu NOBYPASSRLS bir rol `MeetingBrief`'te **iki kiracinin** satirini da okudu (2 satir → mb-a,mb-b).
Duzeltmeden sonra ayni sonda 1 satir dondu. Sonda korunuyor:
`docs/agent-results/TASK-MTVDSSJTZCY4T-evidence/probe-window.sh` (bu makinede `psql` ikilisi yok;
script `docker exec postgres-vector psql` kullaniyor).

**Kapi — CHECK 4b, `pnpm rls:check` icinde** (`scripts/rls-migrations.ts`, cagiran
`scripts/check-rls.ts`; degismezleri `tests/rls-coverage.test.ts`). Teste degil script'e bagli,
cunku kirmizi/yesil kapi sorusu `rls:check`'in isi; test dosyasi siniflandirmanin durustlugunu
koruyor. Kontrol **tablo basina** (dosya basina degil), `CREATE POLICY` yaninda `ENABLE` ve
`FORCE`'u da sayiyor, kanonik ifadeyi `prisma/rls.sql`'den **okuyor** (kopyalamiyor), iki dosya
bicimini de tariyor (`add-x.sql` ve `add-x/migration.sql`) ve yorumlari ayikliyor. Tabloyu
`schema.prisma`'dan degil **migration'in kendi `CREATE TABLE` govdesindeki `tenantId`
kolonundan** taniyor — boylece model henuz yazilmadan da yakalar. **Muafiyet listesi YOK**:
listeye yazilan tablo tam da bu pencereyi kalici hale getirir.

**Sayim tashihi:** bu notun eski basligi "5 tablo A geleneginde" diyordu, altindaki liste ise
8 tablo sayiyordu. 2026-09-10 olcumu: **9 tablo / 6 dosya** A geleneginde (Consent eklendi),
3 tablo B'deydi. Yani A azinlik degil, **baskin** gelenekti — karar mevcut uygulamayi resmilestirdi.

**Nasil uygulanir (yeni tablo):** `docs/DATA_MODEL.md` §16'yi izle; unutursan `pnpm rls:check`
tablo adini ve satiri soyleyerek kirmizi yanar ve reçeteyi basar. Kapinin gercekten isirdigini
gormek istersen politikasiz sahte bir migration birak — kalici hali
`tests/rls-coverage.test.ts` icindeki "mutation probe" testi.

Ilgili: [[fabrika-force-rls-double-space-grep-trap]] · [[fabrika-rls-check-is-declaration-not-behaviour]] ·
[[fabrika-rls-gates-share-one-suppression-list]] · [[fabrika-migrations-are-not-prisma-migrate]] ·
[[fabrika-folder-migrations-cannot-replay-from-empty]] ·
[[fabrika-mutation-probe-must-vary-the-input-shape]]
