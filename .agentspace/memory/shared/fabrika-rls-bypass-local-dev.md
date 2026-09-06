---
name: fabrika-rls-bypass-local-dev
description: Local fabrika DB role is SUPERUSER+BYPASSRLS so RLS is never enforced — prove isolation with a temporary NOBYPASSRLS probe role
metadata:
  type: project
  updatedAt: 2026-09-06
---

Yerel `postgres-vector` container'ındaki `fabrika` rolü **SUPERUSER + BYPASSRLS**
(`SELECT rolname,rolsuper,rolbypassrls FROM pg_roles WHERE rolname='fabrika'` → `t|t`).
Politikalar `pg_policies`'de görünür ama bu rol üzerinde **hiç uygulanmaz**.

Sonuç: "RLS politikası var" demek "RLS çalışıyor" demek DEĞİL. `pg_policies` sayımı
kanıt değildir. Takip görevi: TASK-MTQ0BIV9UXVRU (NOBYPASSRLS `fabrika_app` rolü).

Gerçek izolasyon kanıtı için geçici probe rolü aç, test et, sil:

```sql
CREATE ROLE rls_probe LOGIN PASSWORD 'probe' NOSUPERUSER NOBYPASSRLS;
GRANT USAGE ON SCHEMA public TO rls_probe;
GRANT SELECT, INSERT ON "Tablo" TO rls_probe;
-- probe olarak bağlan:
SET app.tenant_id = 'demo-tenant';  SELECT count(*) FROM "Tablo";  -- kendi satırları
SET app.tenant_id = 'other-tenant'; SELECT count(*) FROM "Tablo";  -- 0 olmalı
INSERT ... VALUES (...,'demo-tenant',...);  -- WITH CHECK ile reddedilmeli
-- temizlik:
REVOKE ALL ON "Tablo" FROM rls_probe; REVOKE USAGE ON SCHEMA public FROM rls_probe;
DROP ROLE rls_probe;
```

Hem okuma (USING) hem yazma (WITH CHECK) yönünü test et — biri geçip diğeri kalabilir.

İlgili: [[fabrika-withtenant-set-config]] · [[fabrika-local-dev-db]]
