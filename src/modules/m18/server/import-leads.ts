import type { TenantTx } from '@/lib/db';
import { parseCsvText, planImport, summarisePlan, type ColumnMapping, type ParsedCsv } from './import-csv';

/**
 * Tenant-bound side of the CSV import (NG-135 / F3). The transaction is a parameter: callers
 * wrap it in `withTenant`, tests pass a fake. Writes go in chunks of 500 `createMany` calls,
 * so a 1.000-row file is two round trips, not a thousand.
 */

const WRITE_CHUNK = 500;

export async function previewImport(tx: TenantTx, tenantId: string, csvText: string, mapping: ColumnMapping) {
  const csv = parseCsvText(csvText);
  const existing = await loadExisting(tx, tenantId);
  return { headers: csv.headers, summary: summarisePlan(planImport(csv, mapping, existing)) };
}

export async function commitImport(
  tx: TenantTx,
  tenantId: string,
  csvText: string,
  mapping: ColumnMapping,
  ownerUserId: string | null,
) {
  const csv: ParsedCsv = parseCsvText(csvText);
  const existing = await loadExisting(tx, tenantId);
  const plan = planImport(csv, mapping, existing);
  for (let i = 0; i < plan.valid.length; i += WRITE_CHUNK) {
    const chunk = plan.valid.slice(i, i + WRITE_CHUNK);
    await tx.leadOrganization.createMany({
      data: chunk.map(({ input, key }) => ({
        tenantId,
        name: input.name,
        legalName: input.legalName,
        provinceCode: input.provinceCode,
        website: input.website,
        sizeBand: input.sizeBand,
        dedupeKey: key,
        ownerUserId,
        lifecycle: 'LEAD',
      })),
    });
  }
  return { created: plan.valid.length, skipped: plan.duplicates.length, invalid: plan.invalid.length, total: plan.total };
}

async function loadExisting(tx: TenantTx, tenantId: string) {
  return tx.leadOrganization.findMany({
    where: { tenantId, deletedAt: null },
    select: { id: true, name: true, provinceCode: true, dedupeKey: true },
    take: 50_000,
  });
}
