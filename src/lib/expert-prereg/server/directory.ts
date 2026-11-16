import type { PrismaClient } from '@prisma/client';
import type { ExpertPoolEntry } from '@/core/contracts/expert-pool';
import { prisma } from '@/lib/db';
import { withSystemScopeOn } from '@/lib/system-scope';

/**
 * NG-52 (TASK-MW2SU1H9BLCGV) — the expert pre-registrations M8 may offer as seat
 * candidates (K-579696 = A: free pre-registration only in S1).
 *
 * Who is in it: a verified address (`status = 'verified'`) that ticked the visibility
 * consent ("Profilimin uzman rehberinde yayımlanmasına rıza veriyorum"; mandatory in the
 * form, NOT NULL column). A pending or disabled row is never read.
 *
 * NG-188 (SEC NG-185 F-1b): the read goes through the view "ExpertDirectoryEntry"
 * (prisma/rls.sql), not the table. The view holds the card columns only and the row
 * condition (sealed 'expert-directory' scope + verified + consent) in its own WHERE, and
 * the purpose opens no row of ExpertPreRegistration any more. So the database, not this
 * file's select list, is what keeps name, e-mail, organisation, ORCID, LinkedIn, project
 * codes, consent dates, IP hash and token away from M8. The view's WHERE also holds for
 * the owner role, which bypasses RLS: nothing here repeats it.
 *
 * The tenant sees a pseudonymous card; contact between a tenant and an expert is the S2
 * marketplace.
 */

/** Every pre-registered expert is in Türkiye: the form only offers Turkish provinces. */
const EXPERT_COUNTRY = 'TR';

/** Upper bound per read: the pool is matched in memory, so it must not grow unbounded. */
const DIRECTORY_LIMIT = 2_000;

/** One row of the view, as Postgres returns it. */
interface DirectoryRow {
  id: string;
  founderNumber: number | null;
  province: string;
  isFreelancer: boolean;
  roles: string[];
  programmes: string[];
  expertiseAreas: string[];
  languages: string[];
}

export async function listDirectoryExperts(db: PrismaClient = prisma): Promise<ExpertPoolEntry[]> {
  const rows = await withSystemScopeOn(db, 'expert-directory', 'expert-prereg.directory', (tx) =>
    // "listOrder" is the order the NG-52 findMany used (founderNumber, then createdAt);
    // the view numbers the rows so createdAt itself never leaves the table.
    tx.$queryRaw<DirectoryRow[]>`
      SELECT id, "founderNumber", province, "isFreelancer", roles, programmes, "expertiseAreas", languages
        FROM "ExpertDirectoryEntry"
       ORDER BY "listOrder"
       LIMIT ${DIRECTORY_LIMIT}`
  );
  return rows.map((r) => ({ ...r, country: EXPERT_COUNTRY }));
}
