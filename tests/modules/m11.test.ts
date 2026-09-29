import { describe, test, expect, vi, beforeEach } from 'vitest';
import {
  createApplicationPart,
  calculateLumpSumBudget,
  acquireSectionLock,
  releaseSectionLock,
  updateSectionContent,
  addSectionComment,
  resolveSectionComment,
  restoreSectionRevision,
  updatePresenceHeartbeat,
  generateSectionDraftAi,
} from '../../src/modules/m11/server/actions';
import { issuePartnerPortalLink } from '../../src/modules/m11/server/partner-link';
import { hashSecretToken } from '../../src/lib/secret-token';
import {
  DEFAULT_PART_B_SECTIONS,
  type PartContent,
  type SectionCommentItem,
  type SectionRevisionItem,
} from '../../src/modules/m11/types';
import { resetScope, setScope, FakeTenantScopeError } from '../helpers/tenant-scope-mock';

/**
 * The fake transactional client records the `where` clause of every read and
 * write, so the tests can assert the tenant id is actually in it — that is the
 * regression this module needed, not just "the content changed".
 */
/** The subset of an ApplicationPart row the fake client stores. */
type FakePart = {
  id: string;
  tenantId: string;
  opportunityId: string;
  part: string;
  magicTokenHash: string | null;
  content: PartContent;
};

/** The `where`/`data` clauses the fake client records, as the actions send them. */
type FakeWhere = { id?: string; tenantId?: string; part?: string };

const h = vi.hoisted(() => {
  const store: {
    part: FakePart | null;
    lastFindWhere: FakeWhere | null;
    lastUpdateWhere: FakeWhere | null;
  } = {
    part: null,
    lastFindWhere: null,
    lastUpdateWhere: null,
  };
  return { store };
});

const { store } = h;

function freshPart(): FakePart {
  return {
    id: 'part-111',
    tenantId: 'tenant-1',
    opportunityId: 'opp-11',
    part: 'PART_B',
    magicTokenHash: null,
    content: {
      budget: [],
      workPackages: [],
      sections: JSON.parse(JSON.stringify(DEFAULT_PART_B_SECTIONS)),
      revisions: [],
      comments: [],
      presence: [],
    },
  };
}

vi.mock('../../src/lib/tenant', async () => {
  const m = await import('../helpers/tenant-scope-mock');
  return m.tenantModuleStub();
});

vi.mock('../../src/lib/db', async () => {
  const m = await import('../helpers/tenant-scope-mock');
  return m.dbModuleStub({
    opportunity: {
      findFirst: vi.fn(async ({ where }: { where: FakeWhere }) =>
        where.tenantId === 'tenant-1' ? { id: where.id } : null
      ),
    },
    applicationPart: {
      create: vi.fn(async ({ data }: { data: Omit<FakePart, 'id'> }) => {
        h.store.part = {
          id: 'part-111',
          tenantId: data.tenantId,
          opportunityId: data.opportunityId,
          part: data.part,
          magicTokenHash: data.magicTokenHash ?? null,
          content: data.content,
        };
        return h.store.part;
      }),
      findFirst: vi.fn(async ({ where }: { where: FakeWhere }) => {
        h.store.lastFindWhere = where;
        if (!h.store.part) return null;
        return where.tenantId === h.store.part.tenantId && where.id === h.store.part.id
          ? h.store.part
          : null;
      }),
      updateMany: vi.fn(
        async ({ where, data }: { where: FakeWhere; data: { content?: PartContent; magicTokenHash?: string } }) => {
        h.store.lastUpdateWhere = where;
        if (!h.store.part) return { count: 0 };
        if (where.tenantId !== h.store.part.tenantId || where.id !== h.store.part.id) {
          return { count: 0 };
        }
        if (where.part !== undefined && where.part !== h.store.part.part) return { count: 0 };
        if (data.content !== undefined) h.store.part.content = data.content;
        if (data.magicTokenHash !== undefined) h.store.part.magicTokenHash = data.magicTokenHash;
        return { count: 1 };
      }),
    },
  });
});

/**
 * The row the fake client holds, asserted present. Every test that reaches for
 * it has already run an action that must have written it, so a missing row is a
 * test failure worth naming rather than a `!` that reports "cannot read
 * properties of null" three frames away.
 */
function storedPart(): FakePart {
  if (!store.part) throw new Error('the fake client holds no ApplicationPart row');
  return store.part;
}

/** The stored content's revisions, asserted present. */
function storedRevisions(): SectionRevisionItem[] {
  const revisions = storedPart().content.revisions;
  if (!revisions) throw new Error('the stored part has no revisions');
  return revisions;
}

/** The stored content's comments, asserted present. */
function storedComments(): SectionCommentItem[] {
  const comments = storedPart().content.comments;
  if (!comments) throw new Error('the stored part has no comments');
  return comments;
}

beforeEach(() => {
  resetScope();
  store.part = freshPart();
  store.lastFindWhere = null;
  store.lastUpdateWhere = null;
});

describe('M11 Application Production & Collaborative Editing Module', () => {
  test('createApplicationPart creates Part B with standard 8 Horizon Europe sections', async () => {
    const part = await createApplicationPart('opp-11', 'PART_B');
    expect(part).toBeDefined();
    expect(part.part).toBe('PART_B');
    const content = part?.content as unknown as PartContent | null;
    expect(content?.sections).toHaveLength(8);
    // TASK-MULQLL2T8ZJX4 — no portal token is minted at creation; it is issued
    // on demand and only its hash is stored.
    expect(storedPart().magicTokenHash).toBeNull();
  });

  test('issuePartnerPortalLink returns the raw token once and stores only its hash', async () => {
    store.part = { ...freshPart(), part: 'PART_A' };

    const first = await issuePartnerPortalLink('part-111');
    expect(first?.token).toMatch(/^[0-9a-f]{64}$/);
    expect(storedPart().magicTokenHash).toBe(hashSecretToken(first!.token));
    expect(storedPart().magicTokenHash).not.toBe(first!.token);
    expect(store.lastUpdateWhere).toEqual({ id: 'part-111', tenantId: 'tenant-1', part: 'PART_A' });

    // Issuing again replaces the hash: the previous link is revoked.
    const second = await issuePartnerPortalLink('part-111');
    expect(second?.token).not.toBe(first!.token);
    expect(storedPart().magicTokenHash).toBe(hashSecretToken(second!.token));
  });

  test('issuePartnerPortalLink refuses Part B and another tenant\'s part', async () => {
    // freshPart() is PART_B.
    await expect(issuePartnerPortalLink('part-111')).resolves.toBeNull();
    expect(storedPart().magicTokenHash).toBeNull();

    store.part = { ...freshPart(), part: 'PART_A', tenantId: 'tenant-2' };
    await expect(issuePartnerPortalLink('part-111')).resolves.toBeNull();
    expect(storedPart().magicTokenHash).toBeNull();

    setScope(null);
    await expect(issuePartnerPortalLink('part-111')).rejects.toBeInstanceOf(FakeTenantScopeError);
  });

  test('calculateLumpSumBudget computes 25% overhead and direct personnel cost', async () => {
    const total = await calculateLumpSumBudget(12, 1.0, 0, 2000);
    // Base 5500 * 12 = 66000 direct personnel. Travel 2000. Overhead (66000 + 2000) * 0.25 = 17000. Total = 85000
    expect(total).toBe(85000);
  });

  test('acquireSectionLock acquires exclusive lock for active author', async () => {
    const lockRes = await acquireSectionLock(
      'part-111',
      '1.1_objectives',
      'usr-me',
      'Dr. Mehmet Yılmaz',
      'Fabrika Ar-Ge'
    );
    expect(lockRes.success).toBe(true);

    // Another user tries to lock within 60s
    const secondLock = await acquireSectionLock(
      'part-111',
      '1.1_objectives',
      'usr-klaus',
      'Prof. Klaus Müller',
      'Fraunhofer Institute'
    );
    expect(secondLock.success).toBe(false);
  });

  test('releaseSectionLock frees lock for other co-authors', async () => {
    const unlockRes = await releaseSectionLock('part-111', '1.1_objectives', 'usr-me');
    expect(unlockRes.success).toBe(true);
  });

  test('updateSectionContent saves content and records timestamped revision history', async () => {
    const updateRes = await updateSectionContent(
      'part-111',
      '1.1_objectives',
      'Updated section 1.1 text with new SMART objectives and TRL 7 progression notes.',
      'usr-me',
      'Dr. Mehmet Yılmaz',
      'Fabrika Ar-Ge'
    );
    expect(updateRes.success).toBe(true);
    expect(updateRes.wordCount).toBeGreaterThan(5);
    expect(storedRevisions().length).toBeGreaterThan(0);
  });

  test('addSectionComment and resolveSectionComment manage review threads', async () => {
    const comment = await addSectionComment(
      'part-111',
      '1.1_objectives',
      'Prof. Klaus Müller',
      'Fraunhofer Institute',
      'Lütfen SO3 demo sahalarını netleştirin.'
    );
    expect(comment.id).toBeDefined();
    expect(comment.resolved).toBe(false);

    const resolveRes = await resolveSectionComment('part-111', '1.1_objectives', comment.id);
    expect(resolveRes.success).toBe(true);
    expect(storedComments()[0]?.resolved).toBe(true);
  });

  test('restoreSectionRevision restores earlier snapshot content', async () => {
    // Produce a revision first: the store is reset between tests.
    await updateSectionContent(
      'part-111',
      '1.1_objectives',
      'Original section 1.1 text used as the restore target.',
      'usr-me',
      'Dr. Mehmet Yılmaz',
      'Fabrika Ar-Ge'
    );

    const revId = storedRevisions()[0]!.id;
    const restoreRes = await restoreSectionRevision('part-111', '1.1_objectives', revId);
    expect(restoreRes.success).toBe(true);
  });

  test('every part read and write carries the session tenant id', async () => {
    await updateSectionContent(
      'part-111',
      '1.1_objectives',
      'Some text.',
      'usr-me',
      'Dr. Mehmet Yılmaz',
      'Fabrika Ar-Ge'
    );

    expect(store.lastFindWhere).toEqual({ id: 'part-111', tenantId: 'tenant-1' });
    expect(store.lastUpdateWhere).toEqual({ id: 'part-111', tenantId: 'tenant-1' });
  });

  test('a part belonging to another tenant is neither read nor written', async () => {
    storedPart().tenantId = 'tenant-other';
    const before = JSON.stringify(storedPart().content);

    await updateSectionContent(
      'part-111',
      '1.1_objectives',
      'Injected text from a different workspace.',
      'usr-attacker',
      'Attacker',
      'Elsewhere'
    );

    // The action reports its own success flag, but nothing was persisted.
    expect(JSON.stringify(storedPart().content)).toBe(before);
  });

  test('a session with no tenant is refused instead of falling back', async () => {
    setScope(null);

    await expect(createApplicationPart('opp-11', 'PART_B')).rejects.toBeInstanceOf(
      FakeTenantScopeError
    );
  });

  test('updatePresenceHeartbeat registers active co-author session', async () => {
    const presence = await updatePresenceHeartbeat(
      'part-111',
      'usr-sofia',
      'Dr. Sofia Rossi',
      'Politecnico di Milano',
      '2.1_pathways'
    );
    expect(presence.length).toBeGreaterThan(0);
    const sofia = presence.find((p) => p.userId === 'usr-sofia');
    expect(sofia).toBeDefined();
    expect(sofia?.activeSection).toBe('2.1_pathways');
  });

  test('generateSectionDraftAi generates Horizon Europe evaluator-aligned structure', async () => {
    const draft = await generateSectionDraftAi(
      'part-111',
      '1.1_objectives',
      '1.1 Objectives and Ambition',
      'Zero-Emission Thermal Batteries'
    );
    expect(draft).toContain('Strategic Relevance');
    expect(draft).toContain('Beyond State-of-the-Art');
    expect(draft).toContain('KPI-1');
  });
});

