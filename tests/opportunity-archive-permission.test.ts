import { describe, expect, it } from 'vitest';

import { ARCHIVE_ROLES, canArchiveOpportunity } from '@/lib/pipeline/archive';

/**
 * Who may archive an opportunity.
 *
 * The rule is enforced in `archiveOpportunity` (pipeline/actions.ts) and read again by
 * `pipeline/[id]/page.tsx` to decide whether to draw the button, so it is worth pinning here
 * rather than in either call site: archiving takes a card off every board and out of every KPI,
 * and there is no restore path in the product yet.
 */
describe('canArchiveOpportunity', () => {
  const ME = 'user-1';
  const SOMEONE_ELSE = 'user-2';

  it('lets the pipeline roles archive anything in the tenant', () => {
    for (const role of ARCHIVE_ROLES) {
      expect(canArchiveOpportunity(role, SOMEONE_ELSE, ME)).toBe(true);
      expect(canArchiveOpportunity(role, null, ME)).toBe(true);
    }
  });

  it('lets an ordinary member archive only what they own', () => {
    expect(canArchiveOpportunity('MEMBER', ME, ME)).toBe(true);
    expect(canArchiveOpportunity('MEMBER', SOMEONE_ELSE, ME)).toBe(false);
    expect(canArchiveOpportunity('WRITER', SOMEONE_ELSE, ME)).toBe(false);
    expect(canArchiveOpportunity('GUEST_PARTNER', SOMEONE_ELSE, ME)).toBe(false);
  });

  it('does not read "nobody owns it" as "everybody owns it"', () => {
    // An unowned opportunity is archivable by the pipeline roles and by no one else — a null
    // ownerId must never compare equal to a null-ish user id either.
    expect(canArchiveOpportunity('MEMBER', null, ME)).toBe(false);
    expect(canArchiveOpportunity('MEMBER', null, '')).toBe(false);
  });

  it('refuses an unknown role outright', () => {
    expect(canArchiveOpportunity('', SOMEONE_ELSE, ME)).toBe(false);
    expect(canArchiveOpportunity('SOMETHING_NEW', SOMEONE_ELSE, ME)).toBe(false);
    // …but still lets that role archive its own opportunity, like any other member.
    expect(canArchiveOpportunity('SOMETHING_NEW', ME, ME)).toBe(true);
  });
});
