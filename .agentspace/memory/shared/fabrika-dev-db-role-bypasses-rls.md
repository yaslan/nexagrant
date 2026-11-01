---
name: fabrika-dev-db-role-bypasses-rls
description: Fabrika'nın yerel dev DB rolü superuser+BYPASSRLS — RLS'e bağlı hiçbir kusur yerelde veya gate'te yakalanamaz; NOBYPASSRLS geçici rolle test et
metadata:
  type: project
updatedAt: 2026-09-08
---

Fabrika'nın yerel Postgres rolü (`fabrika`) `rolsuper=true, rolbypassrls=true` —
tam olarak `prisma/rls.sql`'in 2. satırının yasakladığı yapılandırma
("App role must NOT have BYPASSRLS").

**Sonuç:** RLS'in `WITH CHECK`'ine takılan hiçbir yazma yolu yerelde, testlerde
ya da `pnpm gate`'te kırmızı vermez. 1370 test yeşil olabilir ve kod üretimde
ilk yazmada patlayabilir.

`pnpm rls:verify` bunu KURTARMIYOR: `scripts/check-rls-live.ts` yalnız katalog
metaverisine bakıyor (politika var mı, RLS açık mı); içinde
`bypass|rolsuper|current_user|set_config` hiç geçmiyor. "Canlı ölçüm" adına
rağmen gerçek bir yazma/okuma denemesi yapmıyor, dolayısıyla RLS'in fiilen
kapalı olduğu bir DB'de "✅ izolasyon uygulanıyor" diyor.

**Nasıl doğru test edilir** (`TASK-MTSWVADF7RQ1B-evidence/rls-proof.txt`):
geçici `CREATE ROLE x NOLOGIN NOBYPASSRLS NOSUPERUSER` + `GRANT USAGE ON SCHEMA
public` (bunu unutursan Postgres `42P01 relation does not exist` der, yanıltıcı),
`SET LOCAL ROLE x`, INSERT'ü dene, `ROLLBACK`, rolü düşür. Pozitif kontrol
koymadan rapor etme — probe'un kendisi bozuk olabilir.

İlgili: [[fabrika-rls-write-path-needs-app-tenant-id]]
