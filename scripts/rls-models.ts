/**
 * The list of tenant-scoped Prisma models, derived from prisma/schema.prisma.
 *
 * Shared by the two RLS gates so they can never disagree about what "covered"
 * means: scripts/check-rls.ts (does prisma/rls.sql *declare* a policy for each
 * model?) and scripts/check-rls-live.ts (does the *database* actually have one?).
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

/** System-wide tables: no tenantId, no policy expected. */
const SYSTEM_WIDE = new Set([
  'Tenant', 'User', 'Account', 'Session', 'VerificationToken',
  'ModuleCatalog', 'Plan', 'AddOnCatalog',
  'Call', 'Topic', 'TopicStat', 'RawFetch',
  'CordisProject', 'CordisOrganization', 'CordisParticipation',
  'CordisProjectTopic', 'CordisProjectSciVoc', 'CordisImportRun',
  'CordisPartnerProfile', 'CordisCoParticipation',
  'SystemAlert', 'ClaimEvidenceLink', 'EvidenceReminder',
]);

/** Nullable tenantId: covered by a shared policy, not tenant_isolation. */
const NULLABLE_TENANT = new Set(['Document', 'Chunk', 'ConceptTemplate']);

export function tenantScopedModels(): string[] {
  const schema = readFileSync(resolve(process.cwd(), 'prisma/schema.prisma'), 'utf8');
  const modelRegex = /model\s+([A-Za-z0-9_]+)\s*\{([\s\S]*?)^}/gm;
  const models: string[] = [];

  let match: RegExpExecArray | null;
  while ((match = modelRegex.exec(schema)) !== null) {
    const name = match[1];
    const body = match[2];
    if (!name || !body) continue;
    if (!/^\s*tenantId\s+String/m.test(body)) continue;
    if (SYSTEM_WIDE.has(name) || NULLABLE_TENANT.has(name)) continue;
    models.push(name);
  }
  return models.sort();
}
