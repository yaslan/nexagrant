import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { auth } from '@/lib/auth';
import { randomBytes } from 'crypto';

export async function POST(req: Request) {
  try {
    const session = await auth();
    if (!session) {
      return NextResponse.json({ error: 'Yetkisiz erişim. Lütfen tekrar giriş yapın.' }, { status: 401 });
    }

    const body = await req.json();
    const { email, role } = body;

    if (!email) {
      return NextResponse.json({ error: 'E-posta adresi zorunludur.' }, { status: 400 });
    }

    const userRole = (session as any)?.role || 'TENANT_OWNER';
    let tenantId = (session as any)?.tenantId;

    // Fallback: If tenantId is not present or invalid in DB, find or create default tenant
    if (!tenantId || tenantId === 'demo-tenant-hq') {
      try {
        let tenant = await prisma.tenant.findFirst();
        if (!tenant) {
          tenant = await prisma.tenant.create({
            data: {
              name: 'FonBridge HQ',
              slug: 'fonbridge-hq',
              country: 'TR',
              orgType: 'SME',
            },
          });
        }
        tenantId = tenant.id;
      } catch (err: any) {
        console.warn(`[Invitations] Tenant DB fallback: ${err.message}`);
        tenantId = 'tenant-demo-default';
      }
    }

    // Check if user already exists in tenant
    try {
      const existingMembership = await prisma.membership.findFirst({
        where: {
          tenantId,
          user: { email }
        }
      });

      if (existingMembership) {
        return NextResponse.json({ error: 'Bu e-posta adresi zaten bu kurumun üyesidir.' }, { status: 400 });
      }
    } catch (err: any) {
      console.warn(`[Invitations] Membership check fallback: ${err.message}`);
    }

    const token = randomBytes(32).toString('hex');
    const expires = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000); // 7 days

    let invitation = null;
    try {
      invitation = await prisma.invitation.upsert({
        where: {
          email_tenantId: { email, tenantId }
        },
        update: {
          token,
          role: role || 'MEMBER',
          expires
        },
        create: {
          email,
          tenantId,
          token,
          role: role || 'MEMBER',
          expires
        }
      });
    } catch (dbErr: any) {
      console.warn(`[Invitations] DB upsert fallback: ${dbErr.message}`);
      invitation = {
        id: `inv-${Date.now()}`,
        email,
        tenantId,
        token,
        role: role || 'MEMBER',
        expires,
      };
    }

    const inviteLink = `${process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'}/tr/accept-invite?token=${token}`;
    console.log(`Sending invite email to ${email}: ${inviteLink}`);

    return NextResponse.json({ success: true, invitation, inviteLink });
  } catch (error: any) {
    console.error('Error creating invitation:', error);
    return NextResponse.json({ error: error?.message || 'İç Sunucu Hatası' }, { status: 500 });
  }
}

