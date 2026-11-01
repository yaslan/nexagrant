---
name: e11-2-feedback-form-learnings
description: Sentry integration, seed patterns, and i18n practices from E11.2 feedback form
metadata:
  type: feedback
---

## Key Learnings from E11.2 Feedback Form

### Sentry Integration — Minimal & Graceful

**Rule:** For Sentry integration, prefer a minimal custom Sentry forwarder over @sentry/nextjs SDK.

**Why:** 
- @sentry/nextjs is heavy: brings build plugins, source-map upload, global error handler we don't need
- Fabrika only needs: post structured beta reports to Sentry → become issues in Sentry UI
- The envelope endpoint is documented HTTP; ~80 lines of fetch covers it

**How to apply:** 
- `src/lib/observability/sentry.ts` implements captureToSentry(eventInput, options)
- Parses DSN, builds envelope (event + optional attachment), sends to Sentry HTTP endpoint
- Never throws, never logs secret: silent "skipped" when SENTRY_DSN is blank/invalid
- Transport failure is not fatal: report already in database; Sentry is amplifier only
- Result: { status: 'sent' | 'skipped' | 'failed', eventId?, reason? }

**Next time:** If you need error reporting, check if captureToSentry() solves your case before reaching for the SDK.

---

### Seed Patterns — Idempotent Design

**Rule:** Seed fixtures should be upserted (create if missing, update if exists), keyed on deterministic lookups, so re-running the seed is safe.

**Why:** 
- Development happens in cycles: reset DB, seed, test, repeat
- Seed should be runnable many times without duplicates
- Upsert lets you modify seed data and run again to update live rows

**How to apply (Prisma):**
```ts
await prisma.feedback.upsert({
  where: { title: fb.title, tenantId: tenant.id },
  update: { /* fields to update if exists */ },
  create: { /* all fields for new row */ }
});
```
Or simpler: check if exists before create.

**Gotcha:** For seed-e11-feedback.ts, initially tried `where: { tenantId }` on User model — User has no tenantId field. Learned: seed has to trace relationship correctly. Use Membership.findFirst({ where: { tenantId }, include: { user: true } }) instead. [[prisma-user-tenant-relation]]

---

### i18n — Literal Keys, Never Interpolated

**Rule:** When calling t('key'), always pass a string literal as key, never interpolated strings like `t(\`category\${c}\`)`.

**Why:** 
- `scripts/i18n-check.ts` scans call sites for literal arguments only
- Interpolated keys are invisible to the linter and show up as "missing translation" in both languages
- Forces discipline: you list all possible keys upfront

**How to apply:** 
- Use switch/case on enum values to call t('categoryBUG'), t('categoryFEATURE_REQUEST'), etc.
- See `src/components/FeedbackWidget.tsx` lines 36–51 (categoryLabel) and 53–64 (impactLabel)

---

### Tenant Lookups in Seed

**Rule:** When seeding per-tenant data, look up tenant by name or id, then find users via Membership.

**Why:** User model has no tenantId field (RBAC is through Membership). Trying `prisma.user.findFirst({ where: { tenantId } })` throws "Unknown argument tenantId".

**Pattern:**
```ts
const tenant = await prisma.tenant.findFirst({ where: { name: 'Fabrika Beta' } });
const membership = await prisma.membership.findFirst({
  where: { tenantId: tenant.id },
  include: { user: true }
});
const user = membership?.user ?? null;
```

---

## Related Notes

[[fabrika-multitenancy-rules]] — Multi-tenancy is core to Fabrika (withTenant wrapper, RLS, ModuleState per tenant).
