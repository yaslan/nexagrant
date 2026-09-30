import { NextRequest, NextResponse } from 'next/server';
import { withSystemScope } from '@/lib/system-scope';
import { createPortalSession } from '@/lib/billing/create-portal-session';
import { Role } from '@prisma/client';
import { can } from '@/lib/rbac';
import { requireTenantApi } from '@/lib/tenant';

/**
 * The roles that may manage the tenant's subscription, read from rbac.ts
 * rather than restated: `manage_billing` is the owner's alone. The list here
 * used to be OWNER and ADMIN, which let an admin change the payment method and
 * cancel the plan the owner pays for (İNCELEME-59 Y-3, TASK-MUNQAXELV83HO).
 */
const BILLING_ROLES = Object.values(Role).filter((role) => can(role, 'manage_billing'));

export async function POST(request: NextRequest) {
  try {
    const tenant = await requireTenantApi();
    if (!tenant.ok) return tenant.response;
    // Hoisted: the narrowing above does not survive into the callback below.
    const { userId, tenantId: sessionTenantId } = tenant.scope;

    // Is the signed-in user an owner of the tenant the session is in? Read from
    // the membership row, not the token's role, which is only refreshed at
    // sign-in. Scoped to the session tenant (İNCELEME-63 Ö-A,
    // TASK-MUNSRKW0HJYBV): without it, a member of one tenant who owns another
    // opened the other one's portal, and an owner of two got either.
    const membership = await withSystemScope(
      'tenant-discovery',
      'billing-portal.ownedTenantForUser',
      (tx) =>
        tx.membership.findFirst({
          where: {
            userId,
            tenantId: sessionTenantId,
            role: { in: BILLING_ROLES },
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
    // The message names the tenant and carries Stripe's own text: it stays in
    // the log, the browser gets the sentence (İNCELEME-63 Ö-B).
    console.error('Portal session error:', error);
    return NextResponse.json({ error: 'Failed to create portal session' }, { status: 500 });
  }
}
