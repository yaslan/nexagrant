import { afterAll, beforeAll, describe, expect, test } from 'vitest';
import { prisma } from '@/lib/db';
import { generatePartnerProfiles } from '@/lib/k2-cordis/partnerProfileJob';
import { generatePartnerProfilesLegacy } from './helpers/partnerProfileJob.legacy';
import { skipOrFailInCi } from './helpers/live-db-role';

/**
 * TASK-MUMJ7W0GUI6N1 — the paged partner profile job must write what the
 * in-memory one wrote. The old job is kept as an oracle
 * (tests/helpers/partnerProfileJob.legacy.ts); both run over the same
 * fixture graph and every profile and co-participation row of the fixture is
 * compared field by field.
 *
 * The fixture is built to reach the branches that matter: an organisation with
 * more than 20 partners and more than 20 topics (the top-20 cut), projects
 * dated by endDate only and not dated at all, H2020 and HORIZON, coordinators,
 * a finished and a running project, a null netEcContribution, and an
 * organisation with no participation. The new job runs with a page size of 7
 * so the cursor crosses several page boundaries.
 *
 * The old job ordered ties in topTopics / topPartners by row arrival, the new
 * one by code / id, so the lists are compared tie-aware: the same count
 * sequence, and the same members above the last (boundary) count.
 *
 * `.live`: needs the docker-compose Postgres; skips locally without it and
 * fails in CI. Fixture ids start with `TESTPP-`; removed before and after.
 * The CORDIS tables have no tenant column, and both jobs sweep every
 * organisation in the database, so other rows are recomputed too — the same
 * values the import would have written.
 */

const SUITE = 'cordis partner profile live test';
const P = 'TESTPP-';
let ready = false;

/** Deterministic PRNG (mulberry32) so the fixture is the same on every run. */
function rng(seed: number): () => number {
  let a = seed;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

async function cleanup(): Promise<void> {
  const like = `${P}%`;
  await prisma.$executeRaw`DELETE FROM "CordisPartnerProfile" WHERE "organisationId" LIKE ${like}`;
  await prisma.$executeRaw`DELETE FROM "CordisCoParticipation" WHERE "orgA" LIKE ${like} OR "orgB" LIKE ${like}`;
  await prisma.$executeRaw`DELETE FROM "CordisParticipation" WHERE "projectId" LIKE ${like}`;
  await prisma.$executeRaw`DELETE FROM "CordisProjectTopic" WHERE "projectId" LIKE ${like}`;
  await prisma.$executeRaw`DELETE FROM "CordisProject" WHERE "id" LIKE ${like}`;
  await prisma.$executeRaw`DELETE FROM "CordisOrganization" WHERE "organisationId" LIKE ${like}`;
}

async function writeFixture(): Promise<void> {
  const rand = rng(20260929);
  const orgIds = Array.from({ length: 40 }, (_, i) => `${P}ORG-${String(i).padStart(3, '0')}`);
  const hub = orgIds[0]!;
  const loner = `${P}ORG-LONER`;

  await prisma.cordisOrganization.createMany({
    data: [...orgIds, loner].map((id, i) => ({
      organisationId: id,
      name: `Test Org ${i}`,
      nameNormalized: `TEST ORG ${i}`,
      activityType: ['HES', 'REC', 'PRC'][i % 3],
      sme: i % 4 === 0,
      country: ['TR', 'DE', 'FR', 'ES'][i % 4],
      isTurkish: i % 4 === 0,
    })),
  });

  const topicPool = Array.from({ length: 30 }, (_, i) => `${P}TOPIC-${String(i).padStart(2, '0')}`);
  const projects: Array<{ id: string; title: string; framework: string; startDate: Date | null; endDate: Date | null }> = [];
  const topics: Array<{ projectId: string; topicCode: string; topicTitle: string | null }> = [];
  const participations: Array<{
    projectId: string;
    organisationId: string;
    role: string;
    ecContribution: bigint;
    netEcContribution: bigint | null;
  }> = [];
  for (let n = 0; n < 60; n++) {
    const id = `${P}PRJ-${String(n).padStart(3, '0')}`;
    const year = 2018 + Math.floor(rand() * 10);
    const dating = n % 10;
    projects.push({
      id,
      title: `Test project ${n}`,
      framework: n % 3 === 0 ? 'H2020' : 'HORIZON',
      startDate: dating < 7 ? new Date(Date.UTC(year, n % 12, 1)) : null,
      endDate: dating === 9 ? null : new Date(Date.UTC(year + 3, n % 12, 1)),
    });
    const topicCount = 1 + Math.floor(rand() * 3);
    const picked = new Set<string>();
    while (picked.size < topicCount) picked.add(topicPool[Math.floor(rand() * topicPool.length)]!);
    for (const code of picked) {
      topics.push({ projectId: id, topicCode: code, topicTitle: code.endsWith('0') ? null : `Title of ${code}` });
    }
    // The hub sits in 50 of 60 projects so it gathers well over 20 partners and topics.
    const members = new Set<string>(n % 6 === 5 ? [] : [hub]);
    const size = 2 + Math.floor(rand() * 6);
    while (members.size < size) members.add(orgIds[1 + Math.floor(rand() * (orgIds.length - 1))]!);
    [...members].forEach((org, k) => {
      participations.push({
        projectId: id,
        organisationId: org,
        role: k === 0 ? 'coordinator' : 'participant',
        ecContribution: BigInt(100_000 + Math.floor(rand() * 900_000)),
        netEcContribution: rand() < 0.3 ? null : BigInt(50_000 + Math.floor(rand() * 500_000)),
      });
    });
  }
  await prisma.cordisProject.createMany({ data: projects });
  await prisma.cordisProjectTopic.createMany({ data: topics });
  await prisma.cordisParticipation.createMany({ data: participations });
}

interface ProfileSnapshot {
  organisationId: string;
  topTopics: Array<{ code: string; title: string; count: number }>;
  topPartners: Array<{ organisationId: string; count: number }>;
  [field: string]: unknown;
}

async function snapshot(): Promise<{ profiles: ProfileSnapshot[]; coParts: unknown[] }> {
  const profiles = await prisma.cordisPartnerProfile.findMany({
    where: { organisationId: { startsWith: P } },
    orderBy: { organisationId: 'asc' },
  });
  const coParts = await prisma.cordisCoParticipation.findMany({
    where: { orgA: { startsWith: P } },
    orderBy: [{ orgA: 'asc' }, { orgB: 'asc' }],
  });
  return {
    // topTopics / topPartners are Json columns; the jobs write these shapes into them.
    profiles: profiles.map(({ updatedAt: _updatedAt, ...rest }) => rest as unknown as ProfileSnapshot),
    coParts,
  };
}

/**
 * Tie-aware top-N comparison: the lists must carry the same count sequence and
 * the same members for every count above the last one (whose members may
 * legitimately differ when a tie straddles the cut). Short lists hold the full
 * set, so there every member must match.
 */
function expectSameTopList<T extends { count: number }>(
  actual: T[],
  expected: T[],
  key: (item: T) => string,
  label: string
): void {
  expect(actual.map((i) => i.count), `${label}: counts`).toEqual(expected.map((i) => i.count));
  const cut = expected.length === 20 ? expected[expected.length - 1]!.count : -1;
  const members = (list: T[]) => list.filter((i) => i.count > cut).map(key).sort();
  expect(members(actual), `${label}: members`).toEqual(members(expected));
}

beforeAll(async () => {
  try {
    await prisma.$queryRaw`SELECT 1`;
  } catch (err) {
    skipOrFailInCi(SUITE, `database unreachable: ${(err as Error).message.split('\n')[0]}`);
    return;
  }
  await cleanup();
  await writeFixture();
  ready = true;
}, 60_000);

afterAll(async () => {
  if (ready) await cleanup();
});

describe('generatePartnerProfiles (paged) vs the in-memory original', () => {
  test('writes the same profiles and co-participations as the legacy job', async (ctx) => {
    if (!ready) ctx.skip();

    const legacy = await generatePartnerProfilesLegacy();
    const before = await snapshot();

    await prisma.cordisPartnerProfile.deleteMany({ where: { organisationId: { startsWith: P } } });
    await prisma.cordisCoParticipation.deleteMany({ where: { orgA: { startsWith: P } } });

    const paged = await generatePartnerProfiles({ pageSize: 7 });
    const after = await snapshot();

    // The fixture must actually reach the branches it claims to.
    expect(before.profiles).toHaveLength(41);
    const hubBefore = before.profiles[0]!;
    expect(hubBefore.topPartners).toHaveLength(20);
    expect(hubBefore.topTopics).toHaveLength(20);
    expect(before.profiles.find((p) => p.organisationId === `${P}ORG-LONER`)?.totalProjects).toBe(0);
    expect(before.coParts.length).toBeGreaterThan(100);

    expect(paged.updatedProfiles).toBe(legacy.updatedProfiles);
    expect(paged.updatedCoParticipations).toBe(legacy.updatedCoParticipations);
    expect(after.coParts).toEqual(before.coParts);

    expect(after.profiles.map((p) => p.organisationId)).toEqual(before.profiles.map((p) => p.organisationId));
    after.profiles.forEach((got, i) => {
      const want = before.profiles[i]!;
      const { topTopics: gotTopics, topPartners: gotPartners, ...gotRest } = got;
      const { topTopics: wantTopics, topPartners: wantPartners, ...wantRest } = want;
      expect(gotRest, got.organisationId).toEqual(wantRest);
      expectSameTopList(gotTopics, wantTopics, (t) => `${t.code}|${t.title}`, `${got.organisationId} topTopics`);
      expectSameTopList(gotPartners, wantPartners, (t) => t.organisationId, `${got.organisationId} topPartners`);
    });
  }, 120_000);
});
