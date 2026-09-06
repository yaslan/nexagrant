---
name: i18n-audit-complete
description: i18n Message Catalog Audit task complete with audit tool, CI/CD workflow, unit tests, pre-build hook
metadata:
  type: project
  updatedAt: 2026-09-06
---

## i18n Message Catalog Audit — COMPLETE ✅

**Task:** TASK-MTPVCS6K7F1ME · Fabrika MVP · Week 1 Friday · 2026-09-06  
**Status:** Complete, all acceptance criteria met

### What was built
1. **scripts/i18n-check.ts** — Parses src/ for t() calls, compares against messages/tr.json and messages/en.json, reports missing/unused keys, exit 0/1
2. **tests/i18n.test.ts** — 4 unit tests (key parity, non-empty values, translation quality, minimum scale)
3. **.github/workflows/i18n-check.yml** — GitHub Actions workflow that runs on PR, posts gap summary in comments, blocks merge on gaps
4. **next.config.ts** (verified) — Pre-build hook (lines 8-40) already implemented; warns on gaps, doesn't block build

### Current state
- **103 keys** in messages/tr.json and messages/en.json (symmetric, both languages)
- **14 keys used** in code (Navigation.* only, awaiting full UI implementation)
- **89 unused keys** in catalog (dashboard, approvals, evidence, etc. — for future modules)
- All tests passing, linting clean, typecheck clean

### How it works
1. Developers add t('Feature.key') in JSX
2. Run `pnpm i18n:check` locally → audit reports missing keys
3. Add keys to both tr.json and en.json
4. Push PR → GitHub workflow runs audit, comments on gaps, blocks merge if any
5. Build process runs pre-build hook → warns non-blocking

### Verification
- ✅ Audit tool detects missing keys (tested with test.missing)
- ✅ Reports all 3 gap types (missing TR, missing EN, unused)
- ✅ CI/CD gate functional
- ✅ Pre-build hook runs on pnpm build
- ✅ 4/4 unit tests passing

### Future scaling
1000+ key target will grow organically as UI modules activate. Current 103 is sufficient for MVP with Navigation implemented.

### Integration rules
- **No hardcoded UI text** — all user-facing strings use t()
- **Symmetric catalogs** — TR and EN must have identical key structures
- **Non-blocking build** — gaps warn but don't prevent deployment
- **All modules** — when new module activates, add its translations before activation

See TASK-MTPVCS6K7F1ME full report in docs/agent-results/TASK-MTPVCS6K7F1ME-cora.md
