import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { withSystemScope } from '@/lib/system-scope';
import { createPortalSession } from '@/lib/billing/create-portal-session';

export async function POST(request: NextRequest) {
  try {
    const session = await auth();

    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    // Hoisted: the narrowing above does not survive into the callback below.
    const userId = session.user.id;

    // Answers "which tenant does this signed-in user own?" — scoped by
    // session.user.id and role, and the tenantId it returns is what
    // createPortalSession is then given. Nothing narrower exists to scope to
    // yet, so this is the discovery read, not a bypass.
    const membership = await withSystemScope(
      'tenant-discovery',
      'billing-portal.ownedTenantForUser',
      (tx) =>
        tx.membership.findFirst({
          where: {
            userId,
            role: { in: ['TENANT_OWNER', 'TENANT_ADMIN'] },
          },
          include: { tenant: true },
        })
    );

    if (!membership?.tenantId) {
      return NextResponse.json(
        { error: 'No tenant found or insufficient permissions' },
        { status: 403 }
      );
    }

    const tenantId = membership.tenantId;
    const returnUrl = new URL('/settings/billing', request.nextUrl.origin).toString();

    const portalUrl = await createPortalSession(tenantId, returnUrl);
    return NextResponse.json({ url: portalUrl });
  } catch (error: unknown) {
    const err = error instanceof Error ? error : new Error(String(error));
    console.error('Portal session error:', error);
    return NextResponse.json(
      { error: err.message || 'Failed to create portal session' },
      { status: 500 }
    );
  }
}
