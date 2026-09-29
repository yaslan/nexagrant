import { afterAll, beforeAll, beforeEach, describe, expect, test, vi } from 'vitest';
import type { PrismaClient } from '@prisma/client';
import { envValue } from './helpers/dotenv';
import { assertRlsSubjectRole, requireRlsTestUrl, skipOrFailInCi } from './helpers/live-db-role';
import { requireId } from './helpers/teardown-guard';

/**
 * TASK-MUN2KUHP1BP18 (İNCELEME-27 B-1) — a server action handed no id must
 * refuse and leave the tenant's rows as they were.
 *
 * Prisma drops a `where` key whose value is `undefined`, so before the fix
 * `saveConceptNoteDraft(undefined, x)` wrote `x` into every concept note of
 * the tenant, `acquireSectionLock(undefined, …)` copied one part over every
 * part, `signDocument(undefined)` signed every document, and so on. React's
 * Flight encoding carries `$undefined`, so any member can send that.
 *
 * Every action below runs for real against the database over `fabrika_app`
 * (NOBYPASSRLS, asserted): RLS keeps the damage inside the tenant, it does not
 * stop it, which is the point being measured. Only the session and
 * `revalidatePath` are replaced. For each action and each of `undefined`,
 * `null` and `""` the test checks the answer is a refusal and that a snapshot
 * of the tenant's rows in every table these actions write is unchanged. One
 * call per table with a real id then proves the path writes when it should, so
 * an unchanged snapshot is not the result of a path that never reached the DB.
 *
 * `.live`: needs the docker-compose Postgres and `pnpm db:rls-role`. Locally a
 * missing database skips the file; in CI it fails (tests/helpers/live-db-role.ts).
 */

const SUITE = 'action-missing-id.live';
const RLS_URL = envValue('DATABASE_URL_RLS_TEST');
const ADMIN_URL = envValue('DATABASE_URL');
const RUN = `mid-${Date.now().toString(36)}`;

const state = vi.hoisted(() => ({
  rls: undefined as PrismaClient | undefined,
  scope: {
    tenantId: '',
    userId: '',
    role: 'TENANT_OWNER',
    workspaceIds: [] as string[],
    isPlatformAdmin: false,
  },
}));

vi.mock('@/lib/tenant', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/tenant')>();
  return {
    ...actual,
    requireTenantAction: async () => state.scope,
    requireTenantApi: async () => ({ ok: true, scope: state.scope }),
    tenantScopeOf: () => state.scope,
    assertTenantActionWritable: async () => {},
  };
});
vi.mock('@/lib/auth', () => ({
  auth: async () => ({ user: { id: state.scope.userId, email: `${RUN}@example.invalid`, name: 'Owner' } }),
}));
vi.mock('@/lib/db', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/db')>();
  return {
    ...actual,
    withTenant: (tenantId: string, cb: Parameters<typeof actual.withTenant>[1]) =>
      actual.withTenantOn(state.rls!, tenantId, cb),
  };
});
vi.mock('next/cache', () => ({ revalidatePath: () => {}, revalidateTag: () => {} }));

const { createDbClient } = await import('@/lib/db');
const m11 = await import('@/modules/m11/server/actions');
const { issuePartnerPortalLink } = await import('@/modules/m11/server/partner-link');
const { saveConceptNoteDraft } = await import('@/modules/m2/server/actions');
const { updateNoteStatus } = await import('@/app/[locale]/(app)/[workspace]/concept-notes/actions');
const m10 = await import('@/modules/m10/server/actions');
const evidence = await import('@/app/[locale]/(app)/[workspace]/evidence/actions');
const pipeline = await import('@/app/[locale]/(app)/[workspace]/pipeline/actions');
const consortium = await import('@/app/[locale]/(app)/[workspace]/pipeline/[id]/consortium/actions');
const m8 = await import('@/modules/m8/server/actions');
const { updateRelationship } = await import('@/app/[locale]/(app)/[workspace]/relationships/actions');
const { updateNextStep } = await import('@/modules/m4/server/actions');
const { disconnectCalendar } = await import('@/modules/m9/server/calendar-actions');
const { revokeApiKey } = await import('@/app/[locale]/(app)/[workspace]/settings/api-keys/actions');
const savedSearch = await import('@/app/api/saved-searches/[id]/route');
const { evaluateGate, GateOpportunityNotFoundError } = await import('@/lib/gates/evaluate');

let admin: PrismaClient | undefined;
let ready = false;
let skipReason = '';
let tenantId = '';
const ids = {
  opp: [] as string[],
  part: [] as string[],
  partA: '',
  note: [] as string[],
  doc: [] as string[],
  evidence: [] as string[],
  seat: [] as string[],
  rel: [] as string[],
  search: '',
  calendar: '',
  apiKey: '',
};

const MISSING = [undefined, null, ''] as const;
const missing = (v: (typeof MISSING)[number]) => v as unknown as string;

/** Every row these actions write, for the test tenant, in a stable order. */
async function snapshot(): Promise<string> {
  const t = requireId(tenantId, 'tenantId');
  const by = { orderBy: { id: 'asc' as const } };
  const rows = {
    opportunity: await admin!.opportunity.findMany({ where: { tenantId: t }, ...by }),
    applicationPart: await admin!.applicationPart.findMany({ where: { tenantId: t }, ...by }),
    conceptNote: await admin!.conceptNote.findMany({ where: { tenantId: t }, ...by }),
    followupDoc: await admin!.followupDoc.findMany({ where: { tenantId: t }, ...by }),
    dualApprovalStep: await admin!.dualApprovalStep.findMany({ where: { tenantId: t }, ...by }),
    evidence: await admin!.evidence.findMany({ where: { tenantId: t }, ...by }),
    consortiumSeat: await admin!.consortiumSeat.findMany({ where: { tenantId: t }, ...by }),
    seatCandidate: await admin!.seatCandidate.findMany({ where: { tenantId: t }, ...by }),
    relationship: await admin!.relationship.findMany({ where: { tenantId: t }, ...by }),
    savedSearch: await admin!.savedSearch.findMany({ where: { tenantId: t }, ...by }),
    calendarConnection: await admin!.calendarConnection.findMany({ where: { tenantId: t }, ...by }),
    apiKey: await admin!.apiKey.findMany({ where: { tenantId: t }, ...by }),
  };
  return JSON.stringify(rows, (_k, v) => (typeof v === 'bigint' ? v.toString() : v));
}

/** Runs `call` and returns its answer, or the error it threw — either way, a refusal to inspect. */
async function outcome(call: () => Promise<unknown>): Promise<unknown> {
  try {
    return await call();
  } catch (e) {
    return { threw: e instanceof Error ? e.message : String(e) };
  }
}

beforeAll(async () => {
  const rlsUrl = requireRlsTestUrl(RLS_URL, SUITE);
  if (!ADMIN_URL) skipOrFailInCi(SUITE, 'DATABASE_URL is not set');
  if (!rlsUrl || !ADMIN_URL) {
    skipReason = 'DATABASE_URL_RLS_TEST / DATABASE_URL not set. Run `pnpm db:rls-role`.';
    return;
  }
  state.rls = createDbClient(rlsUrl);
  admin = createDbClient(ADMIN_URL);
  try {
    await state.rls.$connect();
  } catch (e) {
    skipReason = `database unavailable: ${e instanceof Error ? e.message : String(e)}`;
    skipOrFailInCi(SUITE, skipReason);
    return;
  }
  await assertRlsSubjectRole(state.rls, SUITE);

  const t = await admin.tenant.create({
    data: { name: `${RUN} Kurum`, slug: RUN, country: 'TR', kind: 'ORGANIZATION' },
    select: { id: true },
  });
  tenantId = t.id;
  const user = await admin.user.create({ data: { email: `${RUN}@example.invalid`, name: 'Owner' } });
  state.scope = { ...state.scope, tenantId, userId: user.id };
  const ws = await admin.workspace.create({ data: { tenantId, name: RUN, slug: RUN } });

  for (const i of [1, 2, 3]) {
    const opp = await admin.opportunity.create({
      data: { tenantId, workspaceId: ws.id, title: `${RUN} opp-${i}` },
    });
    ids.opp.push(opp.id);
  }
  const [opp1] = ids.opp as [string];
  for (const i of [1, 2, 3]) {
    const part = await admin.applicationPart.create({
      data: {
        tenantId,
        opportunityId: ids.opp[i - 1]!,
        part: 'PART_B',
        content: { marker: `part-${i}`, sections: [{ key: 'excellence', title: 'E', content: `text-${i}` }] },
      },
    });
    ids.part.push(part.id);
    const note = await admin.conceptNote.create({
      data: { tenantId, opportunityId: opp1, templateId: 't', content: { marker: `note-${i}` }, createdBy: user.id },
    });
    ids.note.push(note.id);
    const doc = await admin.followupDoc.create({ data: { tenantId, opportunityId: opp1, kind: 'NDA' } });
    ids.doc.push(doc.id);
    const ev = await admin.evidence.create({
      data: { tenantId, kind: 'corporate', title: `${RUN} ev-${i}`, body: `body-${i}` },
    });
    ids.evidence.push(ev.id);
    const seat = await admin.consortiumSeat.create({ data: { tenantId, opportunityId: opp1, roleKey: `role-${i}` } });
    ids.seat.push(seat.id);
    await admin.seatCandidate.create({
      data: { tenantId, seatId: seat.id, organizationId: `${RUN}-org-${i}`, score: i, breakdown: {}, rank: 1 },
    });
    const rel = await admin.relationship.create({ data: { tenantId, kind: 'partner', notes: `rel-${i}` } });
    ids.rel.push(rel.id);
  }
  ids.partA = (
    await admin.applicationPart.create({
      data: { tenantId, opportunityId: opp1, part: 'PART_A', content: { marker: 'part-a' } },
    })
  ).id;
  ids.search = (
    await admin.savedSearch.create({ data: { tenantId, userId: user.id, name: `${RUN} s`, filters: {} } })
  ).id;
  ids.calendar = (
    await admin.calendarConnection.create({ data: { tenantId, userId: user.id, provider: 'ics' } })
  ).id;
  ids.apiKey = (
    await admin.apiKey.create({
      data: { tenantId, name: `${RUN} key`, prefix: RUN.slice(0, 8), keyHash: `${RUN}-hash` },
    })
  ).id;
  ready = true;
});

beforeEach((ctx) => {
  if (!ready) ctx.skip(skipReason);
});

afterAll(async () => {
  if (admin && tenantId) {
    // Cascades to the workspace, its opportunities and everything hanging off them.
    for (const model of [
      admin.seatCandidate,
      admin.dualApprovalStep,
      admin.conceptNote,
      admin.evidence,
      admin.relationship,
      admin.savedSearch,
      admin.calendarConnection,
      admin.apiKey,
      admin.auditEvent,
      admin.gateDecision,
    ] as unknown as Array<{ deleteMany: (a: object) => Promise<unknown> }>) {
      await model.deleteMany({ where: { tenantId: requireId(tenantId, 'tenantId') } }).catch(() => {});
    }
    await admin.tenant.delete({ where: { id: tenantId } }).catch(() => {});
    await admin.user.deleteMany({ where: { email: `${RUN}@example.invalid` } }).catch(() => {});
  }
  await Promise.all([state.rls, admin].map((c) => c?.$disconnect().catch(() => {})));
});

/** [label, call with a missing id, answer that counts as a refusal] */
type Case = [string, (id: string) => Promise<unknown>, (answer: unknown) => boolean];

const refused = (a: unknown) =>
  a === null ||
  (Array.isArray(a) && a.length === 0) ||
  (typeof a === 'object' && a !== null && ('threw' in a || (a as { success?: unknown }).success === false));

const CASES: Case[] = [
  ['m11 acquireSectionLock', (id) => m11.acquireSectionLock(id, 'excellence', 'u', 'n', 'o'), refused],
  ['m11 releaseSectionLock', (id) => m11.releaseSectionLock(id, 'excellence', 'u'), refused],
  ['m11 updateSectionContent', (id) => m11.updateSectionContent(id, 'excellence', 'overwritten', 'u', 'n', 'o'), refused],
  ['m11 resolveSectionComment', (id) => m11.resolveSectionComment(id, 'excellence', 'c'), refused],
  ['m11 restoreSectionRevision', (id) => m11.restoreSectionRevision(id, 'excellence', 'r'), refused],
  // These answer with a default rather than a refusal; the snapshot is what counts.
  ['m11 addSectionComment', (id) => m11.addSectionComment(id, 'excellence', 'n', 'o', 'hi'), () => true],
  ['m11 updatePresenceHeartbeat', (id) => m11.updatePresenceHeartbeat(id, 'u', 'n', 'o', 'excellence'), () => true],
  ['m11 addBudgetLine', (id) => m11.addBudgetLine(id, 'P', 1), refused],
  ['m11 addWorkPackage', (id) => m11.addWorkPackage(id, { code: 'WP9', title: 't', leadPartner: 'p', startMonth: 1, endMonth: 2 }), refused],
  ['m11 issuePartnerPortalLink', (id) => issuePartnerPortalLink(id), refused],
  ['m2 saveConceptNoteDraft', (id) => saveConceptNoteDraft(id, { overwritten: 'yes' } as never), refused],
  ['concept-notes updateNoteStatus', (id) => updateNoteStatus(id, 'approved'), refused],
  ['m10 signDocument', (id) => m10.signDocument(id), refused],
  ['m10 createNewVersion', (id) => m10.createNewVersion(id), refused],
  ['m10 submitDualApprovalAction', (id) => m10.submitDualApprovalAction(id), refused],
  ['m10 departmentApproveAction', (id) => m10.departmentApproveAction(id, 'TECHNICAL' as never), refused],
  ['evidence verifyEvidenceAction', (id) => evidence.verifyEvidenceAction(id, 'verified'), refused],
  ['evidence deleteEvidence', (id) => evidence.deleteEvidence(id), refused],
  ['pipeline assignOpportunityOwner', (id) => pipeline.assignOpportunityOwner({ opportunityId: id, ownerId: 'x', ownerName: 'X' }), refused],
  ['pipeline moveOpportunityStage', (id) => pipeline.moveOpportunityStage(id, 'G3' as never), refused],
  ['pipeline archiveOpportunity', (id) => pipeline.archiveOpportunity({ opportunityId: id }), refused],
  ['pipeline evaluateOpportunityGate', (id) => pipeline.evaluateOpportunityGate({ opportunityId: id, gate: 'G1' } as never), refused],
  ['consortium assignSeat', (id) => consortium.assignSeat(id, `${RUN}-org-1`), refused],
  ['consortium findCandidates', (id) => consortium.findCandidates(id), refused],
  ['m8 inviteCandidateToSeat (seat)', (id) => m8.inviteCandidateToSeat(id, `${RUN}-org-1`, ids.opp[0]!), refused],
  ['m8 inviteCandidateToSeat (opportunity)', (id) => m8.inviteCandidateToSeat(ids.seat[0]!, `${RUN}-org-1`, id), refused],
  ['m8 confirmSeatAssignment (seat)', (id) => m8.confirmSeatAssignment(id, ids.opp[0]!), refused],
  ['m8 confirmSeatAssignment (opportunity)', (id) => m8.confirmSeatAssignment(ids.seat[0]!, id), refused],
  ['m8 computeSeatCandidates', (id) => m8.computeSeatCandidates(ids.opp[0]!, id), refused],
  ['relationships updateRelationship', (id) => updateRelationship(id, { notes: 'overwritten' }), refused],
  ['m4 updateNextStep', (id) => updateNextStep(id, 'overwritten', null), refused],
  ['m9 disconnectCalendar', (id) => disconnectCalendar(id), refused],
  ['api-keys revokeApiKey', (id) => revokeApiKey(id), refused],
];

describe('a server action with no id refuses and changes no row of the tenant', () => {
  test.each(CASES)('%s', async (_label, call, isRefusal) => {
    for (const value of MISSING) {
      const before = await snapshot();
      const answer = await outcome(() => call(missing(value)));
      expect(isRefusal(answer), `${JSON.stringify(value)} → ${JSON.stringify(answer)}`).toBe(true);
      expect(await snapshot(), `${JSON.stringify(value)} changed rows`).toBe(before);
    }
  });

  test('saved-search PATCH and DELETE answer 400 with no id and change nothing', async () => {
    for (const value of MISSING) {
      const before = await snapshot();
      const params = Promise.resolve({ id: missing(value) });
      const patch = await savedSearch.PATCH(
        new Request('http://localhost/api/saved-searches/x', { method: 'PATCH', body: JSON.stringify({ notify: true }) }),
        { params }
      );
      const del = await savedSearch.DELETE(new Request('http://localhost/api/saved-searches/x', { method: 'DELETE' }), {
        params,
      });
      expect([patch.status, del.status]).toEqual([400, 400]);
      expect(await snapshot()).toBe(before);
    }
  });
});

describe('evaluateGate, the engine under evaluateOpportunityGate (İNCELEME-27 Ö-3)', () => {
  test('refuses a missing opportunity id before reading or writing', async () => {
    for (const value of MISSING) {
      const before = await snapshot();
      const decisions = await admin!.gateDecision.count({ where: { tenantId: requireId(tenantId, 'tenantId') } });
      await expect(evaluateGate(missing(value), 'G1', tenantId, 'u')).rejects.toBeInstanceOf(GateOpportunityNotFoundError);
      expect(await admin!.gateDecision.count({ where: { tenantId: requireId(tenantId, 'tenantId') } })).toBe(decisions);
      expect(await snapshot()).toBe(before);
    }
  });
});

describe('the same paths still write one row when given a real id', () => {
  test('m11, m2, m10, evidence, pipeline, relationships each change exactly the addressed row', async () => {
    const t = requireId(tenantId, 'tenantId');
    const [part1, part2] = ids.part as [string, string];
    await m11.updateSectionContent(part1, 'excellence', 'written', 'u', 'n', 'o');
    const parts = await admin!.applicationPart.findMany({ where: { tenantId: t, part: 'PART_B' }, orderBy: { id: 'asc' } });
    const texts = parts.map((p) => (p.content as { sections: { content: string }[] }).sections[0]!.content);
    expect(texts.filter((x) => x === 'written')).toHaveLength(1);
    expect((await admin!.applicationPart.findUnique({ where: { id: part2 } }))!.content).toMatchObject({ marker: 'part-2' });

    expect(await saveConceptNoteDraft(ids.note[0]!, { written: true } as never)).toEqual({ success: true });
    const notes = await admin!.conceptNote.findMany({ where: { tenantId: t } });
    expect(notes.filter((n) => JSON.stringify(n.content) === '{"written":true}')).toHaveLength(1);

    expect(await m10.signDocument(ids.doc[0]!)).toMatchObject({ success: true });
    expect(await admin!.followupDoc.count({ where: { tenantId: t, signedAt: { not: null } } })).toBe(1);

    expect(await evidence.verifyEvidenceAction(ids.evidence[0]!, 'verified')).toEqual({ success: true });
    expect(await admin!.evidence.count({ where: { tenantId: t, status: 'verified' } })).toBe(1);

    expect(await pipeline.moveOpportunityStage(ids.opp[0]!, 'G3' as never)).toEqual({ success: true });
    expect(await admin!.opportunity.count({ where: { tenantId: t, stage: 'G3' } })).toBe(1);

    expect(await updateNextStep(ids.rel[0]!, 'written', null)).toEqual({ success: true });
    expect(await admin!.relationship.count({ where: { tenantId: t, nextStep: 'written' } })).toBe(1);

    // Only a candidate of the seat can be invited (TASK-MUN509G2ICKWI).
    expect(await consortium.assignSeat(ids.seat[0]!, `${RUN}-org-1`)).toEqual({ success: true });
    expect(await admin!.consortiumSeat.count({ where: { tenantId: t, organizationId: `${RUN}-org-1` } })).toBe(1);
  });
});
