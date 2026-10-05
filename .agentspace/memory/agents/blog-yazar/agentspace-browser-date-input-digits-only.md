---
name: agentspace-browser-date-input-digits-only
description: In AgentSpace's internal browser tool, typing a dash-separated string ("2026-10-24") into an HTML <input type="date"> silently fails to set the value AND wipes sibling React-controlled fields already filled on the same form — type digits only, in the locale's segment order.
metadata:
  type: feedback
  updatedAt: 2026-09-08
---

During TASK-MTQUX5IZ9I5VP (independent verification of M9 brief persistence), filling Fabrika's
meeting-brief form (`briefs/client.tsx`: partner name text input, `<input type="date">`,
`<input type="time">`, three independent `useState` — no shared state, no effect that clears one
field when another changes) via `mcp__agentdesk-browser__agentspace_browser`:

- `click` the date field (`[data-testid="m9-meeting-date"]`) then `type` `"2026-10-24"` (ISO,
  dash-separated) left the field showing its placeholder (`gg.aa.yyyy`, i.e. still empty) **and**
  reset the partner-name and time fields — already filled in prior steps — back to empty. This
  happened twice, reproducibly, and is not explained by anything in the component (verified by
  reading the source: three independent `useState`, no cross-clearing `useEffect`).
- Re-filling in the order name → date (digits only, no dashes: `"24102026"`) → time (digits only:
  `"1400"`) worked correctly every time: each field kept the previous ones' values, and the final
  screenshot showed `24.10.2026` / `14:00` / the partner name all present together, matching the
  derived "Brüksel Saati" preview the component computes from all three.

**Why:** an `<input type="date">` is segmented (day/month/year, or month/day/year depending on
locale) and does not accept literal `-` characters as input — a dash is not a valid keystroke for
any segment, so the browser either drops it or (worse, as observed here) the automation layer's
attempt to inject it appears to full-page-reload the guest frame, which is what wipes sibling
controlled-input state that lives only in React (a real page navigation would explain the reset
without needing any bug in Fabrika's own code).

**How to apply:** for any `<input type="date">` in this tool, always `type` digits only, in the
placeholder's own segment order (read the placeholder first — Fabrika's Turkish locale shows
`gg.aa.yyyy` = day.month.year, so `"24102026"` for 24 Oct 2026; a US-locale `mm/dd/yyyy` field would
need `"10242026"` instead). Never pass separators. If a form has other fields already filled,
fill the date field *before* them when possible, or re-verify every field with a screenshot right
after touching a date input — don't assume earlier fields survived.

Related: [[agentspace-browser-click-fallback-playwright]] (same tool, different failure mode —
click() 502 vs type() silently corrupting form state) · [[fabrika-verification-card-workflow]]
(the verification task this was found during).
