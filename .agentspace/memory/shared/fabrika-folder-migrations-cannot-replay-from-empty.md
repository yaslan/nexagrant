---
name: fabrika-folder-migrations-cannot-replay-from-empty
description: Klasorlu migration gecmisi bos bir DB'ye uygulanamiyor (add-m10 FollowupDoc'a atif ediyor, P3006/P3018) ve Prisma 7.10 uygulanmis bir migration'in checksum'ini status/deploy'da DOGRULAMIYOR
metadata:
  type: project
  updatedAt: 2026-09-10
---

Iki olcum, ikisi de 2026-09-10, izole bir DB'de (`docker exec postgres-vector psql`, bu makinede
`psql` ikilisi yok; `docker` CLI **PATH'te var** — eski notlarin aksine).

**1) Klasorlu migration gecmisi bos bir veritabanina uygulanamiyor.** Temiz DB +
`prisma migrate deploy`, agac **dokunulmamis**:

```
Applying migration `add-calendar-connections`
Applying migration `add-m10-dual-approval-persistence`
Error: P3018 ... Database error code: 42P01
ERROR: relation "FollowupDoc" does not exist
```

`add-m10` `FollowupDoc`'a atifta bulunuyor ama o tabloyu hicbir migration kurmuyor (sema
`db push` ile gelmis). Sonuc: `pnpm db:migrate` (= `prisma migrate dev`) bu depoda **hic
kosamaz** — shadow DB'de ayni hata P3006 olarak doner. Yani "migration'i duzenledim, `migrate
dev` kirilir mi?" sorusunun cevabi bugun "zaten kirik". Temiz klon senaryosu icin
[[fabrika-clean-clone-silently-skips-rls-tests]] ile birlikte okunmali.

**2) Prisma 7.10 checksum'i status/deploy'da dogrulamiyor.** `_prisma_migrations.checksum`
gercek bir sha256 (olculdu: `add-m9-meeting-schedule` icin defterdeki deger dosyanin
`shasum -a 256` cikitisiyla **birebir** ayni). Ama uygulanmis dosyaya satir ekledikten sonra
`prisma migrate status` ve `prisma migrate deploy` **hicbir uyari vermedi** — "modified after
applied" mesaji cikmadi. Yani uygulanmis bir migration'a idempotent bir blok eklemek bu surumde
teknik olarak sessiz gecer; yine de dogrusu, degisikligi dosyada **soylemek** (TASK-MTVDSSJTZCY4T
`add-m9-meeting-schedule/migration.sql` sonundaki nota bak) ve gerekirse
`prisma migrate resolve` ile deftere yeniden kaydettirmek.

**Nasil uygulanir:** uygulanmis bir migration'i degistirmen gerekiyorsa (ornek: eksik RLS
politikasini eklemek) once bu iki olcumu kendi HEAD'inde tekrarla, sonra blogu **idempotent**
yaz (`IF NOT EXISTS`, `DROP POLICY IF EXISTS`) ve dosyada checksum'in eskidigini yaz. Yeni bir
klasor migration'i acmak da bir secenek ama pencereyi kapatmaz: tablo bir migration'da kurulup
politika bir sonrakinde geliyorsa ikisi arasinda tablo korumasizdir.

Ilgili: [[fabrika-migrations-are-not-prisma-migrate]] · [[fabrika-three-migrations-state-no-rls-policy]]
