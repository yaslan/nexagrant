import { prisma } from '@/lib/db';
import { auth } from '@/lib/auth';
import { notFound } from 'next/navigation';
import Link from 'next/link';
import RelationshipDetail from './detail';

export default async function RelationshipDetailPage({
  params,
}: {
  params: Promise<{ id: string; locale: string; workspace: string }>;
}) {
  const { id, locale, workspace } = await params;
  const session = await auth();
  const tenantId = (session as any)?.tenantId;

  const rel = await prisma.relationship.findFirst({
    where: { id, tenantId },
  });
  if (!rel) return notFound();

  const interactions = await prisma.interaction.findMany({
    where: { tenantId, relationshipId: id },
    orderBy: { at: 'desc' },
  });

  return (
    <div className="max-w-4xl mx-auto py-8 px-4">
      <Link
        href={`/${locale}/${workspace}/relationships`}
        className="text-muted hover:text-ink mb-4 inline-block"
      >
        ← Back
      </Link>

      <RelationshipDetail relationship={rel} interactions={interactions} />
    </div>
  );
}
