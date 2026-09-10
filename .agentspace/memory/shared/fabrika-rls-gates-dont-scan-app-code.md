---
name: fabrika-rls-gates-dont-scan-app-code
description: pnpm rls:check ve rls:verify hiçbiri src/ altındaki uygulama kodunu okumaz — ikisi de şema/veritabanı seviyesinde çalışır, çağrı-yeri (withTenant dışı prisma.* erişimi) seviyesinde değil
metadata:
  type: reference
  updatedAt: 2026-09-10
---

`pnpm gate`'teki iki RLS kapısı, "her tenant-scoped tablo için politika var mı /
gerçekten uygulanıyor mu" sorusunu cevaplar — "bu tabloya `withTenant` DIŞINDA
erişen bir kod satırı var mı" sorusunu ASLA sormaz. İkisini de okuyup
doğruladım (TASK-MTSZ0AL4QP2CT):

- **`scripts/check-rls.ts`** (`pnpm rls:check`): salt dosya karşılaştırması —
  `prisma/rls.sql`'in her tenant-scoped model için bir policy satırı içerip
  içermediğini, migration'ların kendi tablolarını kendi dosyasında koruyup
  korumadığını kontrol eder. `src/` altına hiç bakmaz.
- **`scripts/check-rls-live.ts`** (`pnpm rls:verify`): gerçek veritabanına
  RLS'e tabi bir rolle bağlanıp negatif/pozitif okuma-yazma sondası yapar —
  ama bu da tablo/policy seviyesinde bir davranış ölçümü. Bir kod satırı
  doğru `tenantId`'yle (ama `withTenant` sarmalayıcısı OLMADAN) çalıştığı
  sürece bu sondayı hiç tetiklemez.
- **`.claude/commands/review-rls`**: adım 3'te "`src/` içinde `prisma.`
  doğrudan çağrılarını bul, `withTenant()` dışındakileri raporla" yazıyor
  ama bu bir CI kapısı değil — elle çağrılan bir slash-komut, `pnpm gate`'e
  bağlı değil, deterministik değil.

**Sonuç:** `session?.tenantId` + ternary-fallback (`tenantId ? {tenantId} :
{}`) gibi bir desen, ya da yeni bir sarmalayıcısız `prisma.<tenantModel>.`
çağrısı, bugün hiçbir otomatik kapıdan geçmeden main'e girebilir. Bu tam
olarak [[fabrika-main-db-connection-bypasses-rls]]'in işaret ettiği boşluğun
kod-tarafı ikizi: DB bağlantısı BYPASSRLS olduğu için bugün istismar
edilemiyor ama ana bağlantı `fabrika_app`'e geçtiğinde (`prisma/rls-app-role.sql`)
hem bu tarz kod hem de mevcut ~79 sarmalayıcısız çağrı aynı anda ya sessiz-boş
dönmeye ya da policy ihlaliyle patlamaya başlar.

Öneri (uygulanmadı — `TASK-MTSZ0AL4QP2CT-blockzincir-pm.md` Dilim 5): `check-rls.ts`'in
zaten kullandığı "bildirilen kümeyi dosyayla karşılaştır" desenini ikinci bir
veri kümesine (onaylı sarmalayıcısız-erişim allowlist'i) uygulayan yeni bir
script + ternary-fallback deseni için regex kilidi.

[[fabrika-local-app-role-bypasses-rls]] · [[fabrika-tenant-isolation-real-defense-is-app-level-where]]
