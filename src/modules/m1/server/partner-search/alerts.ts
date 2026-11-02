import type { prisma } from '@/lib/db';
import { PARTNER_SEARCH_ALERT_SOURCE } from '@/lib/adapters/partner-search';

/**
 * FO-338 (FO-335 Ö-1). The admin console's "Open alerts" figure, as one function.
 *
 * The ingestor stores its alerts under PARTNER_SEARCH_ALERT_SOURCE (createAdapterAlert),
 * never under PARTNER_SEARCH_SOURCE. The page and the BUG-1 live test both call this
 * function, so a regression to the wrong source fails the test instead of only the page.
 */
export type OpenAlertCounter = Pick<typeof prisma, 'systemAlert'>;

export function countOpenIngestionAlerts(db: OpenAlertCounter): Promise<number> {
  return db.systemAlert.count({ where: { source: PARTNER_SEARCH_ALERT_SOURCE, resolvedAt: null } });
}
