---
name: fabrika-calendarconnection-rls-fixed-others-unchecked
description: CalendarConnection migration'indaki RLS sapmasi (AS RESTRICTIVE, FORCE yok, missing_ok yok, is_system baypasi) duzeltildi — ama "bes migration ayni deseni tekrarliyor" tespitindeki diger 4 dosya hala taranmadi
metadata:
  type: project
updatedAt: 2026-09-09
---

TASK-MTU6HY77S1WBH kapsaminda `prisma/migrations/add-calendar-connections/migration.sql`
duzeltildi (commit 374709f, dev) — [[fabrika-rls-audit-check-four-things-not-one]]
maddesinde tarif edilen dorduncu sapma artik `CalendarConnection` icin kapali:

- `AS RESTRICTIVE` kaldirildi (permissive taban yokken tek basina RESTRICTIVE tum
  satirlari kilitliyordu)
- `FORCE ROW LEVEL SECURITY` eklendi (yoksa tablo sahibi rol muaf kalirdi)
- `current_setting('app.tenant_id', true)` — missing_ok eklendi (yoksa baglam
  yoklugunda hata firlatirdi, NULL degil)
- `is_system` baypasi tamamen kaldirildi (nokta icermeyen isim zaten gecerli bir
  custom parametre degildi, calismiyordu; hicbir baska politikada karsiligi yok)

Politika artik `prisma/rls.sql:19-22`'deki kanonik `tenant_isolation` ifadesiyle
karakter karakter ayni.

**Hala acik:** [[fabrika-rls-audit-check-four-things-not-one]] "bes ayri migration
onu birebir tekrarliyor" diyordu — bu gorev yalnizca CalendarConnection'i duzeltti,
digerleri (repoda `grep -rn "CREATE POLICY" prisma/migrations/` ile bulunabilir)
denetlenmedi. Ayni AS RESTRICTIVE / FORCE-eksik / missing_ok-eksik kaliplari
tasiyor olabilirler.

**Yapisal kok neden hala kapatilmadi:** migration'lar `rls.sql`'in politika SQL'ini
elle kopyaliyor — tek dogruluk kaynagi yok. Onerilen kalici cozum (henuz
uygulanmadi, mimari karar gerektirir, ROADMAP'e "acik karar" olarak eklenmesi
onerildi): migration'lar tabloyu yaratir ama RLS politikasi koymaz, `pnpm db:rls`
(`prisma/rls.sql`) tek politika kaynagi kalir — yeni tenant-scoped tablo yalnizca
`rls.sql`'deki `ARRAY[...]` listesine eklenir, migration dosyasinda `CREATE POLICY`
hic yazilmaz. Bkz. `docs/agent-results/TASK-MTU6HY77S1WBH-blok-zincir-dse.md`.
