---
name: agentspace-browser-click-fallback-playwright
description: When the AgentSpace internal browser tool's click action fails repeatedly (renderer timeout / "guest eval failed: Uncaught"), use a throwaway @playwright/test script against the running dev server for real-click evidence instead of giving up on the click requirement.
metadata:
  type: feedback
  updatedAt: 2026-09-08
---

During TASK-MTQZMX184PX87, `mcp__agentdesk-browser__agentspace_browser` with `action: "click"` failed on every attempt (`renderer timeout` once, then `guest eval failed: Uncaught` repeatedly) — confirmed as a tool/infra issue, not a page bug, by clicking two unrelated buttons on two different page loads and getting the same error both times, while `navigate`/`type`/`screenshot`/`readPage` on the same page kept working fine.

**Why this matters:** Fabrika's task rules require "GERÇEK TIKLAMA + ekran görüntüsü" (a real click, not a synthetic/offscreen test) before a task counts as done. A broken interactive click tool is not an excuse to skip that — and a Playwright `page.click()` against the actually-running dev server *is* a real click in a real Chromium instance, just driven by a script instead of the interactive tool.

**How to apply:** `@playwright/test` is already a project devDependency and exports `chromium` (not just the test-runner), so `import { chromium } from '@playwright/test'` works in a plain `.mjs` script. Node's ESM resolver needs the script to live under a directory with access to the project's `node_modules` — a script in the session scratchpad (outside the repo) throws `ERR_MODULE_NOT_FOUND`; copy it into a throwaway folder inside the repo (e.g. `.tmp-verify/`) instead, run it with `node .tmp-verify/script.mjs`, then delete the file and the folder before finishing (per the "geçici script/probe dosyalarını SİL" rule — `rm -rf` is blocked by the permission system here, so remove the file then `rmdir` the empty directory). The dev server is already up on `:3000` in this project (see [[fabrika-runtime-verification-recipe]]), so the script only needs to `page.goto` it — no `playwright.config.ts`/webServer needed for a one-off script.

Useful patterns from that script: signing in via `/tr/giris` with a seeded email (`alice@fabrika.test`, password-free) and `form button[type="submit"]`; forcing a server action to fail without touching source code by `page.route('**/*', ...)` and checking `req.headers()['next-action']` to fulfill only that POST with a 500; asserting no native `alert()` fired via a `page.on('dialog', ...)` listener that flips a boolean.

**Cheaper first thing to try (TASK-MTS6M5819RW93, 2026-09-08):** `guest eval failed: Uncaught` on
`click` is *also* what you get from a plain invalid-selector bug, not just tool/infra flakiness —
e.g. `button:has-text("...")` (a Playwright-only pseudo-class, not real CSS, since this tool's click
runs a plain `querySelector`). Swap to a real CSS selector first (an id, a distinctive class
combination) before assuming the tool itself is broken and reaching for the Playwright fallback
above. Also watch for Tailwind class collisions across unrelated elements — e.g. on `/calls`
(`src/app/[locale]/(app)/[workspace]/calls/page.tsx`) both the active framework-filter tab and the
"Aramayı Kaydet" button carry `border-accent`, so `button.border-accent` silently clicked the tab
instead (no visible error, just no effect); `button.border-accent.text-accent` — the pair only the
save button has — fixed it. When a click "succeeds" but nothing changes, suspect a same-class
collision before suspecting the handler.

**Cookie-consent modal blocks the Playwright fallback's login click (TASK-MTRD91ZLKEQ3A rerun,
2026-09-08):** `/tr/giris` mounts `src/components/CookieConsent.tsx`, a client-only modal
(`role="alertdialog"`) gated on `localStorage.fabrika_cookie_consent`, which appears a beat after
hydration — so a plain `page.click()` on a demo-login button times out waiting for the modal to
stop intercepting pointer events, and even `{ force: true }` dispatches the click but it silently
does nothing (the button hadn't actually hydrated its handler yet when force skipped the
actionability wait). Fix: before `page.goto`, call
`page.addInitScript(() => localStorage.setItem('fabrika_cookie_consent', JSON.stringify({accepted:true, time:new Date().toISOString(), level:'all'})))`
— the modal never mounts, and a normal (non-forced) `page.click('button:has(div:text("admin@yasinaslan.com.tr"))')`
followed by `page.waitForURL(u => !u.pathname.includes('/giris'))` works first try. Applies to any
Playwright-fallback script that starts from `/tr/giris` or any other page `CookieConsent` mounts on.
