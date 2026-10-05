---
name: i18n-system
description: Fabrika's i18n setup with next-intl, message structure, and audit tooling
metadata:
  type: project
  updatedAt: 2026-09-06
---

## i18n Architecture

Fabrika uses **next-intl** for bilingual UI (Turkish + English).

### Message File Structure

**Location:** `messages/{tr,en}.json`

**Format:** Hierarchical JSON with dot-notation when flattened:
```json
{
  "Navigation": { "dashboard": "...", "calls": "..." },
  "Common": { "save": "...", "cancel": "..." }
}
```

Flattened keys: `Navigation.dashboard`, `Navigation.calls`, `Common.save`, etc.

### Usage Pattern

1. Import hook in client component:
   ```tsx
   import { useTranslations } from 'next-intl';
   
   export default function MyComponent() {
     const t = useTranslations('Navigation'); // namespace scoping
     return <span>{t('dashboard')}</span>; // resolves to Navigation.dashboard
   }
   ```

2. Namespaced `t()` calls automatically resolve within their scope—don't prefix keys.

### Audit Tool (`scripts/i18n-check.ts`)

**Purpose:** Prevent hardcoded strings and ensure complete translations before merge.

**What it does:**
- Scans `src/` for all `.ts` and `.tsx` files
- Extracts `t('key')` calls using regex
- Tracks namespace from `useTranslations('Namespace')`
- Matches full keys (e.g., `Navigation.dashboard`) against flattened message files
- Reports missing, unused, and incomplete translations
- Outputs JSON (CI-parseable) + human-readable summary

**Exit codes:**
- **0:** All used keys present in both languages ✅
- **1:** Missing or inconsistent keys (block merge)

**Running the audit:**
```bash
npx ts-node scripts/i18n-check.ts
```

### Current State (2026-09-06)

- **14 keys in use** (all present, ready for MVP)
- **103 keys defined** in each message file (96 unused, for future modules M3–M11)
- **0 missing keys** (all used keys have both TR/EN translations)

### Onboarding a New i18n Key

1. **Add to both message files:**
   ```json
   // messages/tr.json & messages/en.json
   "FeatureName": {
     "actionKey": "Turkish text / English text"
   }
   ```

2. **Use in component (inside useTranslations block):**
   ```tsx
   const t = useTranslations('FeatureName');
   <button>{t('actionKey')}</button>
   ```

3. **Run audit before PR:**
   ```bash
   npx ts-node scripts/i18n-check.ts
   ```
   Should show 0 missing keys.

### Rules

- **No hardcoded locale checks in UI** — use i18n keys instead of `locale === 'tr' ? '...' : '...'`
- **Namespace all new keys** — don't pollute root level
- **Symmetry mandatory** — if a key exists in TR, it must exist in EN
- **Audit gates PRs** — failing audit blocks merge (exit code 1)

### Unused Keys (Available for Future)

```
Approvals.* (16)      — M4 approval workflows
Auth.* (3)            — user auth strings (currently hardcoded elsewhere)
Common.* (14)         — reusable UI buttons/labels
ConceptNote.* (6)     — M3 concept note UI
Consortium.* (3)      — M5 consortium builder
Dashboard.* (9)       — statistics & summaries
Evidence.* (5)        — M1 evidence pack UI
GDPR.* (6)            — privacy/compliance
Pipeline.* (4)        — M2 pipeline flow
Relationships.* (7)   — M6 relationship manager
Theme.* (3)           — appearance toggles
```

These can be populated as modules ship without requiring audit changes.

### Future Improvements

- [ ] Add i18n-check to pre-commit hook (`.git/hooks/pre-commit`)
- [ ] Add to CI pipeline (GitHub Actions)
- [ ] Consider lazy-loading message files per locale
- [ ] i18n validation in build pipeline
