---
name: fabrika-rls-green-on-a-bypassrls-connection
description: Fabrika'da RLS politikaları yeşil olsa da ana DATABASE_URL BYPASSRLS bir rolle bağlanıyor — RLS kartlarını kapatırken hangi bağlantıda ölçüldüğünü sor
metadata:
  type: project
  updatedAt: 2026-09-09
---

Fabrika'nın uygulama bağlantısı (`.env` DATABASE_URL) `fabrika` rolünü kullanıyor ve bu rol
SUPERUSER + BYPASSRLS (`src/lib/db.ts:58-62`, `prisma/rls-app-role.sql:1-9`,
`docs/SECURITY_COMPLIANCE.md:51-52, 83-84`). RLS'in gerçekten zorlandığı tek yer
`DATABASE_URL_RLS_TEST` (`fabrika_app`, NOBYPASSRLS) ile koşan `tests/rls.spec.ts`.

Sonucu şu: bir RLS kartı "politika eklendi, `pnpm rls:verify` yeşil" diye kapanabilir ve bu
**doğru** olabilir — ama ürünün kendi bağlantısında o politika hâlâ hiçbir şeyi engellemiyordur.
`withTenant` bugün pratikte yalnız geliştiricinin `where` cümlesine `tenantId` yazmasını
disipline ediyor, Postgres tarafında bir savunma katmanı üretmiyor.

Lead olarak RLS kartı kapatırken sor: **hangi bağlantıda ölçüldü?** `rls:verify` yeşilse bu
`fabrika_app`'te ölçülmüştür ve politikanın DOĞRU olduğunu kanıtlar; üretimde ETKİN olduğunu
kanıtlamaz. İkisi ayrı iddia, ayrı ayrı yazılmalı.

Bu, admin konsolundaki "RLS Policy %100 Enforced" rozetinin neden kanıtsız bir iddia olduğunun
da nedeni (TASK-MTUGKEF9KENK). Ana bağlantıyı `fabrika_app`'e çevirmek hâlâ açık bir iş.

İlgili: [[fabrika-a-checked-box-that-confesses]] · [[fabrika-a-green-gate-may-predate-the-commit-it-closes]]
