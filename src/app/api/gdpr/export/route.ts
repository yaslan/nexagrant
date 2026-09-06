import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';

// Mock auth since it's not fully wired in the repo
async function getAuth() {
  return { user: { id: 'mock-user-id' } };
}

export async function GET(req: NextRequest) {
  const session = await getAuth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const userId = session.user.id;

  // Gather user data
  const user = await prisma.user.findUnique({
    where: { id: userId },
    include: {
      memberships: true,
      accounts: true,
    }
  });

  const efforts = await prisma.effort.findMany({
    where: { userId }
  });

  const aiLogs = await prisma.aiUsageLog.findMany({
    where: { userId }
  });

  const exportData = {
    user,
    efforts,
    aiLogs,
    exportedAt: new Date().toISOString()
  };

  return new NextResponse(JSON.stringify(exportData, null, 2), {
    headers: {
      'Content-Type': 'application/json',
      'Content-Disposition': `attachment; filename="gdpr_export_${userId}.json"`
    }
  });
}
