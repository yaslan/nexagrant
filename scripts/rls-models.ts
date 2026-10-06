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
  // TASK-MULR765AR5G0C: a contact request from an anonymous visitor of the
  // readiness scorecard. No account, hence no tenant; read by platform admins
  // only (/admin/leads), same standing as User. See prisma/migrations/add-public-lead.sql.
  'PublicLead',
  // AKTAR-MURBCJ0A-1: a post on the public blog. Platform content shown to
  // anonymous visitors, owned by no tenant; written only by /admin/blog behind
  // requirePlatformAdmin(). See prisma/migrations/add-blog-post.sql.
  'BlogPost',
  // TASK-MUWDA86A7U4LK: the programme catalogue (HE, DEP, EUREKA, …) behind
  // Call. No tenantId, never was; it simply was never listed. Listed now so the
  // policy-less set below — and the DISABLE loop in prisma/rls.sql derived from
  // it — covers every table Supabase's ensure_rls trigger would lock.
  'Programme',
]);

/**
 * SYSTEM_WIDE (or tenant-less) tables that DO carry policies: the read-only
 * platform block in prisma/rls.sql (platform_read + platform_no_*). Their RLS is
 * on on purpose. tests/rls-coverage.test.ts pins this set to that block.
 */
export const PLATFORM_POLICY: ReadonlySet<string> = new Set(['Plan', 'PlanVersion', 'PlanFeature']);

/**
 * Tables designed with no RLS at all: SYSTEM_WIDE minus PLATFORM_POLICY.
 *
 * TASK-MUWDA86A7U4LK: the live Supabase project has an `ensure_rls` event
 * trigger (ddl_command_end → public.rls_auto_enable(), owned by the platform,
 * not by us) that runs ENABLE ROW LEVEL SECURITY on every table created in
 * `public`. On one of these tables that means RLS on with zero policies — deny
 * all for fabrika_app: 0 rows read, every INSERT refused. BlogPost was in that
 * state on live (06.10.2026, TASK-MUTP1R1C13GE3). So each of them is DISABLEd
 * explicitly: in the migration that creates it (CHECK 4c,
 * scripts/rls-migrations.ts) and again by the loop in prisma/rls.sql, whose
 * list tests/rls-coverage.test.ts pins to this function.
 */
export function policylessSystemWide(): string[] {
  return [...SYSTEM_WIDE].filter((t) => !PLATFORM_POLICY.has(t)).sort();
}

/**
 * Nullable tenantId where NULL means "shared with every tenant": covered by the
 * tenant_or_shared policy, not tenant_isolation.
 *
 * `AuditEvent` is NOT here, although its tenantId is `String?`. It sat here from
 * TASK-MTU6HUB8FUHMG C-2 until TASK-MULUJ8O4JH1PF, and the shared policy made
 * its NULL rows — platform plan events and tenant-less KVKK/GDPR erasure
 * records, which belong to NO tenant — readable and writable by every tenant.
 * It is strict now; its NULL rows go through withSystemScope. A table belongs
 * here only if its NULL rows are meant to be public to all tenants.
 */
export const NULLABLE_TENANT: ReadonlySet<string> = new Set([
  'Document', 'Chunk', 'ConceptTemplate',
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
