---
name: fabrika-script-in-jsx-hydration
description: React warns when script tags are inside JSX component tree, not about head/body placement
metadata:
  type: feedback
---

## Kural: Script Tags in JSX Trigger React Hydration Warnings

**Issue:** React warns "Encountered a script tag while rendering React component" when a `<script>` tag is placed directly in JSX (e.g., inside `RootLayout`'s return), regardless of whether it's in `<head>` or `<body>`.

**Why:** React forbids executing scripts inside components on the client side because they're not guaranteed to execute. Server-render-only scripts trigger this warning during hydration mismatch detection.

**How to apply:** 
- Don't place `<script>` tags directly in JSX return values
- Use `next/script` component (async or defer) or inject via `dangerouslySetInnerHTML` outside the component tree
- Moving from `<head>` to `<body>` does NOT suppress the warning — the problem is JSX placement, not tag location
- If the script is critical (like theme init), consider injecting it via HTML template or Metadata API instead of JSX

**Evidence:** TASK-MTTYNL8VPMNFN tested moving script from `<head>` to `<body>` first child; warning persisted. React internals check `isScriptDataBlock()` only for non-executable types (application/json); text/javascript scripts in JSX always warn.

**Gotcha:** suppressHydrationWarning on the script tag doesn't eliminate the underlying issue — it just hides the console message but doesn't prevent React's re-rendering of the script.
