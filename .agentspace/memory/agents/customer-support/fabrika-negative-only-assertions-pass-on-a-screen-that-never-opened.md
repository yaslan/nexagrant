---
name: fabrika-negative-only-assertions-pass-on-a-screen-that-never-opened
description: An anti-fabrication e2e block built only from not.toContain() also passes when the panel never opened — always add one positive assertion that the surface is really on screen
metadata:
  type: feedback
  updatedAt: 2026-09-08
---

The whole "no fabricated data" family of specs in this repo is written as
`expect(body).not.toContain('412.500')`. Every one of those assertions is
**satisfied by a blank screen**. So a spec that opens the wrong element, opens
nothing, or renders an error page reports success — it is measuring absence and
getting absence for the wrong reason.

**Why:** absence of a string is not evidence the surface was inspected. The
strongest anti-fabrication spec is the one that can still go red.

**How to apply:** before the `not.toContain` loop, prove the surface is open and
prove the empty case is *stated*, not merely blank:

```ts
await expect(page.getByRole('heading', { name: 'Bildirimler' })).toBeVisible();
await expect(page.getByText('Henüz bildiriminiz yok.')).toBeVisible();
await expect(page.getByText('Tümü Okundu')).toBeVisible();   // and no unread count
```

Then run a **negative control**: inject one fabricated row into the component,
confirm the spec turns red, revert it. In TASK-MTSJJOR63M63R that control fired on
the added empty-state assertion, not on the string loop — the string loop alone
would have been reached too late to matter. `git diff --stat <file>` must be empty
afterwards; say so in the report.

Related: [[fabrika-first-matching-element-is-the-hidden-mobile-one]] ·
[[fabrika-board-cards-are-not-db-rows]]
