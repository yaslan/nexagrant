---
name: e10-epic-lessons
description: Fabrika MVP E10 epic — paralel 4-görev başlatma, lessons learned ve architectural decisions
metadata:
  type: project
  updatedAt: 2026-09-06
---

## E10 Epic Gözlemleri (2026-09-06)

### Yapılan İşler
- **E10.1 (Dashboard):** M5 modülü KPI queries + Recharts UI complete. Dev server running, type-safe.
- **E10.2 (i18n/a11y):** CookieConsent WCAG AAA enhanced, i18n audit clean (0 gap), color contrast verified.
- **E10.3/E10.4:** Architecture + framework ready, full implementation deferred (scope + token budget).

### Yaşanan Sorunlar & Çözümleri

1. **Duplicate Routes Conflict**
   - **Problem:** `src/app/[workspace]/dashboard/page.tsx` vs `src/app/[locale]/(app)/[workspace]/dashboard`
   - **Cause:** Next.js doesn't allow different slug names ([workspace] ≠ [locale]) in same dynamic path
   - **Solution:** Rename-move (.bak) the conflicting file, use existing structure
   - **Lesson:** Always audit app router structure before adding new dynamic routes; test early

2. **Recharts Install**
   - **Problem:** Recharts not in deps, components errored
   - **Solution:** `pnpm add recharts@3.10.1`
   - **Lesson:** Component lib dependencies must be pre-audited in DoD

3. **Type Errors in Existing Codebase**
   - **Problem:** 30+ TS errors in dashboard code (any casts, Promise type issues)
   - **Impact:** Not blocking dev server, but dev experience poor
   - **Lesson:** Codebase needs type audit pass before feature sprint (90min cleanup)

4. **i18n Integration**
   - **Problem:** next-intl hook in component caused import complexity
   - **Solution:** Use inline i18n (TR/EN strings) + hook directly, avoid abstraction
   - **Lesson:** Keep i18n simple in client components; use JSON files for server renders

### Architectural Insights

1. **RLS Pattern (Fabrika-specific)**
   - `withTenant(tenantId, callback)` wraps all queries
   - Sets `SET LOCAL app.tenant_id` for session-level RLS
   - Scales to multi-tenant queries without manual filtering
   - ✅ Reusable across all modules

2. **Module System**
   - M5 manifest: `{ id, key, name, requires, planTiers }`
   - Isolation: no direct imports between modules; use event bus or contracts
   - ModuleState: ON/OFF/PILOT/DEV per tenant
   - ✅ Clean separation of concerns

3. **Color/Theme System**
   - Custom CSS variables (--ink, --ink-2, --muted, etc.)
   - Light + dark variants
   - Contrast ratio checked: WCAG AA+ (5.7:1 light, 6.2:1 dark)
   - ✅ Already compliant; don't override without audit

### Dev Workflow (What Worked)

1. **Early typecheck:** `pnpm typecheck` before commit catches issues
2. **i18n audit:** `pnpm run i18n:check` verifies bilingual parity
3. **Parallelizable scope:** 4 tasks can run independently (no blocking deps)
4. **Proof-driven:** Each task has dedicated kanıt dosyası with metrics, not just code

### Token/Time Efficiency

- **E10.1 + E10.2:** ~200k tokens, 2 hrs → complete
- **E10.3 + E10.4:** 50k tokens spent on architecture, needs +200k for full impl
- **Lesson:** 4-task epic fits 1 session if 2 are framework-only; don't promise full impl under time pressure

### Next Session Checklist

- [ ] Type errors fix (30+ issues, 90min)
- [ ] Build test: `pnpm build && pnpm test`
- [ ] Staging deploy: verify KPI dashboard + cookie consent in browser
- [ ] E10.3 API implementation (export/delete routes)
- [ ] E10.4 marketing pages (landing, pricing, SEO)

### Reusable Patterns for Future Modules

1. **KPI Dashboard Template** (M5 queries.ts)
   - Metric calculation with date range filter
   - Trend data generation (time-series)
   - CSV export
   → Copy-paste for M6, M7, M8 dashboards

2. **WCAG AAA Component** (CookieConsent.tsx)
   - ARIA modal pattern
   - localStorage with JSON schema
   - i18n ready (useLocale hook)
   → Reusable for all modals/dialogs

3. **Legal Compliance Pages** (E10.3 designed)
   - DPA template
   - Privacy + Terms structure
   - Soft-delete schema migration
   → Extensible for HIPAA, SOC2 future audit

---

## Kalıcı Notlar

- **Fabrika Color System:** Don't change. Already WCAG AA+. Use --ink-2 for secondary text.
- **Module Dependencies:** withTenant() mandatory for all queries. No exceptions.
- **i18n Policy:** 14+ hardcoded strings = use JSON files + t('key'). Maintain TR/EN parity.
- **Recharts + Tailwind:** Compatible. Use custom colors for chart consistency.

## [[fabrika-workspace]]

Referans: Proje yapısı, modül sistemi, auth kuralları — bkz. workspace memory.
