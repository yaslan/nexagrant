import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { createPortalSession } from '@/lib/billing/create-portal-session';

export async function POST(request: NextRequest) {
  try {
    const session = await auth();

    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const membership = await prisma.membership.findFirst({
      where: {
        userId: session.user.id,
        role: { in: ['TENANT_OWNER', 'TENANT_ADMIN'] },
      },
      include: { tenant: true },
    });

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
