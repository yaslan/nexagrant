import { describe, expect, it, vi } from 'vitest';

/**
 * The where-clause rule itself, with no database.
 *
 * The live file (tests/concept-template-tenant-scope.live.test.ts) proves the
 * leak end to end, but it skips itself on a machine with no Postgres — so the
 * rule also gets a unit test that always runs in the gate: a future edit that
 * drops the tenant arm back out of the clause reddens here too.
 */

const reader = vi.hoisted(() => ({
  conceptTemplate: { findFirst: vi.fn() },
}));

vi.mock('@/lib/db', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/db')>();
  return {
    assertTenantScope: actual.assertTenantScope,
    MissingTenantScopeError: actual.MissingTenantScopeError,
    prisma: reader,
  };
});

const {
  accessibleTemplateWhere,
  findAccessibleTemplate,
  findAccessibleTemplateByKey,
  templateSections,
} = await import('./templates');
const { MissingTenantScopeError } = await import('@/lib/db');

describe('accessibleTemplateWhere', () => {
  it('admits platform rows and the caller’s own rows, and nothing else', () => {
    expect(accessibleTemplateWhere('tenant-a')).toEqual({
      OR: [{ tenantId: null }, { tenantId: 'tenant-a' }],
    });
  });

  it.each([undefined, null, '', '   '])('refuses a tenantId of %o', (bad) => {
    // Not a wider query: Prisma drops an `undefined` field from a `where`
    // clause, which is exactly how the filter disappeared before.
    expect(() => accessibleTemplateWhere(bad as unknown as string)).toThrow(
      MissingTenantScopeError
    );
  });
});

describe('findAccessibleTemplate', () => {
  it('keeps the client-supplied id *and* the tenant arm in one where clause', async () => {
    reader.conceptTemplate.findFirst.mockResolvedValue({ id: 'tpl-1' });

    await findAccessibleTemplate('tpl-1', 'tenant-a');

    expect(reader.conceptTemplate.findFirst).toHaveBeenCalledWith({
      where: { id: 'tpl-1', OR: [{ tenantId: null }, { tenantId: 'tenant-a' }] },
    });
  });

  it('returns null rather than leaking the existence of another tenant’s row', async () => {
    reader.conceptTemplate.findFirst.mockResolvedValue(null);

    await expect(findAccessibleTemplate('tpl-of-b', 'tenant-a')).resolves.toBeNull();
  });
});

describe('findAccessibleTemplateByKey', () => {
  it('prefers the caller’s own row over the platform row of the same key', async () => {
    reader.conceptTemplate.findFirst.mockReset();
    reader.conceptTemplate.findFirst.mockResolvedValueOnce({ id: 'own', tenantId: 'tenant-a' });

    const found = await findAccessibleTemplateByKey('generic', 'tenant-a');

    expect(found).toEqual({ id: 'own', tenantId: 'tenant-a' });
    expect(reader.conceptTemplate.findFirst).toHaveBeenCalledTimes(1);
    expect(reader.conceptTemplate.findFirst).toHaveBeenCalledWith({
      where: { key: 'generic', tenantId: 'tenant-a' },
    });
  });

  it('falls back to the platform row, never to another tenant’s', async () => {
    reader.conceptTemplate.findFirst.mockReset();
    reader.conceptTemplate.findFirst
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({ id: 'platform', tenantId: null });

    const found = await findAccessibleTemplateByKey('generic', 'tenant-a');

    expect(found).toEqual({ id: 'platform', tenantId: null });
    expect(reader.conceptTemplate.findFirst).toHaveBeenLastCalledWith({
      where: { key: 'generic', tenantId: null },
    });
  });
});

describe('templateSections', () => {
  const sections = [{ key: 'summary', labelKey: 'Summary', maxWords: 50, promptKey: 'p' }];

  it('reads the bare-array shape prisma/seed.ts writes', () => {
    expect(templateSections(sections)).toEqual(sections);
  });

  it('reads the { sections } shape prisma/seed-templates.ts writes', () => {
    expect(templateSections({ sections })).toEqual(sections);
  });

  it.each([null, undefined, {}, 'nonsense', { sections: 'nonsense' }])(
    'returns [] for %o instead of throwing mid-render',
    (bad) => {
      expect(templateSections(bad)).toEqual([]);
    }
  );

  it('drops elements with no section key (İNCELEME-71 B-3)', () => {
    const junk = [null, 'x', 42, {}, { key: '', maxWords: 5 }, { key: 7 }];
    expect(templateSections(junk)).toEqual([]);
    expect(templateSections({ sections: [null, ...sections] })).toEqual(sections);
  });

  it('keeps a keyed section with no word limit — the DOCX export needs only key and labelKey', () => {
    expect(templateSections({ sections: [{ key: 'a', labelKey: 'A' }] })).toEqual([{ key: 'a', labelKey: 'A' }]);
  });
});
