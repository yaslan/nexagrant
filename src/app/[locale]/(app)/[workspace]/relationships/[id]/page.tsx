import { notFound } from 'next/navigation';
import Link from 'next/link';

import { requireTenantPage } from '@/lib/tenant';
import { moduleGate } from '@/lib/modules/guard';

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
  const locked = await moduleGate('M4', locale);
  if (locked) return locked;

  // Redirects an anonymous visitor to login and a signed-in user with no
  // membership to /no-workspace. It cannot hand back a null or empty tenant.
  const { tenantId } = await requireTenantPage(locale);

  const data = await loadRelationshipDetail(tenantId, id);
  // Another tenant's id and a non-existent id give the same 404 on purpose.
  if (!data) return notFound();

  return (
    <div className="max-w-4xl mx-auto py-8 px-4">
      <Link
        href={`/${locale}/${workspace}/relationships`}
        className="text-muted hover:text-ink mb-4 inline-block"
      >
        ← Back
      </Link>

      <RelationshipDetail
        relationship={data.relationship}
        interactions={data.interactions}
      />
    </div>
  );
}
