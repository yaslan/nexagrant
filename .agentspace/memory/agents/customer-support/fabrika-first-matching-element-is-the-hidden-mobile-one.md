---
name: fabrika-first-matching-element-is-the-hidden-mobile-one
description: Fabrika app shell mounts UserMenu twice (mobile md:hidden FIRST, desktop second) — a Playwright .first() resolves to the invisible mobile copy and click times out
metadata:
  type: project
  updatedAt: 2026-09-08
---

`src/app/[locale]/(app)/layout.tsx` renders `MobileAppHeader` (`flex md:hidden`)
**before** the desktop header (`hidden md:flex`). Both mount `UserMenu`, so every
control in it — the notification bell, the avatar menu — exists **twice** in the DOM,
and the mobile copy comes first in document order.

Playwright runs Desktop Chrome at 1280px, so `locator(...).first()` resolves to the
copy that is `display:none`. The symptom is not "element not found" but a 60 s
timeout with `element is not visible` repeated ~120 times — easy to misread as a
slow page or a broken product. `MobileAdminHeader` + `admin/layout.tsx` and
`PublicNavbar` (two UserMenu mounts) have the same shape.

Take what the viewport shows, and assert there is only one:

```ts
const bell = page.locator('button[title="Bildirimler"]:visible');
await expect(bell).toHaveCount(1);
```

Substring locators are a second trap in this repo's Turkish UI: `aria-label*="ildirim"`
also matches the feedback widget `aria-label="Geri bildirim formunu aç"`. On a
viewport without the mobile header that locator opens a *feedback form* and a
negative-only spec still goes green. Match the title exactly.

Related: [[fabrika-negative-only-assertions-pass-on-a-screen-that-never-opened]]
