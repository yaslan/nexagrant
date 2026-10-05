---
name: fabrika-undefined-tenantid-drops-the-where-clause
description: Prisma bir where alanı undefined ise o koşulu HİÇ yazmaz — session?.tenantId doğrudan where'e girerse kiracı filtresi sessizce düşer; typecheck bunu göremez, hâlâ taşıyan 3 sayfa listeli
metadata:
  type: project
  updatedAt: 2026-09-07
---

`session?.tenantId` tipi `string | null | undefined`. Prisma bir `where` alanının değeri
`undefined` ise **o koşulu sorguya hiç yazmaz** (yok saymaz — "eşleşme yok" da demez).
Sonuç: `where: { id, tenantId: undefined }` = `where: { id }` → tahmin edilebilir bir cuid ile
**kiracı filtresi olmayan** bir okuma. Aynı şey `where: tenantId ? { tenantId } : {}` için de
geçerli ve daha ağırdır: boş nesne "daha dar sorgu" değil, **hiç filtre yok**tur.

`src/types/prisma-override.d.ts` üretilmiş istemciyi gölgelediği için `tsc` bu uyuşmazlığı
görmez — bkz. [[fabrika-typecheck-is-blind-to-db-calls]] ve [[fabrika-prisma-client-type-override]].
Yani **"typecheck yeşil" bu hata sınıfı için hiçbir şey kanıtlamaz.**

**Why:** Kiracı izolasyonu (CLAUDE.md §1) kod düzeyinde değil, çalışma zamanında kayboluyor
ve hiçbir kapı bunu yakalamıyor. Üstelik oturumu OLAN her kullanıcı için doğru davrandığı
için elle test ederken asla görünmez.

**How to apply:**
1. `session?.tenantId`'yi asla doğrudan bir `where`'e koyma. `requireTenantPage(locale)` (sayfa),
   `requireTenantApi()` (route handler), `requireTenantAction()` (server action) — üçü de
   kiracısız dönmez (`src/lib/tenant.ts`). Okumayı `withTenant` / `withTenantOn` içine al ki
   Postgres RLS de `app.tenant_id` görsün ([[fabrika-withtenant-set-config]]).
2. Yükleyiciyi `tenantId: string` zorunlu alan bir fonksiyona ayır ve Prisma'ya dokunmadan
   ÖNCE runtime'da yeniden doğrula. Örnek:
   `src/app/[locale]/(app)/[workspace]/relationships/[id]/data.ts`.
3. "Sorgu hiç çalışmıyor"u sözle değil ölçerek kanıtla: dokunulduğunda fırlatan sahte bir
   client geçir (`withTenantOn(client, …)` seam'i bunun için var) ve çağrı sayısının 0
   olduğunu assert et. Şablon: `tests/relationship-tenant-scope.test.ts` +
   `scripts/seed-relationship-e2e.ts` (iki kiracılı, idempotent, `--rollback`).
4. Regresyon testinin ilk vakası **hatanın kendisini kaydetsin** (gerçek DB'ye karşı
   `tenantId: undefined` ile sorgu → başka kiracının satırı dönüyor). Yoksa test neyi
   koruduğunu söyleyemez. [[fabrika-prove-the-fix-against-the-real-database]]

**Hâlâ bu kusuru taşıyan yüzeyler** (2026-09-07 taraması; `relationships/` TASK-MTRKV9JGY7OQY'de
düzeltildi, aşağıdakiler DÜZELTİLMEDİ):
- `(app)/[workspace]/concept-notes/[id]/page.tsx:26` — `where: tenantId ? { id, tenantId } : { id }` (en ağırı)
- `(app)/[workspace]/evidence/page.tsx:22` — `where: tenantId ? { tenantId } : {}`
- `(app)/[workspace]/concept-notes/page.tsx:25` — aynı
- `api/billing/checkout/route.ts:124` — `session?.tenantId || 'default-tenant'` (uydurma kiracı;
  o id'li Tenant satırı bugün yok, ölçüldü) → [[fabrika-fabricated-fallback-antipattern]]

Temiz çıkanlar (aynı okumayı yapıp sorgudan önce kapatıyorlar): `approvals/page.tsx`,
`api/dashboard/export-csv/route.ts`, `api/concept-notes/[id]/export/route.ts`.

Tarama:
```
grep -rn "tenantId ?" src --include="*.ts" --include="*.tsx"
grep -rn "session?.tenantId\|session\.tenantId" src --include="*.ts" --include="*.tsx"
```

İlgili: [[fabrika-tenant-filter-check-the-write-too]] · [[fabrika-session-tenant-mismatch]] ·
[[fabrika-partial-fix-check-all-surfaces-of-the-same-bug]]
