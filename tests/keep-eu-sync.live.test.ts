import { afterAll, beforeAll, describe, expect, test } from 'vitest';
import { prisma } from '@/lib/db';
import { persistKeepEuRecord, type KeepEuProjectRecord } from '@/lib/keep-eu-sync';
import { skipOrFailInCi } from './helpers/live-db-role';

/**
 * TASK-MVIAOEGRE2JJT (FO-113, Y1) — a keep.eu sync must not overwrite the CORDIS
 * organisation it meets. Runs `persistKeepEuRecord` against a real database.
 *
 * CORDIS rows are authoritative (FO-58). keep.eu may create a missing
 * organisation, or fill fields that are still empty, and nothing else. The
 * unit tests mock Prisma and cannot see an overwrite that only the database
 * shows, so this file writes to the database.
 *
 * `.live`: needs a migrated, throwaway database behind DATABASE_URL and
 * KEEP_EU_LIVE=1. Without the opt-in the file skips locally and fails in CI
 * (tests/helpers/live-db-role.ts).
 * Every row written is keyed by a per-run id and deleted afterwards.
 */

const SUITE = 'keep-eu-sync.live';
// Opt-in: vitest loads `.env`, so a bare `pnpm test` would point this file at the
// shared dev database. Run it with `KEEP_EU_LIVE=1 DATABASE_URL=<throwaway db>`.
const LIVE = process.env.KEEP_EU_LIVE === '1';
const RUN = `y1-${Date.now().toString(36)}`;
const PIC_KEEP = `${RUN}-keep`; // CORDIS org with fields keep.eu must not change
const PIC_FILL = `${RUN}-fill`; // CORDIS org with empty country and city
const PIC_NEW = `${RUN}-new`; // no CORDIS row yet, keep.eu creates it
const PROJECT_ID = `Y1-${RUN}`;

if (!LIVE) skipOrFailInCi(SUITE, 'KEEP_EU_LIVE=1 is not set (point DATABASE_URL at a throwaway database first)');

function record(): KeepEuProjectRecord {
  return {
    projectId: PROJECT_ID,
    title: 'Y1 live project',
    programmeId: 'Y1',
    framework: 'INTERREG',
    partners: [
      {
        partnerName: 'keep.eu Ad Ltd',
        country: 'TR',
        town: 'Istanbul',
        pic: PIC_KEEP,
        role: 'partner',
        isTurkish: true,
      },
      {
        partnerName: 'keep.eu Fill Ltd',
        country: 'TR',
        town: 'Izmir',
        pic: PIC_FILL,
        role: 'partner',
        isTurkish: true,
      },
      {
        partnerName: 'keep.eu New Ltd',
        country: 'BG',
        town: 'Sofia',
        pic: PIC_NEW,
        role: 'partner',
        isTurkish: false,
      },
    ],
  };
}

describe.skipIf(!LIVE)(SUITE, () => {
  beforeAll(async () => {
    await prisma.cordisOrganization.createMany({
      data: [
        {
          organisationId: PIC_KEEP,
          name: 'CORDIS Registered GmbH',
          nameNormalized: 'CORDIS REGISTERED GMBH',
          country: 'DE',
          city: 'Berlin',
          isTurkish: false,
        },
        {
          organisationId: PIC_FILL,
          name: 'CORDIS Fill Org',
          nameNormalized: null,
          country: null,
          city: null,
          isTurkish: false,
        },
      ],
    });
  });

  afterAll(async () => {
    await prisma.cordisParticipation.deleteMany({ where: { projectId: { in: [`KEU:${PROJECT_ID}`] } } });
    await prisma.cordisProject.deleteMany({ where: { id: { in: [`KEU:${PROJECT_ID}`] } } });
    await prisma.cordisOrganization.deleteMany({ where: { organisationId: { in: [PIC_KEEP, PIC_FILL, PIC_NEW] } } });
    await prisma.$disconnect();
  });

  test('keep.eu leaves an existing CORDIS organisation name, country and city unchanged', async () => {
    const ok = await persistKeepEuRecord(record());
    expect(ok).toBe(true);

    const org = await prisma.cordisOrganization.findUniqueOrThrow({ where: { organisationId: PIC_KEEP } });
    expect(org.name).toBe('CORDIS Registered GmbH');
    expect(org.country).toBe('DE');
    expect(org.city).toBe('Berlin');
    expect(org.isTurkish).toBe(false);
  });

  test('keep.eu fills only the fields that were empty', async () => {
    const org = await prisma.cordisOrganization.findUniqueOrThrow({ where: { organisationId: PIC_FILL } });
    expect(org.name).toBe('CORDIS Fill Org');
    expect(org.country).toBe('TR');
    expect(org.city).toBe('Izmir');
    expect(org.nameNormalized).toBe('KEEP.EU FILL LTD');
    expect(org.isTurkish).toBe(true);
  });

  test('keep.eu creates a missing organisation and links it under the KEU: project id', async () => {
    const org = await prisma.cordisOrganization.findUniqueOrThrow({ where: { organisationId: PIC_NEW } });
    expect(org.name).toBe('keep.eu New Ltd');
    expect(org.country).toBe('BG');

    const project = await prisma.cordisProject.findUniqueOrThrow({ where: { id: `KEU:${PROJECT_ID}` } });
    expect(project.framework).toBe('INTERREG');
    const parts = await prisma.cordisParticipation.count({ where: { projectId: `KEU:${PROJECT_ID}` } });
    expect(parts).toBe(3);
  });
});
