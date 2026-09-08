import { prisma } from '@/lib/db';
import { auth } from '@/lib/auth';
import ApprovalsClient, { type ApprovalRequestItem } from './client';
import { Role } from '@prisma/client';
import { errorMessage } from '@/lib/errors';
import { getTranslations } from 'next-intl/server';

export default async function ApprovalsPage({
  params
}: {
  params: Promise<{ locale: string; workspace: string }>;
}) {
  const { locale, workspace } = await params;
  const t = await getTranslations('Approvals');
  const session = await auth();
  const tenantId = session?.tenantId;
  const currentUserId = session?.user?.id || '';
  const currentUserRole = (session?.role as Role) || 'MEMBER';

  let requests: ApprovalRequestItem[] = [];
  try {
    if (tenantId) {
      const rawRequests = await prisma.approvalRequest.findMany({
        where: { tenantId },
        include: {
          requester: {
            select: { id: true, name: true, email: true },
          },
          approver: {
            select: { id: true, name: true, email: true },
          },
        },
        orderBy: { createdAt: 'desc' },
      });
      requests = rawRequests as unknown as ApprovalRequestItem[];
    }
  } catch (e) {
    console.warn(`[Approvals] DB query bypassed or fallback: ${errorMessage(e)}`);
  }

  return (
    <div className="max-w-6xl mx-auto py-8 px-4">
      <div className="mb-8">
        <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-indigo-600 dark:text-indigo-400 mb-1">
          <span>{t('breadcrumbSecurity')}</span>
          <span>•</span>
          <span>{t('breadcrumbPrinciple')}</span>
        </div>
        <h1 className="text-3xl font-bold font-heading">{t('title')}</h1>
        <p className="text-gray-500 mt-2 max-w-3xl">
          {t('pageDescription')}
        </p>
      </div>

      <ApprovalsClient
        initialRequests={requests}
        currentUserId={currentUserId}
        currentUserRole={currentUserRole}
        workspace={workspace}
        locale={locale}
      />
    </div>
  );
}
