/**
 * Publish gate for the privacy notice (FO-170 / FO-140): may /privacy go live?
 *
 *   pnpm privacy:publish-check
 *
 * The notice carries bracketed placeholders for values nobody may invent (tax
 * office, MERSIS, VERBIS, effective date, the cross-border transfer mechanism,
 * the log retention period) and one demo value (the KEP address). The tests
 * only prove those are listed; this check is what refuses the release while
 * the list is not empty. It is deliberately NOT part of `pnpm gate`: dev may
 * carry placeholders, production may not — the dev→prod promotion runs it.
 *
 * Exit codes: 0 = nothing left to fill in. 1 = at least one blocker.
 */
import 'dotenv/config';

import { privacyPublishBlockers } from '../src/app/[locale]/(public)/privacy/structure';

const blockers = privacyPublishBlockers();
if (blockers.length === 0) {
  console.log('privacy:publish-check — OK, no placeholders or demo values left');
  process.exit(0);
}
console.error(`privacy:publish-check — ${blockers.length} blocker(s), /privacy must not go live:`);
for (const blocker of blockers) console.error(`  - ${blocker}`);
process.exit(1);
