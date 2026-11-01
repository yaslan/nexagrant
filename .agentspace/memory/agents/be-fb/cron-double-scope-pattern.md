---
name: cron-double-scope-pattern
description: Multi-tenant cron jobs must consolidate reads and writes in a single tenant scope to prevent RLS evasion
metadata:
  type: feedback
---

## Double-scope anti-pattern in cron jobs

When a cron job iterates over tenants and performs both a read and a write, both **must execute within the same tenant scope context**. Example:

**❌ Anti-pattern (TASK-MTVTMZXYT84RZ):**
```typescript
for (const tenant of tenants) {
  const data = await runTenant(tenantId, (tx) => getEntitlements(tenantId, tx)); // Scope 1
  if (data.value > 0) {
    await runTenant(tenantId, (tx) => tx.create({ ... })); // Scope 2
  }
}
// Result: [A, A, B, B] = 2 scopes per iteration (double-scope)
```

**✅ Pattern (corrected):**
```typescript
for (const tenant of tenants) {
  await runTenant(tenantId, async (tx) => {
    const data = await getEntitlements(tenantId, tx);
    if (data.value > 0) {
      await tx.create({ ... }); // Same scope
    }
  });
}
// Result: [A, B] = 1 scope per iteration
```

**Why:** In production, the `fabrika_app` role is NOBYPASSRLS — unscoped writes get refused by RLS policy (SQLSTATE 42501). Locally, SUPERUSER + BYPASSRLS silently misfiled the row, hiding the bug. The double-scope masks this because the test expects one scope signature but records two.

**Test probe:** Use a `recordingRunner()` that tracks scope opens (push to array). A stale-id mutation (like in the test) proves the scope matters — if code skipped the wrapper, the stale setter would go unnoticed.

**How to apply:** When writing multi-tenant cron loops in [[yuyt-messaging-api-patterns]] or similar, wrap the entire iteration (read + compute + write) in one `runTenant(tenantId, async (tx) => { ... })` block. Don't split across scopes unless the scope **intentionally** changes (rare).
