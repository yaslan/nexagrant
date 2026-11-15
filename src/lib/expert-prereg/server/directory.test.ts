import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { Prisma, type PrismaClient } from '@prisma/client';
import { describe, expect, it, vi } from 'vitest';

import { listDirectoryExperts } from './directory';

/**
 * SEC NG-185 F-1 — the NG-52 expert_directory policy filtered ROWS, not columns: under the
 * sealed 'expert-directory' purpose fabrika_app could read e-mail, name, ORCID, IP hash
 * and token hash of a verified expert. NG-188 (F-1b) moved the read to the view
 * "ExpertDirectoryEntry" (prisma/rls.sql), which carries the card columns only. These tests
 * pin both ends: the view's column list in rls.sql and the query this file sends. What the
 * database really returns is measured by rls:verify (probeExpertDirectory) and
 * tests/system-scope.live.test.ts.
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

/** The SQL text of a tagged-template $queryRaw call (placeholders as $n). */
const sqlOf = (call: unknown[] | undefined): string => {
  const strings = (call?.[0] ?? []) as readonly string[];
  return strings.reduce((acc, part, i) => (i === 0 ? part : `${acc}$${i}${part}`), '');
};

function directoryDb(rows: Record<string, unknown>[] = []) {
  const queryRaw = vi.fn(async (..._args: unknown[]) => rows);
  const executeRaw = vi.fn(async () => 0);
  const findMany = vi.fn(async () => rows);
  const tx = { $executeRaw: executeRaw, $queryRaw: queryRaw, expertPreRegistration: { findMany } };
  const db = { $transaction: async <T,>(fn: (t: typeof tx) => Promise<T>) => fn(tx) } as unknown as PrismaClient;
  return { db, queryRaw, executeRaw, findMany };
}

/** The column list of `CREATE VIEW public."ExpertDirectoryEntry"` in prisma/rls.sql. */
function viewColumns(): string[] {
  const sql = readFileSync(resolve(import.meta.dirname, '../../../../prisma/rls.sql'), 'utf8');
  const start = sql.indexOf('CREATE VIEW public."ExpertDirectoryEntry"');
  const select = sql.indexOf('SELECT', start);
  const from = sql.indexOf('FROM public."ExpertPreRegistration"', select);
  if (start < 0 || select < 0 || from < 0) throw new Error('prisma/rls.sql: ExpertDirectoryEntry view not found');
  return sql
    .slice(select + 'SELECT'.length, from)
    .split(/,\s*\n/)
    .map((c) => c.trim())
    .map((c) => / AS "([^"]+)"$/.exec(c)?.[1] ?? c.replace(/^e\./, '').replace(/"/g, ''))
    .sort();
}

describe('listDirectoryExperts', () => {
  it('every forbidden name is a real ExpertPreRegistration column (the test cannot pass vacuously)', () => {
    const columns = Object.values(Prisma.ExpertPreRegistrationScalarFieldEnum) as string[];
    for (const c of [...FORBIDDEN, ...ALLOWED]) expect(columns, c).toContain(c);
  });

  it('the view in prisma/rls.sql carries the card columns and the row number, nothing else', () => {
    const cols = viewColumns();
    expect(cols).toEqual([...ALLOWED, 'listOrder'].sort());
    for (const c of FORBIDDEN) expect(cols, c).not.toContain(c);
  });

  it('reads the view, not the table, and selects exactly the pseudonymous card', async () => {
    const { db, queryRaw, findMany } = directoryDb();
    await listDirectoryExperts(db);
    expect(findMany).not.toHaveBeenCalled();
    const sql = sqlOf(queryRaw.mock.calls[0]);
    expect(sql).toMatch(/FROM "ExpertDirectoryEntry"/);
    expect(sql).not.toMatch(/ExpertPreRegistration/);
    const list = /SELECT([\s\S]*?)FROM/.exec(sql)?.[1] ?? '';
    const selected = list
      .split(',')
      .map((c) => c.trim().replace(/"/g, ''))
      .sort();
    expect(selected).toEqual(ALLOWED);
    for (const c of FORBIDDEN) expect(sql, c).not.toContain(c);
  });

  it('reads inside the expert-directory purpose, in the view order, with the bound limit', async () => {
    const { db, queryRaw, executeRaw } = directoryDb();
    await listDirectoryExperts(db);
    // withSystemScopeOn binds the purpose as the one parameter of enter_system_scope.
    expect(executeRaw.mock.calls[0]).toContain('expert-directory');
    expect(sqlOf(queryRaw.mock.calls[0])).toMatch(/ORDER BY "listOrder"\s+LIMIT \$1/);
    expect(queryRaw.mock.calls[0]?.slice(1)).toEqual([2_000]);
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
