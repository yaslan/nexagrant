import { describe, expect, it, vi } from 'vitest';

/**
 * board.tsx is a client component; importing it pulls in its server-action
 * module, which reaches next-auth and fails to resolve under vitest. Only the
 * pure updater is under test here, so the action surface is stubbed away.
 */
vi.mock('@/app/[locale]/(app)/[workspace]/pipeline/actions', () => ({
  moveOpportunityStage: vi.fn(),
  createOpportunity: vi.fn(),
  assignOpportunityOwner: vi.fn(),
  addOpportunityNote: vi.fn(),
  getOpportunityFormMembers: vi.fn(),
  getSuggestedTopics: vi.fn(),
}));

import { clearNoteText, type NoteInput } from '@/app/[locale]/(app)/[workspace]/pipeline/board';

/**
 * TASK-MTVPOR2CMV1RT — after a note was posted, the board cleared that card's
 * draft with `{ ...prev[oppId], text: '' }`.
 *
 * `prev[oppId]` is `NoteInput | undefined`. Spreading the undefined case yields
 * `{ text: '' }` — a record with NO `authorId` — written straight back into
 * state typed `Record<string, { text: string; authorId: string }>`.
 *
 * The damage is downstream and silent. The card body reads
 * `noteInputs[opp.id] || { text: '', authorId: members[0]?.id ?? '' }`; a
 * `{ text: '' }` object is truthy, so that repair fallback does NOT fire, and
 * `cardNoteInput.authorId` arrives at the author `<select value={...}>` as
 * `undefined` — React then downgrades a controlled select to an uncontrolled
 * one. `handleAddNote` reads the same missing field through
 * `members.find((m) => m.id === cardInput.authorId) || members[0]`, so the next
 * note on that card is attributed to the FIRST member instead of the chosen one.
 *
 * The shape stays total on purpose: `authorId` is required, not optional.
 * Making it optional would legalise exactly the `value={undefined}` that breaks
 * the controlled select, and the `|| { text: '', authorId }` fallback already
 * proves the rest of the component assumes every entry is complete.
 */
describe('clearNoteText', () => {
  it('keeps the card author when an entry already exists', () => {
    const prev: Record<string, NoteInput> = {
      'opp-1': { text: 'draft note', authorId: 'user-elif' },
    };
    const next = clearNoteText(prev, 'opp-1', 'user-fallback');

    expect(next['opp-1']).toEqual({ text: '', authorId: 'user-elif' });
  });

  it('fills authorId from the fallback when no entry exists yet', () => {
    const next = clearNoteText({}, 'opp-1', 'user-fallback');

    // The regression produced `{ text: '' }` with authorId absent, which is what
    // reached the controlled <select> as `value={undefined}`.
    expect(next['opp-1']).toEqual({ text: '', authorId: 'user-fallback' });
    expect(typeof next['opp-1']?.authorId).toBe('string');
  });

  it('leaves other cards untouched', () => {
    const prev: Record<string, NoteInput> = {
      'opp-1': { text: 'a', authorId: 'user-a' },
      'opp-2': { text: 'b', authorId: 'user-b' },
    };
    const next = clearNoteText(prev, 'opp-1', 'user-fallback');

    expect(next['opp-2']).toEqual({ text: 'b', authorId: 'user-b' });
  });
});
