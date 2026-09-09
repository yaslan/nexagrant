/**
 * The list of tenant-scoped Prisma models, derived from prisma/schema.prisma.
 *
 * Shared by the two RLS gates so they can never disagree about what "covered"
 * means: scripts/check-rls.ts (does prisma/rls.sql *declare* a policy for each
 * model?) and scripts/check-rls-live.ts (does the *database* actually have one?).
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

/**
 * System-wide tables: no tenantId, no policy expected.
 *
 * Membership here is an exemption from both gates, so it is only ever correct
 * for a table that holds no tenant data at all. `ClaimEvidenceLink` and
 * `EvidenceReminder` sat in this set until TASK-MTU6HUB8FUHMG B-1 while joining
 * one tenant's Claim to that tenant's Evidence — and, in the reminder's case,
 * carrying its people's e-mail addresses. They had no RLS at all, and both
 * gates were programmed to look away, so the gate could never go red for them.
 *
 * A table belongs here because it has no tenant, never because adding it makes
 * the gate quiet. `rls-coverage.test.ts` asserts no member carries a tenantId.
 */
export const SYSTEM_WIDE: ReadonlySet<string> = new Set([
  'Tenant', 'User', 'Account', 'Session', 'VerificationToken',
  'ModuleCatalog', 'Plan', 'AddOnCatalog',
  'Call', 'Topic', 'TopicStat', 'RawFetch',
  'CordisProject', 'CordisOrganization', 'CordisParticipation',
  'CordisProjectTopic', 'CordisProjectSciVoc', 'CordisImportRun',
  'CordisPartnerProfile', 'CordisCoParticipation',
  'SystemAlert',
]);

/**
 * Nullable tenantId: covered by the shared policy, not tenant_isolation.
 *
 * `AuditEvent` joined this set in TASK-MTU6HUB8FUHMG C-2 — its tenantId is
 * `String?` and an erasure request from a tenant-less user writes exactly that
 * row, which strict isolation refused (`NULL = 'x'` is not true).
 */
export const NULLABLE_TENANT: ReadonlySet<string> = new Set([
  'Document', 'Chunk', 'ConceptTemplate', 'AuditEvent',
]);

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
