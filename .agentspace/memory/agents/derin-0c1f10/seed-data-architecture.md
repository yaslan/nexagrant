---
name: seed-data-architecture
description: Modular seed data patterns — upsert idempotency, time-series, FK resolution
metadata:
  type: feedback
---

## Rule: Modular Seed Architecture with Upsert Idempotency

**Structure:** Break monolithic `seed.ts` into focused seed files (one concern per file), each exporting a single `async function seedX()` called from master orchestrator in `main()`.

**Why:** Isolation prevents side-effects; upsert patterns make seed runs idempotent (safe to re-run). Easier to test, reuse, and manage demo vs. test vs. production variations.

**Pattern:**
```typescript
// prisma/seed-entities.ts
export default async function seedEntities() {
  for (const data of entitiesData) {
    await prisma.entity.upsert({
      where: { uniqueKey: data.uniqueKey },
      update: data,
      create: data,
    });
  }
  console.log(`Entities seeded (${entitiesData.length} records).`);
}

// prisma/seed.ts
import seedEntities from './seed-entities';
async function main() {
  // ... existing setup (plans, modules, programmes)
  await seedEntities();
  console.log('Seeding completed.');
}
```

**How to apply:** Every new seed (E9, v1.1 M6 test data, etc.) goes as `prisma/seed-X.ts` + upsert loop. Master seed.ts imports and calls in dependency order.

---

## Rule: Time-Series Seed Data with Historical Dates

**Structure:** When seeding event-like records (gate decisions, interactions, audit events), compute `decidedAt` by iterating backwards from `now()` using `setDate()`:

```typescript
const decisionDate = new Date(); // 2026-09-06
decisionDate.setDate(decisionDate.getDate() - daysAgo); // 2026-08-15
await prisma.gateDecision.upsert({
  // ...
  decidedAt: decisionDate,
});
```

**Why:** Realistic time span (e.g., G0→G2 over 22 days) makes KPI reports, charts, and retention analysis meaningful. Avoids "all on 2026-09-06" clustering.

**How to apply:** For any workflow event with temporal meaning (decision timestamps, interaction logs), map seed data to absolute dates *relative to current date*. Use `daysAgo` or `minutesAgo` offsets.

---

## Rule: FK Lookup Pattern in Seed Functions

**Structure:** When seeding dependent entities (Opportunity→Topic→Call), use `findUnique()` or `findFirst()` to resolve ForeignKey IDs before creating child records:

```typescript
// seed-opportunities.ts
for (const oppData of opportunitiesData) {
  const topic = await prisma.topic.findUnique({
    where: { identifier: oppData.topicIdentifier },
  });
  if (!topic) {
    console.warn(`Topic not found: ${oppData.topicIdentifier}`);
    continue;
  }
  
  await prisma.opportunity.upsert({
    where: { id: oppId },
    update: { topicId: topic.id },
    create: { id: oppId, topicId: topic.id, ... },
  });
}
```

**Why:** Avoids hardcoding `topicId` values (which are UUIDs, unpredictable); allows seed data structures to reference *semantic* identifiers (`topicIdentifier: "HORIZON-CL5-..."` instead of `topicId: "cuid-xxx..."`).

**How to apply:** Define seed data with `identifier` or `uniqueKey` fields; look up ForeignKey ID just before use. Graceful skip on miss (`if (!resource) continue`) prevents cascading failures.

---

## Rule: M6 Evaluator Lens as Overlay Seed

**Context (Fabrika):** M6 panel evaluation seed (`seedM6EvaluatorLens()`) builds on E10 seed results (demo-proposal-3, demo-opp-3, alice/bob users). Does NOT re-seed those entities; only adds Evaluation, Reviewer, Criterion records.

**Why:** Layered seeds avoid duplication; M6 seed can be toggled on/off independently of core E10 data.

**How to apply:** If a seed depends on prior seeds' output (e.g., E10 creates demo-proposal-3, E11 adds M6 evaluation), extract the dependency seed into a separate function. Document order in main() comments or via import order.

---

## Multi-currency & Programme Patterns (Fabrika-specific)

When seeding international calls: Map `currency` to programme (HE=EUR, TÜBİTAK=TRY, Eurostars=EUR) and budget scale (€350K for HE vs. ₺2M for TÜBİTAK). Encode as `budgetCents: BigInt(...)` with explicit currency field.

**How to apply:** Define `callsData[]` with explicit `currency` and `budgetCents` fields; preserve fidelity through BigInt (cents, not euros/lira).
