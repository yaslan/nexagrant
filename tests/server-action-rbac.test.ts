import { beforeEach, describe, expect, test, vi } from 'vitest';
import type { Role } from '@prisma/client';

/**
 * TASK-MUN80UOUPB2A4 (FB GÜVENLİK Y-3) — the write actions refuse a role that
 * does not carry their permission, and let every role that does through.
 *
 * Every action is the real one, called with a session whose `role` is each of
 * the six tenant roles in turn. The expected answer is read from
 * src/lib/rbac.ts (`can`), never restated here, so the table below only says
 * *which permission* an action needs. A refused call must not reach the
 * database, the model or the store; an allowed one must get past the role gate
 * (what happens after it is the concern of each action's own tests).
 *
 * The three flows the card names — gate evaluation, evidence delete, concept
 * note save — are then driven end to end against a fake transaction.
 */

/** Every mocked side effect throws: reaching one means the role gate let the call through. */
const { m, reached } = vi.hoisted(() => ({
  m: {
    session: null as Record<string, unknown> | null,
    withTenant: vi.fn(),
    evaluateGate: vi.fn(),
    deleteTenantObject: vi.fn(),
  },
  reached: (): never => {
    throw new Error('REACHED_BEHIND_THE_GATE');
  },
}));

vi.mock('@/lib/auth', () => ({ auth: vi.fn(async () => m.session) }));
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));
vi.mock('next/headers', () => ({
  headers: vi.fn(async () => new Headers()),
  cookies: vi.fn(async () => ({ get: () => undefined })),
}));
vi.mock('@/lib/billing/pilot', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/billing/pilot')>();
  return { ...actual, assertTenantWritable: vi.fn(async () => undefined) };
});
vi.mock('@/lib/db', () => ({
  prisma: new Proxy({}, { get: reached }),
  withTenant: m.withTenant,
}));
vi.mock('@/lib/modules/access', () => ({ assertModuleAccess: vi.fn(async () => undefined) }));
vi.mock('@/lib/llm', () => ({ generateText: vi.fn(reached), generateCompletion: vi.fn(reached) }));
vi.mock('@/lib/rag', () => ({ buildRagPrompt: vi.fn(reached), retrieveChunks: vi.fn(reached) }));
vi.mock('@/lib/storage', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/storage')>();
  return {
    ...actual,
    getPresignedUploadUrl: vi.fn(reached),
    uploadFileToR2: vi.fn(reached),
    deleteTenantObject: m.deleteTenantObject,
  };
});
vi.mock('@/lib/gates/evaluate', () => ({ evaluateGate: m.evaluateGate }));
vi.mock('@/lib/scoring/g0-compute', () => ({ rescoreOpportunityG0: vi.fn(reached) }));
vi.mock('@/lib/scoring/consortium', () => ({ scoreCandidatesForSeat: vi.fn(reached), detectConflicts: vi.fn(reached) }));
vi.mock('@/modules/m8/server/matching', () => ({ generateSeatCandidates: vi.fn(reached) }));
vi.mock('@/lib/k5-pipeline/pipelineStore', () => ({
  getWorkspaceMembers: vi.fn(reached),
  addInMemoryOpportunity: vi.fn(reached),
  updateInMemoryOpportunityStage: vi.fn(reached),
  updateInMemoryOpportunityOwner: vi.fn(reached),
  addInMemoryOpportunityNote: vi.fn(reached),
}));
// The approvals actions write through src/lib/approval-requests.ts (AKTAR-MURBCJ0A-1).
vi.mock('@/lib/approval-requests', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/approval-requests')>();
  return { ...actual, createApprovalRequest: vi.fn(reached), cancelApprovalRequest: vi.fn(reached), approveApprovalRequest: vi.fn(reached), rejectApprovalRequest: vi.fn(reached) };
});

import { can, type Action } from '@/lib/rbac';
import { isForbiddenRole, FORBIDDEN_ROLE_DIGEST } from '@/lib/forbidden-role';

import * as pipeline from '@/app/[locale]/(app)/[workspace]/pipeline/actions';
import * as consortium from '@/app/[locale]/(app)/[workspace]/pipeline/[id]/consortium/actions';
import * as evidence from '@/app/[locale]/(app)/[workspace]/evidence/actions';
import * as conceptNotes from '@/app/[locale]/(app)/[workspace]/concept-notes/actions';
import * as approvals from '@/app/[locale]/(app)/[workspace]/approvals/actions';
import * as relationships from '@/app/[locale]/(app)/[workspace]/relationships/actions';
import * as m2 from '@/modules/m2/server/actions';
import * as m4 from '@/modules/m4/server/actions';
import * as m6 from '@/modules/m6/server/actions';
import * as m7 from '@/modules/m7/server/actions';
import * as m8 from '@/modules/m8/server/actions';
import * as m9 from '@/modules/m9/server/actions';
import * as calendar from '@/modules/m9/server/calendar-actions';
import * as m10 from '@/modules/m10/server/actions';
import * as m11 from '@/modules/m11/server/actions';
import * as partnerLink from '@/modules/m11/server/partner-link';

const ROLES: Role[] = ['TENANT_OWNER', 'TENANT_ADMIN', 'PIPELINE_MANAGER', 'WRITER', 'MEMBER', 'GUEST_PARTNER'];

function sessionFor(role: Role) {
  return { user: { id: 'user-1', name: 'Test User', email: 't@example.test' }, tenantId: 'tenant-A', role };
}

const form = () => {
  const f = new FormData();
  f.set('title', 'x');
  f.set('opportunityId', 'opp-1');
  f.set('seatId', 'seat-1');
  return f;
};

/** Each mapped write action: the permission it needs, and a call with arguments that get it to the gate. */
const ACTIONS: [string, Action, () => Promise<unknown>][] = [
  // pipeline/actions.ts — resolves its own tenant, role checked next to the pilot check
  ['pipeline.createOpportunity', 'manage_workspaces', () => pipeline.createOpportunity({ workspaceSlug: 'w', title: 't' })],
  ['pipeline.assignOpportunityOwner', 'manage_workspaces', () => pipeline.assignOpportunityOwner({ opportunityId: 'opp-1', ownerId: 'u', ownerName: 'n' })],
  ['pipeline.moveOpportunityStage', 'manage_workspaces', () => pipeline.moveOpportunityStage('opp-1', 'G1')],
  ['pipeline.evaluateOpportunityGate', 'evaluate_gates', () => pipeline.evaluateOpportunityGate({ opportunityId: 'opp-1', gate: 'G1' })],
  ['pipeline.addOpportunityNote', 'edit_proposal', () => pipeline.addOpportunityNote({ opportunityId: 'opp-1', text: 't', authorName: 'a', authorAvatar: 'a' })],
  ['pipeline.logEffort', 'edit_proposal', () => pipeline.logEffort({ opportunityId: 'opp-1', date: '2026-09-30', hours: 2 })],
  // consortium seats
  ['consortium.addSeat', 'manage_workspaces', () => consortium.addSeat('opp-1', 'coordinator')],
  ['consortium.findCandidates', 'manage_workspaces', () => consortium.findCandidates('seat-1')],
  ['consortium.assignSeat', 'manage_workspaces', () => consortium.assignSeat('seat-1', 'org-1')],
  ['consortium.confirmSeat', 'manage_approvals', () => consortium.confirmSeat('seat-1', 'opp-1', 'org-1')],
  ['m8.confirmSeatAssignment', 'manage_approvals', () => m8.confirmSeatAssignment('seat-1', 'opp-1')],
  ['m8.computeSeatCandidates', 'manage_workspaces', () => m8.computeSeatCandidates('opp-1', 'seat-1')],
  ['m8.inviteCandidateToSeat', 'manage_workspaces', () => m8.inviteCandidateToSeat('seat-1', 'org-1', 'opp-1')],
  // evidence
  ['evidence.getPresignedUploadUrlAction', 'edit_proposal', () => evidence.getPresignedUploadUrlAction('c', 'f.pdf', 'application/pdf', 1)],
  ['evidence.confirmEvidenceUploadAction', 'edit_proposal', () => evidence.confirmEvidenceUploadAction({ title: 't', category: 'c', objectKey: 'tenants/tenant-A/x', fileName: 'f', fileSizeBytes: 1, mimeType: 'application/pdf' })],
  ['evidence.createEvidence', 'edit_proposal', () => evidence.createEvidence(form())],
  ['evidence.deleteEvidence', 'edit_proposal', () => evidence.deleteEvidence('ev-1')],
  ['evidence.verifyEvidenceAction', 'edit_proposal', () => evidence.verifyEvidenceAction('ev-1', 'VERIFIED')],
  // concept notes
  ['conceptNotes.createConceptNote', 'edit_proposal', () => conceptNotes.createConceptNote('opp-1', 'tpl-1')],
  ['conceptNotes.saveSectionContent', 'edit_proposal', () => conceptNotes.saveSectionContent('note-1', 's', 'md')],
  ['conceptNotes.generateSectionDraft', 'edit_proposal', () => conceptNotes.generateSectionDraft('note-1', 's', 'S', 100, 'T')],
  ['conceptNotes.updateNoteStatus', 'edit_proposal', () => conceptNotes.updateNoteStatus('note-1', 'review')],
  // approvals
  ['approvals.submitApprovalRequestAction', 'request_dual_approval', () => approvals.submitApprovalRequestAction({ actionType: 'BUDGET_ALLOCATION', title: 't', payload: {} })],
  ['approvals.cancelRequestAction', 'request_dual_approval', () => approvals.cancelRequestAction('req-1')],
  ['approvals.approveRequestAction', 'approve_dual_approval', () => approvals.approveRequestAction('req-1')],
  ['approvals.rejectRequestAction', 'approve_dual_approval', () => approvals.rejectRequestAction('req-1', 'no')],
  // relationships (app) + m4
  // İNCELEME-59 B-1 (TASK-MUNQAXELV83HO): every internal member, never the outside partner. The final bar is KARAR 7.
  ['relationships.updateRelationship', 'view_proposal', () => relationships.updateRelationship('rel-1', { notes: 'x' })],
  ['relationships.addInteraction', 'edit_proposal', () => relationships.addInteraction('rel-1', { kind: 'call', at: '2026-09-30', summary: 's' })],
  ['relationships.createRelationship', 'edit_proposal', () => relationships.createRelationship({ kind: 'partner' })],
  ['m4.createRelationship', 'edit_proposal', () => m4.createRelationship({ organizationId: '123456789', kind: 'partner' })],
  ['m4.addInteraction', 'edit_proposal', () => m4.addInteraction({ relationshipId: 'rel-1', kind: 'call' })],
  ['m4.updateNextStep', 'edit_proposal', () => m4.updateNextStep('rel-1', 'next', null)],
  // m2
  ['m2.generateConceptNoteDraft', 'edit_proposal', () => m2.generateConceptNoteDraft('opp-1', 'tpl-1', {})],
  ['m2.saveConceptNoteDraft', 'edit_proposal', () => m2.saveConceptNoteDraft('note-1', {})],
  // m6
  ['m6.generateAiEvaluation', 'edit_proposal', () => m6.generateAiEvaluation('opp-1')],
  ['m6.saveHumanEvaluation', 'edit_proposal', () => m6.saveHumanEvaluation({ opportunityId: 'opp-1', excellence: 3, impact: 3, implementation: 3 })],
  ['m6.calibrateESR', 'edit_proposal', () => m6.calibrateESR('ev-1', 10)],
  ['m6.saveEvaluation', 'contribute_assigned', () => m6.saveEvaluation({ evaluationId: 'ev-1', proposalId: 'p-1', scores: { excellence: 3 } })],
  // m7
  ['m7.createTtoItem', 'edit_proposal', () => m7.createTtoItem({ title: 't', trl: 4, patentStatus: 'none', summary: 's', keywords: [] })],
  ['m7.generateIpChecklist', 'edit_proposal', () => m7.generateIpChecklist({ title: 't', trl: 4, patentStatus: 'none' })],
  // m9
  ['m9.generateMeetingBrief', 'edit_proposal', () => m9.generateMeetingBrief({ interactionId: 'i-1', partnerName: 'p', callTopic: 'c', opportunityId: 'opp-1' })],
  ['m9.savePostMeetingNotes', 'edit_proposal', () => m9.savePostMeetingNotes({ briefId: 'b-1', partnerName: 'p', notes: 'n', decisions: 'd', actionItems: [] })],
  ['calendar.connectCalendar', 'edit_proposal', () => calendar.connectCalendar('ics')],
  ['calendar.disconnectCalendar', 'edit_proposal', () => calendar.disconnectCalendar('conn-1')],
  // m10
  ['m10.generateStandardDoc', 'edit_proposal', () => m10.generateStandardDoc('opp-1', 'NDA')],
  ['m10.signDocument', 'edit_proposal', () => m10.signDocument('doc-1')],
  ['m10.createNewVersion', 'edit_proposal', () => m10.createNewVersion('doc-1')],
  ['m10.submitDualApprovalAction', 'request_dual_approval', () => m10.submitDualApprovalAction('doc-1')],
  ['m10.departmentApproveAction', 'approve_dual_approval', () => m10.departmentApproveAction('doc-1', 'FINANCE')],
  // m11
  ['m11.createApplicationPart', 'edit_proposal', () => m11.createApplicationPart('opp-1', 'PART_B')],
  ['m11.acquireSectionLock', 'edit_proposal', () => m11.acquireSectionLock('part-1', 's', 'user-1', 'a', 'o')],
  ['m11.releaseSectionLock', 'edit_proposal', () => m11.releaseSectionLock('part-1', 's', 'user-1')],
  ['m11.updateSectionContent', 'edit_proposal', () => m11.updateSectionContent('part-1', 's', 'text', 'user-1', 'a', 'o')],
  ['m11.addSectionComment', 'edit_proposal', () => m11.addSectionComment('part-1', 's', 'a', 'o', 'text')],
  ['m11.resolveSectionComment', 'edit_proposal', () => m11.resolveSectionComment('part-1', 's', 'c-1')],
  ['m11.restoreSectionRevision', 'edit_proposal', () => m11.restoreSectionRevision('part-1', 's', 'r-1')],
  ['m11.updatePresenceHeartbeat', 'edit_proposal', () => m11.updatePresenceHeartbeat('part-1', 'user-1', 'a', 'o', 's')],
  ['m11.addBudgetLine', 'edit_proposal', () => m11.addBudgetLine('part-1', 'p', 1)],
  ['m11.addWorkPackage', 'edit_proposal', () => m11.addWorkPackage('part-1', { code: 'WP1', title: 't', leadPartner: 'l', startMonth: 1, endMonth: 12 })],
  ['partnerLink.issuePartnerPortalLink', 'edit_proposal', () => partnerLink.issuePartnerPortalLink('part-1')],
];

/** 'forbidden' when the role gate refused the call, 'passed' for any other outcome. */
async function gateOutcome(call: () => Promise<unknown>): Promise<'forbidden' | 'passed'> {
  try {
    await call();
    return 'passed';
  } catch (e) {
    if (isForbiddenRole(e)) {
      // The refusal a browser can recognise in production, where the message is withheld.
      expect((e as { digest?: string }).digest).toBe(FORBIDDEN_ROLE_DIGEST);
      return 'forbidden';
    }
    return 'passed';
  }
}

beforeEach(() => {
  vi.clearAllMocks();
  m.withTenant.mockImplementation(reached);
  m.evaluateGate.mockImplementation(reached);
  m.deleteTenantObject.mockImplementation(reached);
});

describe('every mapped write action follows rbac.ts for all six roles', () => {
  test('the table covers all 60 mapped actions (Y-3 appendix A minus the portal and two reads, plus 8 the inventory mis-marked, plus updateRelationship, plus the 2 seat confirmations)', () => {
    expect(ACTIONS).toHaveLength(60);
  });

  for (const [name, permission, call] of ACTIONS) {
    test(`${name} needs ${permission}`, async () => {
      const seen: Record<string, 'forbidden' | 'passed'> = {};
      for (const role of ROLES) {
        vi.clearAllMocks();
        m.withTenant.mockImplementation(reached);
        m.session = sessionFor(role);
        seen[role] = await gateOutcome(call);
        if (seen[role] === 'forbidden') {
          // Refused before anything behind the gate: no transaction was opened.
          expect(m.withTenant, `${name} as ${role}`).not.toHaveBeenCalled();
        }
      }
      const expected = Object.fromEntries(ROLES.map((r) => [r, can(r, permission) ? 'passed' : 'forbidden']));
      expect(seen).toEqual(expected);
      // MEMBER can only view, contribute to assigned work and ask for a dual approval.
      expect(seen.MEMBER).toBe(can('MEMBER', permission) ? 'passed' : 'forbidden');
    });
  }
});

describe('real flows, fake transaction', () => {
  test('gate evaluation: PIPELINE_MANAGER evaluates, WRITER and MEMBER are refused before the engine', async () => {
    const tx = { opportunity: { findFirst: vi.fn(async () => ({ stage: 'G0' })) } };
    m.withTenant.mockImplementation(async (_t: string, fn: (t: typeof tx) => unknown) => fn(tx));
    m.evaluateGate.mockResolvedValue({ passed: true, reasons: ['ok'] });

    m.session = sessionFor('PIPELINE_MANAGER');
    await expect(pipeline.evaluateOpportunityGate({ opportunityId: 'opp-1', gate: 'G1' })).resolves.toEqual({
      success: true,
      passed: true,
      reasons: ['ok'],
    });
    expect(m.evaluateGate).toHaveBeenCalledWith('opp-1', 'G1', 'tenant-A', 'user-1');

    for (const role of ['WRITER', 'MEMBER'] as const) {
      m.evaluateGate.mockClear();
      tx.opportunity.findFirst.mockClear();
      m.session = sessionFor(role);
      await expect(pipeline.evaluateOpportunityGate({ opportunityId: 'opp-1', gate: 'G1' })).rejects.toMatchObject({
        digest: 'FORBIDDEN_ROLE',
        action: 'evaluate_gates',
      });
      expect(tx.opportunity.findFirst).not.toHaveBeenCalled();
      expect(m.evaluateGate).not.toHaveBeenCalled();
    }
  });

  test('evidence delete: WRITER deletes the row and its file, MEMBER deletes nothing', async () => {
    const tx = {
      evidence: {
        findFirst: vi.fn(async () => ({ id: 'ev-1', r2ObjectKey: 'tenants/tenant-A/evidence/f.pdf', fileUrl: null })),
        deleteMany: vi.fn(async () => ({ count: 1 })),
      },
    };
    m.withTenant.mockImplementation(async (_t: string, fn: (t: typeof tx) => unknown) => fn(tx));
    m.deleteTenantObject.mockResolvedValue(undefined);

    m.session = sessionFor('WRITER');
    await expect(evidence.deleteEvidence('ev-1')).resolves.toEqual({ success: true });
    expect(tx.evidence.deleteMany).toHaveBeenCalledWith({ where: { id: 'ev-1', tenantId: 'tenant-A' } });
    expect(m.deleteTenantObject).toHaveBeenCalledWith('tenant-A', 'tenants/tenant-A/evidence/f.pdf');

    tx.evidence.deleteMany.mockClear();
    m.deleteTenantObject.mockClear();
    m.session = sessionFor('MEMBER');
    await expect(evidence.deleteEvidence('ev-1')).rejects.toMatchObject({ digest: 'FORBIDDEN_ROLE', action: 'edit_proposal' });
    expect(tx.evidence.findFirst).toHaveBeenCalledTimes(1);
    expect(tx.evidence.deleteMany).not.toHaveBeenCalled();
    expect(m.deleteTenantObject).not.toHaveBeenCalled();
  });

  test('concept note save: WRITER writes the section, MEMBER and GUEST_PARTNER write nothing', async () => {
    const tx = {
      conceptNote: {
        findFirst: vi.fn(async () => ({ id: 'note-1', content: { intro: 'old' }, version: 3 })),
        update: vi.fn(async () => ({})),
      },
    };
    m.withTenant.mockImplementation(async (_t: string, fn: (t: typeof tx) => unknown) => fn(tx));

    m.session = sessionFor('WRITER');
    await expect(conceptNotes.saveSectionContent('note-1', 'intro', 'new')).resolves.toEqual({ success: true });
    expect(tx.conceptNote.update).toHaveBeenCalledWith({
      where: { id: 'note-1' },
      data: { content: { intro: 'new' }, version: 4 },
    });

    for (const role of ['MEMBER', 'GUEST_PARTNER'] as const) {
      tx.conceptNote.update.mockClear();
      tx.conceptNote.findFirst.mockClear();
      m.session = sessionFor(role);
      await expect(conceptNotes.saveSectionContent('note-1', 'intro', 'x')).rejects.toMatchObject({
        digest: 'FORBIDDEN_ROLE',
      });
      expect(tx.conceptNote.findFirst).not.toHaveBeenCalled();
      expect(tx.conceptNote.update).not.toHaveBeenCalled();
    }
  });

  test('relationship edit: MEMBER writes the notes, GUEST_PARTNER is refused before the transaction (İNCELEME-59 B-1)', async () => {
    const tx = {
      membership: { findFirst: vi.fn(async () => ({ userId: 'user-2' })) },
      relationship: { updateMany: vi.fn(async () => ({ count: 1 })) },
    };
    m.withTenant.mockImplementation(async (_t: string, fn: (t: typeof tx) => unknown) => fn(tx));
    const edit = { notes: 'guest-wrote', warmth: 'cold' as const, nextStep: 'call them' };

    m.session = sessionFor('MEMBER');
    await expect(relationships.updateRelationship('rel-1', edit)).resolves.toEqual({ success: true });
    expect(tx.relationship.updateMany).toHaveBeenCalledWith({
      where: { id: 'rel-1', tenantId: 'tenant-A' },
      data: { warmth: 'cold', nextStep: 'call them', nextStepDue: undefined, notes: 'guest-wrote' },
    });

    tx.relationship.updateMany.mockClear();
    m.withTenant.mockClear();
    m.session = sessionFor('GUEST_PARTNER');
    await expect(relationships.updateRelationship('rel-1', edit)).rejects.toMatchObject({
      digest: 'FORBIDDEN_ROLE',
      action: 'view_proposal',
    });
    expect(m.withTenant).not.toHaveBeenCalled();
    expect(tx.relationship.updateMany).not.toHaveBeenCalled();
  });

  test('a stale role claim outside the enum grants nothing', async () => {
    m.session = { ...sessionFor('WRITER'), role: 'SUPER_WRITER' };
    await expect(conceptNotes.saveSectionContent('note-1', 'intro', 'x')).rejects.toMatchObject({
      digest: 'FORBIDDEN_ROLE',
    });
    expect(m.withTenant).not.toHaveBeenCalled();
  });

  test('the m8 form wrapper turns a role refusal into the code the button translates', async () => {
    m.session = sessionFor('MEMBER');
    await expect(m8.computeSeatCandidatesForm({ status: 'idle' }, form())).resolves.toEqual({
      status: 'error',
      code: 'forbiddenRole',
    });
  });
});

/**
 * NG-64 review R-1 (K-577556): `listPanelScores` is a server action, so a guest
 * reviewer can call it straight from the browser. Its rows are panel-wide
 * averages built from every reviewer's marks; a role without `view_proposal`
 * is refused before any read, whatever the page shows.
 */
describe('m6.listPanelScores is a view_proposal read (review R-1)', () => {
  test('follows rbac.ts for all six roles, refused before the transaction', async () => {
    const seen: Record<string, 'forbidden' | 'passed'> = {};
    for (const role of ROLES) {
      vi.clearAllMocks();
      m.withTenant.mockImplementation(reached);
      m.session = sessionFor(role);
      seen[role] = await gateOutcome(() => m6.listPanelScores('prop-1'));
      if (seen[role] === 'forbidden') expect(m.withTenant, role).not.toHaveBeenCalled();
      else expect(m.withTenant, role).toHaveBeenCalledTimes(1);
    }
    expect(seen).toEqual(Object.fromEntries(ROLES.map((r) => [r, can(r, 'view_proposal') ? 'passed' : 'forbidden'])));
    expect(seen.GUEST_PARTNER).toBe('forbidden');
  });
});
