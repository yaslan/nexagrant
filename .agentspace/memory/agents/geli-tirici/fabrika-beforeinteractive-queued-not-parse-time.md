---
name: fabrika-beforeinteractive-queued-not-parse-time
description: Next.js Script component strategy="beforeInteractive" queues to __next_s buffer; classically-injected script runs at parse time
metadata:
  type: feedback
---

## The Issue

`<Script strategy="beforeInteractive" dangerouslySetInnerHTML={{ __html: ... }} />` does NOT run at parse time.

**Why:** The Script component with `dangerouslySetInnerHTML` avoids React's warning, BUT Next.js queues it to the `__next_s` buffer instead of injecting it directly into the HTML head. The `__next_s` array is processed by the client hydration boot code, so the script runs AFTER React chunks load—too late to prevent paint.

Symptom: Dark theme flash for dark-preference users, because theme class applied on paint (visibly white) then corrected after script runs (visible transition).

## The Solution

Replace with a classic, blocking `<script src="/static-file.js"></script>` in JSX:
- Browser encounters tag during HTML parsing
- Fetches and executes synchronously
- Continues parsing
- Theme class applied BEFORE first paint
- No flash

## How to Apply

When a script must run at parse time (theme, feature flags, etc.) that blocks paint:

1. Extract inline script to `/public/script.js` (or `/public/scripts/`)
2. Use `<script src="/script.js" suppressHydrationWarning></script>` in JSX head
3. Suppress ESLint `@next/next/no-sync-scripts` with a comment explaining parse-time need
4. `suppressHydrationWarning` suppresses React warnings about hydration mismatch (script tag in JSX), but React will still log "Encountered a script tag while rendering React component" — this is expected and doesn't affect functionality

**Single Source of Truth:** If script reads a constant (e.g., storage key), keep the key in TypeScript (`const THEME_STORAGE_KEY = '...'`) and hardcode it in the static JS file. Add a comment in TS file: `// NOTE: This value must match public/script.js`

## Tradeoff

- **Blocked rendering:** Script must finish before HTML parsing continues. Typically <5ms for small scripts.
- **No async:** Can't use `async` or `defer` if parse-time execution is required.
- **React warning:** JSX script tag always triggers "Encountered a script tag" console message. Suppressible via intent only (acknowledge it's expected), not via flag.

## Gotchas

- `<script suppressHydrationWarning>` in JSX still fires React "Encountered script tag" console warning — **expected, not an error**.
- `strategy="beforeInteractive"` + `dangerouslySetInnerHTML` is a trap: looks like it runs early, but doesn't.
- Always verify parse-time execution with real browser (e2e test), not just typecheck/lint.
