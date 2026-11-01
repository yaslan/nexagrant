---
name: fabrika-rls-bypass-role
description: Fabrika yerel DB'sinde RLS etkisiz — uygulama superuser+BYPASSRLS rolüyle bağlanıyor, 39 politika atlanıyor
metadata:
  type: project
  updatedAt: 2026-09-06
---

**Bulgu (2026-09-06, E11.1 sırasında ortaya çıktı):** `tests/rls.spec.ts > Tenant A cannot
see Tenant B workspaces` kırık ve kod hatası değil — **veritabanı rolü** kaynaklı.

```
current_user = fabrika, rolsuper = true, rolbypassrls = true
Workspace/ModuleState/Opportunity: relrowsecurity=true, relforcerowsecurity=true
public şemasında 39 policy
```

Postgres'te **superuser ve BYPASSRLS yetkili rol RLS'i tamamen atlar**; `FORCE ROW LEVEL
SECURITY` bile superuser'ı bağlamaz. Yani `prisma/rls.sql` ile kurulmuş 39 politika bu
bağlantı için ölü. Çok kiracılılık güvencesi şu an yalnız **kod seviyesinde**
(`withTenant`), DB seviyesinde değil.

Test veritabanı **boşken de** geçemez (tenant A + tenant B workspace = 2 ≠ 1) — yani
"veri kirliliği" değil, yapısal. Yeşil gördüğün bir RLS testi varsa politikanın çalıştığını
değil, tablonun boş olduğunu kanıtlıyor olabilir.

**Düzeltme:** uygulama `DATABASE_URL`'i NOSUPERUSER + NOBYPASSRLS bir rolle bağlansın;
migration için ayrı yetkili rol (`.env.example` zaten `DATABASE_URL_MIGRATE` /
`fabrika_migrate` tanımlıyor). Uygulanmadı — kapsam dışıydı ve aynı DB'ye yazan paralel
ajanları anında kırardı. Ayrı görev gerekiyor.

**Genel ders:** RLS doğrulaması yaparken önce `pg_roles.rolsuper` / `rolbypassrls` bak.
`pg_policies` sayısı politikaların *uygulandığını* kanıtlamaz.

İlgili: [[fabrika-workspace]], [[fabrika-beta-onboarding-cli]]
