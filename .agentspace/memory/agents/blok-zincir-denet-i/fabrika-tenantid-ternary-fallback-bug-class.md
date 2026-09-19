---
name: fabrika-tenantid-ternary-fallback-bug-class
description: Fabrika'da tekrarlayan hata sınıfı — session?.tenantId'yi requireTenantPage/Action yerine ham okuyup "tenantId ? {tenantId} : {}" ile filtreyi düşürmek; iki kez düzeltilmiş, üç yerde hâlâ canlı bulundu
metadata:
  type: project
  updatedAt: 2026-09-09
---

Fabrika'da tekrar eden, kanıtlanmış bir hata sınıfı var: bir sayfa/action `const tenantId = session?.tenantId` ile ham okuma yapar (kanonik `requireTenantPage`/`requireTenantAction`/`requireTenantApi` — `src/lib/tenant.ts` — yerine), sonra Prisma `where`'ini `tenantId ? { tenantId } : {}` (ya da `{ id, tenantId } : { id }`) şeklinde üçlü operatörle kurar. `tenantId` boş/undefined olduğunda filtre TAMAMEN düşer: `{}` → tüm kiracıların tüm satırları; `{ id }` → id tahmin edilebilirse başka kiracının o satırı (IDOR).

Bu depoda bu hata **iki kez bilfiil düzeltilmiş** (`src/app/[locale]/(app)/[workspace]/concept-notes/actions.ts` docstring'i, TASK-MTRKV9JGY7OQY / `src/app/[locale]/(app)/[workspace]/relationships/[id]/data.ts` — ikisi de düzeltmeyi ayrıntılı yorumla belgeliyor) ve **TASK-MTU6I3V2R30M8 denetiminde üç kardeş dosyada hâlâ canlı bulundu**: `evidence/page.tsx:21-22`, `concept-notes/page.tsx:24-25`, `concept-notes/[id]/page.tsx:26-27`.

**Why:** `moduleGate()` (→ `checkModuleAccess` → `tenantScopeOf`) bu üç sayfanın önünde durduğu için bugün muhtemelen tetiklenemez (aynı istekte `auth()` iki kez tutarlı sonuç veriyor varsayımıyla) — ama bu "kanıtlanmış güvenli" değil, sadece "şu an şanslı". Modül gate'i modüle bakar, kiracıya bakmaz; `relationships/data.ts`'nin kendi yorumu bunu "gate modülü reddetti, sızıntı gizli kaldı ama canlı değildi" diye tarif ediyor — aynı durum.

**How to apply:**
- Gelecekte bu kod tabanında herhangi bir sayfa/action incelerken `session?.tenantId` veya `session?.\w+` ham okumasını görürsen, hemen ardından bir `? ... : ...` ile Prisma `where`'i kuruluyor mu diye bak — kuruluyorsa ve "else" tarafı tenantId'yi düşürüyorsa bu KESİN bir bulgu, "muhtemelen erişilemez" savunması onu düşük önem yapmaz (aynı sınıf zaten iki kez sızmıştı).
- Düzeltme mekanik: `requireTenantPage(locale)` / `requireTenantAction()` / `requireTenantApi()` kullan — tenantId garanti non-empty string olur, ternary'ye gerek kalmaz.
- Statik bir koruma (lint kuralı / CI grep) yok — `.claude/commands/review-rls`'in bunu kapsayıp kapsamadığı doğrulanmadı, ileride kontrol edilebilir.
- Tam liste ve satır numaraları: docs/agent-results/TASK-MTU6I3V2R30M8-blok-zincir-denet-i.md
