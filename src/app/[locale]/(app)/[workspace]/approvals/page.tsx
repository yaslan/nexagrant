import { listApprovalRequests } from '@/lib/approval-requests';
import { effectiveApprovalStatus } from '@/lib/approval-request-rules';
import ApprovalsClient, { type ApprovalRequestItem } from './client';
import type { Role } from '@prisma/client';
import { requireTenantPageRole } from '@/lib/page-role';
import { errorMessage } from '@/lib/errors';
import { moduleGate } from '@/lib/modules/guard';
import { getTranslations } from 'next-intl/server';

export default async function ApprovalsPage({
  params
}: {
  params: Promise<{ locale: string; workspace: string }>;
}) {
  const { locale, workspace } = await params;
  // The Approval Centre is an M5 feature (docs/MODULES.md). The sidebar lock is
  // navigation only; this is the door, and `onay-merkezi` re-exports this page.
  const locked = await moduleGate('M5', locale);
  if (locked) return locked;

  // Role door (NG-64): the page used to read the session itself and draw the
  // list for a session without a role as if it were MEMBER. A role that cannot
  // ask for a dual approval gets the 403 screen; the role is never assumed.
  const { tenantId, userId: currentUserId, role } = await requireTenantPageRole(locale, 'request_dual_approval');
  const currentUserRole = role as Role;
  const t = await getTranslations('Approvals');

  let requests: ApprovalRequestItem[] = [];
  try {
    if (tenantId) {
      // A PENDING row past its expiry is shown as EXPIRED; the row itself is
      // written EXPIRED by the next action that meets it (src/lib/approval-requests.ts).
      const now = new Date();
      requests = (await listApprovalRequests(tenantId)).map((r) => ({
        ...r,
        payload: (r.payload ?? {}) as Record<string, unknown>,
        status: effectiveApprovalStatus(r.status, r.expiresAt, now),
      }));
    }
  } catch (e) {
    console.warn(`[Approvals] DB query bypassed or fallback: ${errorMessage(e)}`);
  }

  return (
    <div className="max-w-6xl mx-auto py-8 sm:px-4">
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
