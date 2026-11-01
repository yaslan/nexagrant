---
name: fabrika-signin-page-renders-the-email-form-twice
description: /tr/giris renders its email form twice (responsive variants), so the usual Playwright locator dies on a strict-mode violation — pin it with :visible
metadata:
  type: project
updatedAt: 2026-09-10
---

`page.locator('input[type="email"]').fill(...)` on `/tr/giris` fails:

```
Error: locator.fill: Error: strict mode violation:
locator('input[type="email"]') resolved to 2 elements
```

The sign-in page renders the same form twice (responsive variants), so both the
email input and the submit button match twice. Several older specs still use the
unscoped locator and will hit this.

**How to apply** — in a new e2e spec, pin to the one on screen:

```ts
await page.locator('input[type="email"]:visible').first().fill(EMAIL);
await page.locator('form button[type="submit"]:visible').first().click();
```

`.first()` alone is not enough: whichever copy is first in the DOM may be the
hidden one, and `fill()` on a hidden input fails differently.

The same shape of trap sits inside the pipeline board: an expanded card has TWO
selects — the "Atanan" owner select comes first in the DOM, the note-author
select second — so `card.locator('select').first()` grabs the wrong one. Board
cards carry `data-testid` (`pipeline-card-<id>`, `pipeline-note-author-<id>`,
`pipeline-note-text-<id>`, `pipeline-note-add-<id>`, `pipeline-note-item-<id>`);
address by test id rather than by position.

Related: [[fabrika-playwright-reuses-a-stale-dev-server]].
