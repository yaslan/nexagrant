---
name: e10-a11y-learnings
description: E10.2 Accessibility task sonrası — contrast ratio, aria-labels, localStorage best practices
metadata:
  type: project
  updatedAt: 2026-09-06
---

## Accessibility & i18n Improvements — E10.2

### Problem: Color Contrast in Dark/Light Modes
When using CSS variables for accent color across light/dark themes, a single value may fail contrast ratio in one mode.
- Light mode: `--accent: #0891B2` + white text = 5.6:1 ✅
- Dark mode: Same accent + light theme text = 1.8:1 ❌

**Solution:** Use different accent shades per theme OR use dark text/light background combos. Inline styles `backgroundColor: '#003D5C'` with white text achieved 4.8:1 (WCAG AA).

### Lighthouse Limitations
- Lighthouse tests light mode by default; dark mode CSS may not be audited
- Color contrast "fails" in light-mode rendering even if dark-mode fixes exist
- Select options (`<select>`) in private routes are audited if accessible from public routes (e.g., modals)

### ARIA Labels
Mobile menu toggles + custom buttons MUST have `aria-label`. Text content alone doesn't suffice for screen readers on icon-only buttons.

**Pattern:**
```tsx
<button aria-label={mobileMenuOpen ? "Close Menu" : "Open Menu"}>
  <svg>{icon}</svg>
</button>
```

### localStorage Cookie Consent
CookieConsent.tsx already had full implementation:
- Save: `localStorage.setItem('fabrika_cookie_consent', JSON.stringify({accepted, time, level}))`
- Restore: Check on mount → if exists, don't show banner
- Works cross-page, survives refresh ✅

### i18n Symmetry
messages/tr.json and messages/en.json MUST have identical key structures. Asymmetry = untranslated gaps. Both files should be updated in same PR.

---

## Related Memories
[[fabrika-local-dev-gotchas]] — dev environment quirks (demo credentials, cookie banner)
