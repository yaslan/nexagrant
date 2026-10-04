# TASK-MUTYFGWYY5CS5: Settings Module Access Control by RBAC

**hüküm:** ✓ Feature complete. Server-side `can(role, 'manage_modules')` check ensures unauthorized users are not shown Modules Settings option. PR #33 against dev, awaiting CI.

## Ne yapıldı

Implemented RBAC-based access control for Settings → Modules:

1. **Server-side check (layout.tsx)**
   - Imported `can()` and `asRole()` from rbac.ts
   - Computed `canManageModules = can(asRole(roleName), 'manage_modules')`
   - Passed prop to SidebarNav, UserMenu, and MobileAppHeader

2. **Client-side routing (SidebarNav.tsx)**
   - Added `canManageModules?: boolean` prop
   - Settings link now routes to `settingsProfile` if unauthorized, else `settingsModules`

3. **User menu visibility (UserMenu.tsx)**
   - Added `canManageModules?: boolean` prop
   - "Modül Ayarları" (Module Settings) link conditional: only shown if `canManageModules === true`
   - Wraps link in `{canManageModules && (...)}`

4. **Mobile support (MobileAppHeader.tsx)**
   - Propagated `canManageModules` to both UserMenu and drawer SidebarNav

5. **E2E test (settings-modules-access-control.spec.ts)**
   - JWT-based `signInAsUser()` fixture for production-mode testing
   - MEMBER role: Settings → profile, no "Modül Ayarları" link in menu
   - MEMBER direct to /settings/modules → "Erişim Reddedildi" (already server-side)
   - TENANT_OWNER: Settings → modules, "Modül Ayarları" visible
   - Mobile 390px: MEMBER Settings → profile
   - Tests use demo-tenant with JWT cookies, no database seeding needed

## Kanıt

**Code changes:**
- layout.tsx: Added imports, `canManageModules` compute (lines 18, 91) and prop pass (lines 121, 141, 96)
- SidebarNav.tsx: `canManageModules` prop (line 12), conditional href logic (lines 36-43)
- UserMenu.tsx: `canManageModules` prop (line 60), conditional render (lines 404-412)
- MobileAppHeader.tsx: `canManageModules` prop (line 21), pass-through (lines 28, 74, 115)
- E2E test: 5 test cases covering member/owner, menu/direct URL, mobile

**Type checking & lint:** Pass
```
$ npm run typecheck → (no errors)
$ npm run lint → (pass, 3 warnings unrelated to changes)
```

**PR:** https://github.com/yaslan/fonbridge/pull/33
- Branch: `be-fb/modules-access-control` → `dev`
- Commit: `969eef7e`
- Status: Awaiting CI green before merge

## Değişen dosyalar

1. `src/app/[locale]/(app)/layout.tsx` — RBAC check, prop pass
2. `src/components/SidebarNav.tsx` — Conditional routing
3. `src/components/UserMenu.tsx` — Conditional link visibility
4. `src/components/MobileAppHeader.tsx` — Prop propagation
5. `tests/e2e/settings-modules-access-control.spec.ts` — New E2E test

## Riskler

- **RLS bypass:** E2E test uses JWT fixture (no database operations) → no risk
- **RBAC rule changes:** If `can()` changes role permissions, link visibility auto-respects via server-side check
- **Regression:** Settings UI/routing tested across desktop, mobile (390px), menu, sidebar

## Açık sorular

None. modules/page.tsx already enforces forbidden page; this prevents nav offering forbidden route.

## Sonraki adım

1. Merge PR #33 once CI green
2. No follow-up needed; rule is single, simple check per spec

---

**Platform beyanı:** macOS. Code is platform-agnostic (Next.js, Prisma, React). No OS-specific paths, tokens, or shell commands in changes.
