// @vitest-environment jsdom
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';

import type { PartBSectionItem } from '@/modules/m11/types';

vi.mock('@/modules/m11/server/actions', () => ({
  acquireSectionLock: vi.fn(async () => ({ success: true })),
  releaseSectionLock: vi.fn(async () => ({ success: true })),
  updateSectionContent: vi.fn(async () => ({ success: true })),
  addSectionComment: vi.fn(async () => ({ success: true })),
  resolveSectionComment: vi.fn(async () => ({ success: true })),
  restoreSectionRevision: vi.fn(async () => ({ success: true })),
  updatePresenceHeartbeat: vi.fn(async () => ({ success: true })),
  generateSectionDraftAi: vi.fn(async () => 'ai draft'),
}));

const { PartBCollaborativeEditor } = await import('@/modules/m11/ui/PartBCollaborativeEditor');

/**
 * The Part B editor's edit buffer after TASK-MTQV1JYGMGU6V.
 *
 * The buffer and the save indicator used to be two extra pieces of state that an effect copied
 * into on every section change (`react-hooks/set-state-in-effect`, suppressed with an inline
 * exception). Both are derived during render now: the buffer is tagged with the section it
 * belongs to, and the indicator compares it against the section's saved content. These tests
 * pin the user-visible consequences so the derivation cannot silently regress into a copy.
 */
const SECTIONS: PartBSectionItem[] = [
  {
    key: '1.1_objectives',
    partGroup: '1_EXCELLENCE',
    title: '1.1 Objectives and Ambition',
    targetPages: 6,
    maxWords: 3000,
    content: 'Objectives body',
  },
  {
    key: '1.2_methodology',
    partGroup: '1_EXCELLENCE',
    title: '1.2 Methodology',
    targetPages: 8,
    maxWords: 4000,
    content: 'Methodology body',
  },
];

function renderEditor() {
  return render(
    <PartBCollaborativeEditor
      partId="part-1"
      opportunityTitle="HORIZON-CL5-2026-D2-01"
      tenantId="tenant-1"
      initialSections={SECTIONS}
      initialRevisions={[]}
      initialComments={[]}
    />
  );
}

const editor = () => screen.getByRole('textbox') as HTMLTextAreaElement;
const selectSection = (title: string) =>
  fireEvent.click(screen.getByText(title).closest('button')!);

describe('PartBCollaborativeEditor edit buffer', () => {
  beforeEach(() => {
    vi.useFakeTimers({ shouldAdvanceTime: false });
  });

  afterEach(() => {
    cleanup();
    vi.useRealTimers();
  });

  it('shows the active section content and reports it synchronised', () => {
    renderEditor();

    expect(editor().value).toBe('Objectives body');
    expect(screen.getByText('Senkronize')).toBeTruthy();
  });

  it('flags an edited buffer as unsaved without an effect writing the flag', () => {
    renderEditor();

    fireEvent.change(editor(), { target: { value: 'Objectives body — revised' } });

    expect(screen.getByText('Değişiklik var...')).toBeTruthy();
    expect(screen.queryByText('Senkronize')).toBeNull();
  });

  it('swaps to the newly selected section instead of carrying the old text over', () => {
    renderEditor();

    fireEvent.change(editor(), { target: { value: 'Objectives body — revised' } });
    selectSection('1.2 Methodology');

    expect(editor().value).toBe('Methodology body');
    // The other section's unsaved text must not make this one look dirty.
    expect(screen.getByText('Senkronize')).toBeTruthy();
  });

  it('keeps the unsaved buffer when the user comes back to that section', () => {
    renderEditor();

    fireEvent.change(editor(), { target: { value: 'Objectives body — revised' } });
    selectSection('1.2 Methodology');
    selectSection('1.1 Objectives and Ambition');

    expect(editor().value).toBe('Objectives body — revised');
    expect(screen.getByText('Değişiklik var...')).toBeTruthy();
  });
});
