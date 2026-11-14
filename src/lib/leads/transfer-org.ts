import type { PrismaClient } from '@prisma/client';
import { prisma } from '@/lib/db';
import { leadTransferConsentEnabled } from '@/lib/env';
import { parseProvince } from '@/lib/readiness/share';
import { withSystemScopeOn } from '@/lib/system-scope';
import { isIntakeTenant } from '@/modules/m18/server/intake';

/**
 * NG-179 — the name of the consultancy organisation that serves a province, as the
 * anonymous visitor may see it on the transfer box. Returns the NAME only: never the
 * tenant id, never another province's organisation. Null when the province is empty,
 * unknown, unmapped, or its tenant is no longer eligible. Reads ProvinceLeadRoute
 * (platform data) under the visitor's own purpose.
 */
export async function transferOrgNameFor(province: string | null | undefined, db: PrismaClient = prisma): Promise<string | null> {
  // Publication gate (LEAD_TRANSFER_CONSENT_ENABLED): while off, nothing is looked up and the box never shows.
  if (!leadTransferConsentEnabled()) return null;
  const name = parseProvince(province ?? null);
  if (!name) return null;
  return withSystemScopeOn(db, 'public-intake', 'lead-transfer.org-name', async (tx) => {
    const route = await tx.provinceLeadRoute.findFirst({
      where: { province: name, active: true },
      select: { tenant: { select: { name: true, orgType: true, kind: true, deletedAt: true } } },
    });
    if (!route || !isIntakeTenant(route.tenant)) return null;
    return route.tenant.name;
  });
}
