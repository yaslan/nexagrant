import { Prisma, type PrismaClient } from '@prisma/client';
import { describe, expect, it, vi } from 'vitest';

import { listDirectoryExperts } from './directory';

/**
 * SEC NG-185 F-1 (a) — the expert_directory policy filters ROWS, not columns: under the
 * sealed 'expert-directory' purpose fabrika_app could read e-mail, name, ORCID, IP hash
 * and token hash of a verified expert. The only guard on columns is this file's select.
 * These tests pin it, so a column added to the select fails here before it reaches M8.
 */

/** What M8 may see of an expert: a pseudonymous card (directory.ts header). */
const ALLOWED = ['expertiseAreas', 'founderNumber', 'id', 'isFreelancer', 'languages', 'programmes', 'province', 'roles'];

/** Personal data and secrets the directory must never select. */
const FORBIDDEN = [
  'fullName',
  'email',
  'emailVerifiedAt',
  'title',
  'organization',
  'orcid',
  'linkedinUrl',
  'projectCodes',
  'referredBy',
  'utmSource',
  'utmMedium',
  'utmCampaign',
  'kvkkAcceptedAt',
  'visibilityConsentAt',
  'marketingConsentAt',
  'ipHash',
  'verifyTokenHash',
  'verifyTokenExpiresAt',
  'verifyMailCount',
  'verifyMailWindowStart',
];

function directoryDb(rows: Record<string, unknown>[] = []) {
  const findMany = vi.fn(async (_args: { where: unknown; select: Record<string, boolean> }) => rows);
  const executeRaw = vi.fn(async () => 0);
  const tx = { $executeRaw: executeRaw, expertPreRegistration: { findMany } };
  const db = { $transaction: async <T,>(fn: (t: typeof tx) => Promise<T>) => fn(tx) } as unknown as PrismaClient;
  return { db, findMany, executeRaw };
}

describe('listDirectoryExperts', () => {
  it('every forbidden name is a real ExpertPreRegistration column (the test cannot pass vacuously)', () => {
    const columns = Object.values(Prisma.ExpertPreRegistrationScalarFieldEnum) as string[];
    for (const c of [...FORBIDDEN, ...ALLOWED]) expect(columns, c).toContain(c);
  });

  it('selects exactly the pseudonymous card: no e-mail, name, ORCID, LinkedIn, IP hash or token hash', async () => {
    const { db, findMany } = directoryDb();
    await listDirectoryExperts(db);
    const args = findMany.mock.calls[0]?.[0];
    const selected = Object.entries(args?.select ?? {})
      .filter(([, on]) => on)
      .map(([k]) => k)
      .sort();
    expect(selected).toEqual(ALLOWED);
    for (const c of FORBIDDEN) expect(selected, c).not.toContain(c);
  });

  it('reads verified rows only, inside the expert-directory purpose', async () => {
    const { db, findMany, executeRaw } = directoryDb();
    await listDirectoryExperts(db);
    expect(findMany.mock.calls[0]?.[0].where).toEqual({ status: 'verified' });
    // withSystemScopeOn binds the purpose as the one parameter of enter_system_scope.
    expect(executeRaw.mock.calls[0]).toContain('expert-directory');
  });

  it('hands M8 the selected fields plus the country, nothing else', async () => {
    const row = {
      id: 'epr-1',
      founderNumber: 7,
      province: '06',
      isFreelancer: true,
      roles: ['researcher'],
      programmes: ['horizon-europe-h2020'],
      expertiseAreas: ['energy'],
      languages: ['en'],
    };
    const { db } = directoryDb([row]);
    const [entry] = await listDirectoryExperts(db);
    expect(Object.keys(entry ?? {}).sort()).toEqual([...ALLOWED, 'country'].sort());
  });
});
