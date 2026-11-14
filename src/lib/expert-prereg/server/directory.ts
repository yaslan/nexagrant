import type { PrismaClient } from '@prisma/client';
import type { ExpertPoolEntry } from '@/core/contracts/expert-pool';
import { prisma } from '@/lib/db';
import { withSystemScopeOn } from '@/lib/system-scope';

/**
 * NG-52 (TASK-MW2SU1H9BLCGV) — the expert pre-registrations M8 may offer as seat
 * candidates (K-579696 = A: free pre-registration only in S1).
 *
 * Who is in it: a verified address (`status = 'verified'`). Every row ticked the
 * visibility consent ("Profilimin uzman rehberinde yayımlanmasına rıza
 * veriyorum"; mandatory in the form, NOT NULL column). A pending or disabled row
 * is never read. The database says the same thing: purpose 'expert-directory' opens only
 * the `expert_directory` policy of prisma/rls.sql (SELECT, `status = 'verified'` AND
 * `visibilityConsentAt IS NOT NULL`). The WHERE below repeats only the status half:
 * the consent half is the NOT NULL column itself (a row without consent cannot exist,
 * and Prisma does not accept a null filter on a required field). Under fabrika_app the
 * WHERE is therefore a second copy of the status check, not the only guard; the owner
 * role bypasses RLS, which is why the WHERE stays.
 *
 * What leaves this file: no name, e-mail, organisation, ORCID, LinkedIn, project
 * codes, consent dates, IP hash or token. The tenant sees a pseudonymous card;
 * contact between a tenant and an expert is the S2 marketplace.
 */

/** Every pre-registered expert is in Türkiye: the form only offers Turkish provinces. */
const EXPERT_COUNTRY = 'TR';

/** Upper bound per read: the pool is matched in memory, so it must not grow unbounded. */
const DIRECTORY_LIMIT = 2_000;

export async function listDirectoryExperts(db: PrismaClient = prisma): Promise<ExpertPoolEntry[]> {
  const rows = await withSystemScopeOn(db, 'expert-directory', 'expert-prereg.directory', (tx) =>
    tx.expertPreRegistration.findMany({
      // visibilityConsentAt is NOT NULL: the form refuses a registration without it
      // (schema.ts `visibilityConsent: z.literal(true)`), so `verified` is the whole test here.
      where: { status: 'verified' },
      select: {
        id: true,
        founderNumber: true,
        province: true,
        isFreelancer: true,
        roles: true,
        programmes: true,
        expertiseAreas: true,
        languages: true,
      },
      orderBy: [{ founderNumber: 'asc' }, { createdAt: 'asc' }],
      take: DIRECTORY_LIMIT,
    })
  );
  return rows.map((r) => ({ ...r, country: EXPERT_COUNTRY }));
}
