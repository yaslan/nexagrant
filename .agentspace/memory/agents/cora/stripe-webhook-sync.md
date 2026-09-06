---
name: stripe-webhook-sync
description: Complete Stripe webhook integration for subscription sync to Fabrika PlanEntitlement
metadata:
  type: project
  updatedAt: 2026-09-06
---

## Stripe Webhook Integration — Complete Implementation

### Task Completed
TASK-MTPVC1XIP4GUG: Stripe Webhooks & Entitlements Sync — ✅ Complete (commit c66bd34, linting fixed)

### Files Created
- `src/lib/billing/subscription-sync.ts` — Core sync logic (450 lines)
- `src/lib/billing/create-portal-session.ts` — Portal link generator (35 lines)
- `src/app/api/webhooks/stripe/route.ts` — Webhook endpoint (85 lines)
- `src/app/api/billing/portal/route.ts` — Portal API (45 lines)
- `src/lib/billing/subscription-sync.test.ts` — Unit tests (160 lines)
- `src/lib/env.ts` — Added Stripe env vars

### Key Implementation Patterns

**Idempotency via Event ID:**
```typescript
const existingAudit = await prisma.auditEvent.findFirst({
  where: { data: { equals: { stripeEventId: eventId } } }
});
if (existingAudit) return { status: 'skipped', ... };
```

**Plan Parsing from Subscription Items:**
- Main plan item (index 0) → match price ID to Plan.stripePriceMonthly/Yearly
- Add-on items (index 1+) → match price ID to AddOnCatalog.stripePriceId
- Missing plan → default to 'free'

**Add-On Lifecycle:**
- Create: new AddOn records with quantity + providerItemId
- Update: modify quantity if changed
- End: set endedAt when removed from Stripe subscription

**Plan Downgrade Handling:**
- Detect plan change: existingSubscription.planId !== newPlanId
- Find modules in old plan but not new plan
- Turn off those modules via ModuleState.status = 'OFF'

**Credit Grant Logic:**
- New subscription (no existing) + status=active → grant Plan.aiCreditsMonthly
- Existing + status changed CANCELED→ACTIVE → grant Plan.aiCreditsMonthly
- CreditLedger entry: delta=+credits, reason='monthly_grant', refId=subscriptionId
- Deduplication via idempotency (event.id)

### Testing Patterns

- Mock prisma methods individually (don't mock entire db module)
- Mock Stripe SDK as class constructor with billingPortal.sessions.create
- Include creditLedger.create mock (easily forgotten)
- Test idempotency by returning early if existingAudit found

### Integration Points

- **Existing getEntitlements()** — Already derives from Subscription + AddOn
- **BillingClient UI** — Already has handleStripePortal() calling /api/billing/portal
- **Webhook Routing** — POST /api/stripe/webhook handles 4 event types
- **AuditEvent** — Logs all changes for compliance + debugging

### Known Gotchas

1. **Stripe Types:** `current_period_end` and `subscription` require `as any` cast on some Stripe SDK versions
2. **AddOn Query:** Must call `prisma.addOn.findMany()` separately (no include on Subscription)
3. **Module Downgrade:** Loop over Set elements requires explicit type casting (T as string)
4. **Test Mode Only:** All code assumes livemode:false (production requires verification)

### Future Work Blockers

- TASK-5: K1 Real Integration — Foundation complete, ready to hook into jobs
- Phase 2: iyzico TL billing — Portal link generator exists but not iyzico-specific
- Portal Auto-Sync: Currently manual trigger for add-ons, could auto-enable modules

### Testing Checklist

- [x] Stripe CLI webhook forwarding works
- [x] POST /api/stripe/webhook returns 200 + {received: true}
- [x] customer.subscription.updated syncs plan + addons
- [x] customer.subscription.deleted turns off modules
- [x] invoice.payment_succeeded logs to AuditEvent
- [x] CreditLedger entry created on new subscription
- [x] Duplicate events skipped (idempotency)
- [x] Unit tests all passing
- [x] TypeScript strict mode clean
- [x] ESLint clean on billing module
