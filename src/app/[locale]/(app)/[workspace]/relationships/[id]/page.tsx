import { notFound } from 'next/navigation';
import Link from 'next/link';
import { getTranslations } from 'next-intl/server';

import { requireTenantPage } from '@/lib/tenant';
import { moduleGate } from '@/lib/modules/guard';
import { asRole, can } from '@/lib/rbac';
import { getWorkspaceMembers } from '@/lib/k5-pipeline/pipelineStore';
import { errorMessage } from '@/lib/errors';

import RelationshipDetail from './detail';
import { loadRelationshipDetail } from './data';

/**
 * One relationship in the focal-point CRM (M4).
 *
 * The tenant used to come in as `session?.tenantId` — `string | null | undefined`
 * — and go straight into `where: { id, tenantId }`. Prisma drops an `undefined`
 * clause, so a tenantless session read the row by id alone, across tenants
 * (TASK-MTRKV9JGY7OQY). Resolution now goes through `requireTenantPage`, which
 * never returns without a tenant, and the read itself lives in `./data.ts`,
 * where `tenantId` is a required `string` and re-checked before Prisma is
 * touched.
 */
export default async function RelationshipDetailPage({
  params,
}: {
  params: Promise<{ id: string; locale: string; workspace: string }>;
}) {
  const { id, locale, workspace } = await params;
  const t = await getTranslations({ locale, namespace: 'Relationships' });
  const locked = await moduleGate('M4', locale);
  if (locked) return locked;

  // Redirects an anonymous visitor to login and a signed-in user with no
  // membership to /no-workspace. It cannot hand back a null or empty tenant.
  const { tenantId, role } = await requireTenantPage(locale);

  const data = await loadRelationshipDetail(tenantId, id);
  // Another tenant's id and a non-existent id give the same 404 on purpose.
  if (!data) return notFound();

  // The focal-point picker's options. Read under this tenant's scope, so the
  // list a browser is handed can never name a person from another tenant —
  // the server action re-checks membership anyway, but an option that would be
  // refused should not be offered in the first place.
  // `updateRelationship` gates the owner field on the same permission.
  const canAssignOwner = can(asRole(role), 'manage_workspaces');
  let members: Awaited<ReturnType<typeof getWorkspaceMembers>> = [];
  try {
    members = await getWorkspaceMembers(tenantId);
  } catch (e) {
    // A member list that cannot be read renders an empty picker, never a
    // guessed one; the rest of the screen still works.
    console.warn(`[RelationshipDetail] member list unavailable: ${errorMessage(e)}`);
  }

  return (
    <div className="max-w-4xl mx-auto py-8 sm:px-4">
      <Link
        href={`/${locale}/${workspace}/relationships`}
        className="text-muted hover:text-ink mb-4 inline-block"
      >
        {t('back')}
      </Link>

      <RelationshipDetail
        relationship={data.relationship}
        interactions={data.interactions}
        members={members}
        canAssignOwner={canAssignOwner}
      />
    </div>
  );
}
