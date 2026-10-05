---
name: fabrika-admin-shell-compliance-badges-were-fiction
description: Fabrika admin layout carried three hardcoded "RLS enforced" badges that contradicted the measured reality (BYPASSRLS role) — grep the app shell for compliance-sounding UI text, not just data-fake screens
metadata:
  type: project
  updatedAt: 2026-09-09
---

`src/app/[locale]/admin/layout.tsx` had three plain-string badges claiming RLS was
active/enforced: header "RLS Protected", sidebar "RLS Güvenlik: 30 / 30 Tablo", footer
"RLS Policy %100 Enforced". None were backed by an Evidence/TopicStat record (CLAUDE.md
rule 7) and all three were **false for the connection they run on**: the app's main
`DATABASE_URL` uses the `fabrika` role, which is SUPERUSER + BYPASSRLS
(`src/lib/db.ts:58-62`, `prisma/rls-app-role.sql:1-9`) — RLS policies are never evaluated
on it. The only place RLS is genuinely measured is `tests/rls.spec.ts` against a separate
`fabrika_app` (NOBYPASSRLS) role via `DATABASE_URL_RLS_TEST`. This exact fact was already
in shared memory ([[fabrika-local-app-role-bypasses-rls]] shared) — the UI just never got
updated to stop contradicting it.

**Why:** [[fabrika-app-shell-carries-its-own-fake-data]] taught "grep the shell for fake
*data*, not just the route file." This is the same lesson one layer up: the shell can also
carry fake *compliance claims* — confident-sounding security/status badges with a number
in them, that nobody wired to a real measurement. Rule 7 exists exactly to prevent this
category, but a badge sitting quietly in a layout file (not a metrics dashboard) is easy
to miss during an audit that's looking for numbers on data pages.

**How to apply:**
- When auditing for CLAUDE.md rule 7 (Kanıt disiplini), don't limit the grep to dashboard/
  stats pages — check `layout.tsx` files and any persistent chrome (header/sidebar/footer)
  for hardcoded percentages, "X/Y" counts, or security-sounding badges ("Protected",
  "Enforced", "Verified", "%100 ...").
- Before touching an RLS-related claim anywhere in this repo, first check which DB role
  the code path actually runs under — `src/lib/db.ts` (main `DATABASE_URL`) vs
  `DATABASE_URL_RLS_TEST` (`fabrika_app`, the only NOBYPASSRLS role). A claim true under
  one is false under the other.
- Fix chosen here: **removed** the three badges rather than replacing the number with a
  "truthful" one, because there is no live Evidence source cheaply available in a layout
  server component — wiring one up (or switching the main connection to `fabrika_app`)
  is separate, larger scope (`docs/ROADMAP.md` open decision #16). Removal + a one-line
  ROADMAP note is the right size for a scope-limited card; don't invent a fake-but-smaller
  number as a "safer" middle ground — it's still ungrounded.
- Found two more of the same *species* (not RLS, general fake "system health") in the
  same file — `Sistem Durumu: Aktif (%100 Operational)` and `Sistem Sağlığı ... 100% OK` —
  reported but not fixed (out of this card's scope). Worth its own card.

İlgili: [[fabrika-app-shell-carries-its-own-fake-data]] · [[fabrika-local-app-role-bypasses-rls]] (shared) · [[fabrika-tenant-isolation-real-defense-is-app-level-where]] (shared)
