---
name: m6-withTenant-pattern
description: withTenant() callback pattern + DB transaction compatibility — how to write server actions that work with both direct prisma and transaction contexts
metadata:
  type: reference
---

## withTenant Callback Pattern (Fabrika)

`src/lib/db.ts` exports:
```ts
export async function withTenant<T>(
  tenantId: string,
  callback: (tx: Omit<PrismaClient, '$connect' | '$disconnect' | '$on' | '$transaction' | '$use' | '$extends'>) => Promise<T>
): Promise<T>
```

**Key:** `withTenant` doesn't return a db client; it takes a **callback** that receives `tx` (transaction context).

### Pattern in M6 (saveEvaluation action)

❌ **Wrong:**
```ts
const db = withTenant(prisma, data.tenantId);
const evaluation = await db.evaluation.findUnique(...);  // Error: withTenant returns Promise<T>, not client
```

✅ **Right:**
```ts
await withTenant(data.tenantId, async (tx) => {
  const evaluation = await tx.evaluation.findUnique(...);
  // tx is the transaction context, safe for RLS (app.tenant_id set locally)
});
```

### DB Utility Functions (Scoring)

When a function takes `prisma` but runs in a transaction, use **type union**:

```ts
export async function updateEvaluationScore(
  prisma: PrismaClient | Omit<PrismaClient, '$connect' | '$disconnect' | '$on' | '$transaction' | '$use' | '$extends'>,
  evaluationId: string,
  tenantId: string,
): Promise<void> {
  // Now accepts both direct client and transaction context
  await prisma.evaluation.update({ ... });
}
```

Called from:
- Direct action: `await updateEvaluationScore(prisma, id, tenantId)`
- Inside transaction: `await updateEvaluationScore(tx, id, tenantId)` ✅

**Why:** Transaction isolation + RLS context set by withTenant().

---

## Related

- [[fabrika-rls-withTenant]]: Row-level security context setup
- [[fabrika-m6-action-pattern]]: Full saveEvaluation server action example
