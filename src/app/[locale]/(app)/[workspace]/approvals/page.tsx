import { prisma } from '@/lib/db';
import { auth } from '@/lib/auth';
import ApprovalsClient from './client';
import { Role } from '@prisma/client';
import { errorMessage } from '@/lib/errors';

export default async function ApprovalsPage({
  params
}: {
  params: Promise<{ locale: string; workspace: string }>;
}) {
  const { locale, workspace } = await params;
  const session = await auth();
  const tenantId = session?.tenantId;
  const currentUserId = session?.user?.id || '';
  const currentUserRole = (session?.role as Role) || 'MEMBER';

  let requests: any[] = [];
  try {
    if (tenantId) {
      requests = await prisma.approvalRequest.findMany({
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
    }
  } catch (e) {
    console.warn(`[Approvals] DB query bypassed or fallback: ${errorMessage(e)}`);
  }

  return (
    <div className="max-w-6xl mx-auto py-8 px-4">
      <div className="mb-8">
        <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-indigo-600 dark:text-indigo-400 mb-1">
          <span>Kurumsal Güvenlik</span>
          <span>•</span>
          <span>4-Eyes İlkesi</span>
        </div>
        <h1 className="text-3xl font-bold font-heading">Kurumsal Onay Merkezi</h1>
        <p className="text-gray-500 mt-2 max-w-3xl">
          Kritik bütçe, G4 başvuru onayı, hukuki taahhütler ve yönetici yetki değişiklikleri için Çift Onay (Maker-Checker) yönetim merkezi.
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
