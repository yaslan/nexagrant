import { describe, expect, it } from 'vitest';

import { editorSections } from '@/app/[locale]/(app)/[workspace]/concept-notes/[id]/data';

/**
 * TASK-MUNRB2037NA5V (İNCELEME-57 Ö-3) — the concept note page read
 * `template.schema.sections`, which is `undefined` for every seeded template
 * (prisma/seed.ts stores a bare array), and the editor's `sections[0]` threw.
 */
const seeded = [
  { key: 'excellence', labelKey: 'Excellence', maxWords: 1000, promptKey: 'Write the excellence section.' },
  { key: 'impact', labelKey: 'Impact', maxWords: 1000, promptKey: 'Write the impact section.' },
];

describe('editorSections', () => {
  it('reads a seeded template (bare array)', () => {
    expect(editorSections({ schema: seeded })).toEqual(seeded);
  });

  it('reads a { sections } template (prisma/seed-templates.ts)', () => {
    expect(editorSections({ schema: { sections: seeded } })).toEqual(seeded);
  });

  it('falls back to the default sections with no template or no readable sections', () => {
    for (const template of [null, { schema: undefined }, { schema: {} }, { schema: [] }, { schema: [null] }, { schema: [{ foo: 1 }] }, { schema: [{ key: 'a', labelKey: 'A' }] }, { schema: [{ key: 'b', maxWords: '5' }] }, { schema: [{ key: 'c', maxWords: 0 }] }, { schema: [{ key: 'd', maxWords: NaN }] }]) {
      const sections = editorSections(template);
      expect(sections.map((s) => s.key)).toEqual(['excellence', 'impact', 'implementation']);
    }
  });
});
