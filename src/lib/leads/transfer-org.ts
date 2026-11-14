import type { PrismaClient } from '@prisma/client';
import { prisma } from '@/lib/db';
import { leadTransferConsentEnabled } from '@/lib/env';
import { parseProvince } from '@/lib/readiness/share';

/**
 * NG-179 — the name of the consultancy organisation that serves a province, as the
 * anonymous visitor may see it on the transfer box. Returns the NAME only: never the
 * tenant id, never another province's organisation. Null when the province is empty,
 * unknown, unmapped, or its tenant is no longer eligible.
 *
 * Reads through `public.province_transfer_org_name(text)` (prisma/migrations/
 * add-province-transfer-org-name.sql), a SECURITY DEFINER function that takes one
 * province and returns one text. ProvinceLeadRoute itself stays closed to the visitor's
 * 'public-intake' scope (NG-175 D-1): reading it under that scope returns 0 rows, so the
 * box never showed. The eligibility rule inside the function is isIntakeTenant()'s
 * (src/modules/m18/server/intake.ts); tests/transfer-org-name.live.test.ts pins the two together.
 */
export async function transferOrgNameFor(province: string | null | undefined, db: PrismaClient = prisma): Promise<string | null> {
  // Publication gate (LEAD_TRANSFER_CONSENT_ENABLED): while off, nothing is looked up and the box never shows.
  if (!leadTransferConsentEnabled()) return null;
  const name = parseProvince(province ?? null);
  if (!name) return null;
  const rows = await db.$queryRaw<Array<{ name: string | null }>>`
    SELECT public.province_transfer_org_name(${name}) AS name
  `;
  return rows[0]?.name ?? null;
}
