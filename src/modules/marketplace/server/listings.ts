import { withTenant } from '@/lib/db';
import type { MarketplaceListingRow } from '@/types/db-rows';

/**
 * Reads of `MarketplaceListing`, in one place.
 *
 * TASK-MTVTQTJIQ5SDB. The model made two contradictory claims at once:
 * `prisma/schema.prisma` gives it a NON-NULL `tenantId` and `prisma/rls.sql:13`
 * lists it under `tenant_isolation`, so the database was told every row has an
 * owner — while the marketplace page read it with a bare
 * `prisma.marketplaceListing.findMany({ orderBy })`, no wrapper and no `where`
 * clause at all, under a comment calling it "a cross-tenant catalogue by
 * design". Writes went through `withTenant` the whole time
 * (`actions.ts:31`): the same table was tenant-owned when written and
 * everyone's when read.
 *
 * Both halves of the scoping below are load-bearing, because the two roles this
 * code runs as fail in opposite directions (measured 2026-09-10):
 *
 *   - `withTenant` issues `set_config('app.tenant_id', …)`, which is what makes
 *     Postgres' own policy apply. Without it, a NOBYPASSRLS role (`fabrika_app`,
 *     and any correctly configured deployment — prisma/rls.sql:2) matches
 *     `"tenantId" = NULL`, returns **zero rows**, and the page silently falls
 *     through to its hardcoded demo listings.
 *   - `where: { tenantId }` is what scopes the read for the role the app
 *     actually connects as today: `DATABASE_URL` is `fabrika`, which is
 *     SUPERUSER + BYPASSRLS, so the policy is never evaluated and the bare read
 *     returned every tenant's rows.
 *
 * Neither arm alone is enough in both environments, so the rule lives here once
 * rather than at each call site.
 *
 * Scope note: this returns the caller's OWN listings, every status included —
 * it is the "my listings" reading of the table, which is the safe one under
 * either answer to the open product question (private list vs. deliberate
 * cross-tenant shop window). If the shop-window answer wins, the storefront
 * read is a NEW function beside this one plus a schema decision, not a widening
 * of this `where` clause.
 */
export async function listTenantListings(tenantId: string): Promise<MarketplaceListingRow[]> {
  return withTenant(tenantId, (tx) =>
    tx.marketplaceListing.findMany({
      where: { tenantId },
      orderBy: { createdAt: 'desc' },
    })
  ) as Promise<MarketplaceListingRow[]>;
}
