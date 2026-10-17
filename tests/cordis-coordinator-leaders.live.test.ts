import { afterAll, beforeAll, describe, expect, test } from 'vitest';
import { prisma } from '@/lib/db';
import { coordinatorLeaders } from '@/lib/k2-cordis/coordinator-leaders';
import { skipOrFailInCi } from './helpers/live-db-role';

/**
 * TASK-MVBBPXU1ZW0F5 (FO-5) — the coordinator query against real Postgres.
 * A mock cannot show prefix matching, the role filter, or that a project with
 * two matching topic codes is counted once; this does.
 *
 * `.live`: needs a reachable DATABASE_URL; skips locally without it and fails
 * in CI. Fixture ids start with `FO5LIVE-`; removed before and after.
 *
 * Fixture graph (prefix FO5LIVE-CL5-):
 *   P1  topics FO5LIVE-CL5-2024-01                 · P2  topics FO5LIVE-CL5-2024-02 AND FO5LIVE-CL5-2024-03
 *   P3  topic  FO5LIVE-OTHER-1 (outside the prefix)
 *   A (DE) coordinator of P1 (100) and P2 (200)    → 2 projects, 300
 *   B (FR) coordinator of P2 (50), participant of P1
 *   C (ES) participant of P1 and P2 only           → never listed
 *   E (DE) coordinator of P3 only                  → never listed for CL5
 * Expected for FO5LIVE-CL5-: [A 2/300, B 1/50]; with country DE: [A].
 */

const PREFIX = 'FO5LIVE-CL5-';
const ORG = { A: 'FO5-ORG-A', B: 'FO5-ORG-B', C: 'FO5-ORG-C', E: 'FO5-ORG-E' } as const;
const PROJ = { P1: 'FO5LIVE-P1', P2: 'FO5LIVE-P2', P3: 'FO5LIVE-P3' } as const;

const enabled = Boolean(process.env.DATABASE_URL);

async function cleanup() {
  await prisma.cordisProject.deleteMany({ where: { id: { startsWith: 'FO5LIVE-' } } });
  await prisma.cordisOrganization.deleteMany({ where: { organisationId: { startsWith: 'FO5-ORG-' } } });
}

describe.skipIf(!enabled)('coordinatorLeaders (live DB)', () => {
  beforeAll(async () => {
    if (!enabled) {
      skipOrFailInCi('coordinator-leaders.live', 'DATABASE_URL is not set');
      return;
    }
    await cleanup();
    await prisma.cordisOrganization.createMany({
      data: [
        { organisationId: ORG.A, name: 'ORG A LEGAL', shortName: 'Org A', country: 'DE' },
        { organisationId: ORG.B, name: 'ORG B LEGAL', shortName: null, country: 'FR' },
        { organisationId: ORG.C, name: 'ORG C LEGAL', shortName: null, country: 'ES' },
        { organisationId: ORG.E, name: 'ORG E LEGAL', shortName: null, country: 'DE' },
      ],
    });
    await prisma.cordisProject.createMany({
      data: [
        { id: PROJ.P1, title: 'P1', framework: 'HORIZON' },
        { id: PROJ.P2, title: 'P2', framework: 'HORIZON' },
        { id: PROJ.P3, title: 'P3', framework: 'HORIZON' },
      ],
    });
    await prisma.cordisProjectTopic.createMany({
      data: [
        { projectId: PROJ.P1, topicCode: 'FO5LIVE-CL5-2024-01' },
        { projectId: PROJ.P2, topicCode: 'FO5LIVE-CL5-2024-02' },
        { projectId: PROJ.P2, topicCode: 'FO5LIVE-CL5-2024-03' },
        { projectId: PROJ.P3, topicCode: 'FO5LIVE-OTHER-1' },
      ],
    });
    await prisma.cordisParticipation.createMany({
      data: [
        { projectId: PROJ.P1, organisationId: ORG.A, role: 'coordinator', ecContribution: BigInt(100) },
        { projectId: PROJ.P2, organisationId: ORG.A, role: 'coordinator', ecContribution: BigInt(200) },
        { projectId: PROJ.P2, organisationId: ORG.B, role: 'coordinator', ecContribution: BigInt(50) },
        { projectId: PROJ.P1, organisationId: ORG.B, role: 'participant', ecContribution: BigInt(70) },
        { projectId: PROJ.P1, organisationId: ORG.C, role: 'participant', ecContribution: BigInt(10) },
        { projectId: PROJ.P2, organisationId: ORG.C, role: 'participant', ecContribution: BigInt(10) },
        { projectId: PROJ.P3, organisationId: ORG.E, role: 'coordinator', ecContribution: BigInt(999) },
      ],
    });
  });

  afterAll(async () => {
    if (enabled) await cleanup();
  });

  test('lists only coordinators under the prefix, each project counted once', async () => {
    const rows = await coordinatorLeaders({ topicPrefix: PREFIX, limit: 20 });
    expect(rows.map((r) => [r.organisationId, r.coordinatedProjects, r.totalEcContribution])).toEqual([
      [ORG.A, 2, BigInt(300)],
      [ORG.B, 1, BigInt(50)],
    ]);
  });

  test('orders by coordinated projects, then euro total', async () => {
    const rows = await coordinatorLeaders({ topicPrefix: PREFIX, limit: 20 });
    expect(rows[0]!.organisationId).toBe(ORG.A);
    expect(rows[0]!.shortName).toBe('Org A');
    expect(rows[0]!.name).toBe('ORG A LEGAL');
  });

  test('the country filter keeps only organisations from that country', async () => {
    const rows = await coordinatorLeaders({ topicPrefix: PREFIX, limit: 20, country: 'DE' });
    expect(rows.map((r) => r.organisationId)).toEqual([ORG.A]);
  });

  test('a prefix that matches nothing returns an empty list, not an error', async () => {
    expect(await coordinatorLeaders({ topicPrefix: 'FO5LIVE-NOPE-', limit: 20 })).toEqual([]);
  });

  test('limit cuts the list', async () => {
    const rows = await coordinatorLeaders({ topicPrefix: PREFIX, limit: 1 });
    expect(rows.map((r) => r.organisationId)).toEqual([ORG.A]);
  });
});
