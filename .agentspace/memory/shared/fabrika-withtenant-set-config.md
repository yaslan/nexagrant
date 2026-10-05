---
name: fabrika-withtenant-set-config
description: withTenant() must use set_config() not SET LOCAL — Postgres SET rejects bind parameters, so $executeRaw template literals always fail with 42601
metadata:
  type: project
  updatedAt: 2026-09-06
---

`src/lib/db.ts`'deki `withTenant()` RLS bağlamını kuran tek yerdir (CLAUDE.md §1 tüm
kiracıya-özel sorguların buradan geçmesini şart koşar). 2026-09-06'da bozuk bulundu:

```ts
await tx.$executeRaw`SET LOCAL app.tenant_id = ${tenantId}`;  // ❌ her çağrıda patlar
```

Postgres'te `SET` **bind parametresi kabul etmez**; `$executeRaw` ise şablon değişkenini
daima parametreleştirir → `Raw query failed. Code: 42601. Message: syntax error at or near "$1"`.

Doğrusu — `set_config(..., is_local => true)` parametreleştirilebilir ve `SET LOCAL` ile
aynı işlem-yerel semantiğe sahiptir, tenant id bağlı değer olarak kalır (enjeksiyona kapalı):

```ts
await tx.$executeRaw`SELECT set_config('app.tenant_id', ${tenantId}, true)`;
```

Uzun süre fark edilmedi çünkü `withTenant()`'ın hiç çağıranı yoktu. Yeni bir RLS'li
sorgu yazarken bu fonksiyonun gerçekten koştuğunu **çalışma zamanında** doğrula —
tip kontrolü bu hatayı yakalamaz.

İlgili: [[fabrika-rls-bypass-local-dev]] · [[fabrika-prisma7-driver-adapter]]
