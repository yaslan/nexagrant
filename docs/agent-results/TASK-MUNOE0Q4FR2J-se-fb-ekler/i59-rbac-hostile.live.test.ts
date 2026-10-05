import { afterAll, beforeAll, describe, expect, test, vi } from 'vitest';
import type { Role } from '@prisma/client';

/**
 * İNCELEME-59 (se-fb, TASK-MUNOE0Q4FR2J) — hostile calls against a REAL,
 * isolated Postgres (sefb_i59, RLS policies applied). Only `auth()` is faked
 * (the session a JWT would produce); pilot gate, withTenant, Prisma and the
 * action bodies are real. Every refused call is checked against a row snapshot.
 * NOT for the repo — review evidence only.
 */
const s = vi.hoisted(() => ({ session: null as Record<string, unknown> | null }));
vi.mock('@/lib/auth', () => ({ auth: vi.fn(async () => s.session) }));
vi.mock('next/cache', () => ({ revalidatePath: vi.fn(), revalidateTag: vi.fn() }));
vi.mock('next/headers', () => ({
  headers: vi.fn(async () => new Headers()),
  cookies: vi.fn(async () => ({ get: () => undefined })),
}));
// Plan entitlements are not what is under test.
vi.mock('@/lib/modules/access', () => ({ assertModuleAccess: vi.fn(async () => undefined) }));

import { prisma } from '@/lib/db';
import * as evidence from '@/app/[locale]/(app)/[workspace]/evidence/actions';
import * as conceptNotes from '@/app/[locale]/(app)/[workspace]/concept-notes/actions';
import * as relationships from '@/app/[locale]/(app)/[workspace]/relationships/actions';
import * as m10 from '@/modules/m10/server/actions';
import * as partnerLink from '@/modules/m11/server/partner-link';
import * as pipeline from '@/app/[locale]/(app)/[workspace]/pipeline/actions';
import { can } from '@/lib/rbac';

const TAG = 'i59';
const ROLES: Role[] = ['TENANT_OWNER', 'TENANT_ADMIN', 'PIPELINE_MANAGER', 'WRITER', 'MEMBER', 'GUEST_PARTNER'];
const ids: Record<string, string> = {};
const users: Partial<Record<Role, string>> = {};

function as(role: string | null, tenantId = ids.tA, userId = users[(role as Role) ?? 'MEMBER'] ?? 'nouser') {
  s.session = { user: { id: userId, name: `i59 ${role}`, email: `${role}@i59.test` }, tenantId, role };
}

async function outcome(p: Promise<unknown>): Promise<string> {
  try {
    const r = await p;
    return `ok:${JSON.stringify(r)?.slice(0, 120)}`;
  } catch (e) {
    const d = (e as { digest?: string }).digest;
    return `throw:${d ?? (e as Error).message.slice(0, 80)}`;
  }
}

beforeAll(async () => {
  if (!process.env.DATABASE_URL?.endsWith('/sefb_i59')) throw new Error('refusing: DATABASE_URL must be the isolated sefb_i59 DB');
  for (const t of ['A', 'B']) {
    const tenant = await prisma.tenant.create({ data: { name: `${TAG} tenant ${t}`, slug: `${TAG}-${t.toLowerCase()}-${Date.now()}`, country: 'TR' } });
    ids[`t${t}`] = tenant.id;
    const ws = await prisma.workspace.create({ data: { tenantId: tenant.id, name: `${TAG} ws ${t}`, slug: `${TAG}-ws-${t}` } });
    const opp = await prisma.opportunity.create({ data: { tenantId: tenant.id, workspaceId: ws.id, title: `${TAG} opp ${t}` } });
    ids[`opp${t}`] = opp.id;
    ids[`ev${t}`] = (await prisma.evidence.create({ data: { tenantId: tenant.id, kind: 'corporate', title: `${TAG} ev ${t}`, body: 'x' } })).id;
    ids[`rel${t}`] = (await prisma.relationship.create({ data: { tenantId: tenant.id, kind: 'partner', notes: 'orig' } })).id;
    ids[`doc${t}`] = (await prisma.followupDoc.create({ data: { tenantId: tenant.id, opportunityId: opp.id, kind: 'NDA' } })).id;
    ids[`partA${t}`] = (await prisma.applicationPart.create({ data: { tenantId: tenant.id, opportunityId: opp.id, part: 'PART_A' } })).id;
  }
  for (const role of ROLES) {
    const u = await prisma.user.create({ data: { email: `${role.toLowerCase()}-${Date.now()}@i59.test`, name: `i59 ${role}` } });
    users[role] = u.id;
    await prisma.membership.create({ data: { tenantId: ids.tA, userId: u.id, role } });
  }
});

afterAll(async () => {
  // Isolated DB only; kept for the report (ids printed). No bulk deletes.
  console.log('I59_FIXTURE', JSON.stringify({ ids, users }));
});

const snap = async () => ({
  evA: await prisma.evidence.count({ where: { id: ids.evA } }),
  evB: await prisma.evidence.count({ where: { id: ids.evB } }),
  relA: (await prisma.relationship.findUnique({ where: { id: ids.relA }, select: { notes: true, warmth: true, ownerUserId: true } })),
  relB: (await prisma.relationship.findUnique({ where: { id: ids.relB }, select: { notes: true, warmth: true } })),
  docA: (await prisma.followupDoc.findUnique({ where: { id: ids.docA }, select: { signedAt: true } }))?.signedAt ?? null,
  docB: (await prisma.followupDoc.findUnique({ where: { id: ids.docB }, select: { signedAt: true } }))?.signedAt ?? null,
  partA: (await prisma.applicationPart.findUnique({ where: { id: ids.partAA }, select: { magicTokenHash: true } }))?.magicTokenHash ?? null,
});

describe('İNCELEME-59 hostile calls, live DB', () => {
  test('H1 forbidden writes are refused with FORBIDDEN_ROLE and change nothing', async () => {
    const before = await snap();
    const rows: string[] = [];
    const cases: [Role, string, () => Promise<unknown>][] = [
      ['MEMBER', 'deleteEvidence(evA)', () => evidence.deleteEvidence(ids.evA)],
      ['GUEST_PARTNER', 'deleteEvidence(evA)', () => evidence.deleteEvidence(ids.evA)],
      ['MEMBER', 'signDocument(docA)', () => m10.signDocument(ids.docA)],
      ['GUEST_PARTNER', 'issuePartnerPortalLink(partA)', () => partnerLink.issuePartnerPortalLink(ids.partAA)],
      ['WRITER', 'departmentApproveAction(docA,FINANCE)', () => m10.departmentApproveAction(ids.docA, 'FINANCE' as never)],
      ['WRITER', 'moveOpportunityStage(oppA,G1)', () => pipeline.moveOpportunityStage(ids.oppA, 'G1' as never)],
      ['WRITER', 'evaluateOpportunityGate(oppA,G1)', () => pipeline.evaluateOpportunityGate({ opportunityId: ids.oppA, gate: 'G1' } as never)],
      ['MEMBER', 'createRelationship', () => relationships.createRelationship({ kind: 'partner', notes: 'hostile' })],
      ['MEMBER', 'updateNoteStatus(x,approved)', () => conceptNotes.updateNoteStatus('any', 'approved')],
      ['MEMBER', 'updateRelationship(relA,{ownerUserId})', () => relationships.updateRelationship(ids.relA, { ownerUserId: users.MEMBER! })],
    ];
    for (const [role, label, call] of cases) {
      as(role);
      rows.push(`${role.padEnd(16)} ${label.padEnd(40)} → ${await outcome(call())}`);
    }
    console.log('H1\n' + rows.join('\n'));
    for (const r of rows.slice(0, 9)) expect(r).toContain('throw:FORBIDDEN_ROLE');
    expect(rows[9]).toContain('"error":"FORBIDDEN"');
    expect(await snap()).toEqual(before);
  });

  test('H2 stale / missing role claims grant nothing', async () => {
    const out: string[] = [];
    for (const r of ['SUPER_WRITER', 'tenant_owner', '', null]) {
      as(r as never, ids.tA, users.WRITER!);
      out.push(`${JSON.stringify(r)} → ${await outcome(evidence.deleteEvidence(ids.evA))}`);
    }
    console.log('H2\n' + out.join('\n'));
    for (const o of out) expect(o).toContain('FORBIDDEN_ROLE');
    expect(await prisma.evidence.count({ where: { id: ids.evA } })).toBe(1);
  });

  test('H3 cross-tenant: OWNER of A aims at B ids — nothing in B changes', async () => {
    const before = await snap();
    as('TENANT_OWNER');
    const out = [
      `deleteEvidence(evB) → ${await outcome(evidence.deleteEvidence(ids.evB))}`,
      `signDocument(docB) → ${await outcome(m10.signDocument(ids.docB))}`,
      `updateRelationship(relB) → ${await outcome(relationships.updateRelationship(ids.relB, { notes: 'pwned', warmth: 'hot' }))}`,
      `issuePartnerPortalLink(partAB) → ${await outcome(partnerLink.issuePartnerPortalLink(ids.partAB))}`,
    ];
    console.log('H3\n' + out.join('\n'));
    const after = await snap();
    expect(after.evB).toBe(1);
    expect(after.docB).toBeNull();
    expect(after.relB).toEqual(before.relB);
  });

  test('H4 tenant id in the session is the only scope: WRITER of A with a forged B tenant claim', async () => {
    // Not a real attack path (JWT is signed), documents that membership is not re-read per action.
    as('WRITER', ids.tB, users.WRITER!);
    const r = await outcome(relationships.updateRelationship(ids.relB, { notes: 'forged-claim' }));
    console.log('H4 WRITER(A user) with tenantId=B claim → ' + r);
    const relB = await prisma.relationship.findUnique({ where: { id: ids.relB }, select: { notes: true } });
    console.log('H4 relB.notes = ' + relB?.notes);
  });

  test('H5 GUEST_PARTNER (no view_proposal) still writes updateRelationship notes/warmth', async () => {
    as('GUEST_PARTNER');
    const r = await outcome(relationships.updateRelationship(ids.relA, { notes: 'guest-wrote', warmth: 'cold' }));
    const relA = await prisma.relationship.findUnique({ where: { id: ids.relA }, select: { notes: true, warmth: true } });
    console.log(`H5 GUEST_PARTNER updateRelationship → ${r}; relA now ${JSON.stringify(relA)}`);
  });

  test('H6 KARAR items as implemented: WRITER approves own note, signs without dual approval, issues/rotates partner token', async () => {
    as('WRITER');
    const before = await snap();
    const sign = await outcome(m10.signDocument(ids.docA));
    const tok1 = await outcome(partnerLink.issuePartnerPortalLink(ids.partAA));
    const mid = await snap();
    const tok2 = await outcome(partnerLink.issuePartnerPortalLink(ids.partAA));
    const after = await snap();
    console.log(`H6 WRITER signDocument(docA) → ${sign}; docA.signedAt ${before.docA} → ${mid.docA}`);
    console.log(`H6 WRITER issuePartnerPortalLink ×2 → ${tok1.slice(0, 30)}… / ${tok2.slice(0, 30)}…; hash changed twice: ${before.partA !== mid.partA && mid.partA !== after.partA}`);
    const status = await outcome(conceptNotes.updateNoteStatus('no-such-note', 'anything-goes'));
    console.log(`H6 WRITER updateNoteStatus(free-text status) → ${status}`);
  });

  test('H8 6 roles × 3 permissions, live rows: result == can(role, perm)', async () => {
    const rows: string[] = [];
    for (const role of ROLES) {
      const ev = await prisma.evidence.create({ data: { tenantId: ids.tA, kind: 'corporate', title: `i59 H8 ${role}`, body: 'x' } });
      as(role);
      const del = await outcome(evidence.deleteEvidence(ev.id));
      const left = await prisma.evidence.count({ where: { id: ev.id } });
      const appr = await outcome(m10.departmentApproveAction(ids.docB, 'FINANCE' as never));
      const note = await outcome(conceptNotes.updateNoteStatus('none', 'approved'));
      const refused = (o: string) => o.includes('FORBIDDEN_ROLE');
      rows.push(`${role.padEnd(16)} edit_proposal: ${refused(del) ? 'RET' : 'geçti'} (satır kaldı=${left}) can=${can(role,'edit_proposal')} | approve_dual_approval: ${refused(appr) ? 'RET' : 'geçti→' + appr.slice(0,60)} can=${can(role,'approve_dual_approval')}`);
      expect(refused(del)).toBe(!can(role, 'edit_proposal'));
      expect(left).toBe(can(role, 'edit_proposal') ? 0 : 1);
      expect(refused(note)).toBe(!can(role, 'edit_proposal'));
      expect(refused(appr)).toBe(!can(role, 'approve_dual_approval'));
    }
    console.log('H8\n' + rows.join('\n'));
  });
});
