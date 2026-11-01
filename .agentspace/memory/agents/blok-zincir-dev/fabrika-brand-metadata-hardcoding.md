---
name: fabrika-brand-metadata-hardcoding
description: "Brand name appears both in brand.ts (single source) and hardcoded in page titles, emails, calendar headers — full sweep needed on brand changes"
metadata: 
  node_type: memory
  type: project
  updatedAt: 2026-09-10
  originSessionId: 21f0e5f6-b87f-49ed-93f9-606424368cd8
  modified: 2026-09-10T06:57:38.514Z
---

## The Issue

Fabrika's `src/lib/brand.ts` exports `PRODUCT_NAME` as a single source of truth. On 2026-09-10, it was changed Fabrika → FonBridge. The change succeeded for:
- Email "from" lines that call `withBrand()` or interpolate `{PRODUCT_NAME}`
- i18n catalogue entries with `{brand}` placeholders

But it **failed** for user-visible strings that were copied as literals during an earlier rename cycle:
- Page `<title>` tags (Next.js `metadata.title`)
- Email subject lines ("Fabrika Beta — Sizi davet ediyoruz")
- Calendar headers (ICS `PRODID:-//Fabrika SaaS//EN`)
- Document footers/headers (invoice generation)
- Email bodies ("from: Fabrika <...>")

**Full list** in commit `9af3f63`, grep output file at docs/agent-results/TASK-MTV5UO42C5KGE-blok-zincir-dev.md.

## Why It Happened

The Fabrika → original-name revert was partial. Page metadata was not automatically updated because:
1. Some uses call `PRODUCT_NAME` runtime (works ✓)
2. Others are hardcoded literals (broken ✗)
3. No single regexp finds all of them — some are in comments, some in strings, some in generated code paths

## How to Detect on Next Brand Change

When `PRODUCT_NAME` changes:
1. Restore via brand.ts (as done)
2. Set `PRODUCT_NAME = 'ZZTEST'` in worktree
3. Render pages in browser, check: page title (browser tab), email subjects (grep messages/*.json), calendar exports, invoice PDF footers
4. Grep for hardcoded product name: `grep -rn "Fabrika" src/ messages/ | grep -v brand.ts` — anything found is a literal that bypasses the module

## Follow-on Work Required

**TASK**: Audit and refactor page metadata (Next.js `generateMetadata()`) to call or interpolate `PRODUCT_NAME`, not hardcode product name. ~20 locations across:
- src/app/layout.tsx, calls/page.tsx, [region]/page.tsx, dashboard, settings, admin/alerts, admin/feedback
- src/actions/user/request-deletion.ts (email from field)
- src/lib/calendar.ts (ICS calendar object)
- src/lib/beta/invite-email.ts (email subject)
- Other generated content (invoices, evidence packs)

## Principle Going Forward

**Brand name is NOT just `brand.ts`.**  
It's also:
- Page `<title>` and `<meta name="og:*">` tags
- Email subjects and from/reply-to lines
- Generated document headers/footers
- Calendar invitations
- Static error pages (404, 500)

On every brand name change, audit **all** user-facing strings for literals, not just code calls.

[[fabrika-env-flip-restarts-shared-dev-server]] — Use worktree + PORT override to test brand changes in isolation.
