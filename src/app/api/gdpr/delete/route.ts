import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { deleteUserFilesFromR2 } from '@/lib/storage';

async function getAuth() {
  return { user: { id: 'mock-user-id' } };
}

export async function DELETE(req: NextRequest) {
  const session = await getAuth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const userId = session.user.id;

  try {
    // 1. Hard delete user, which cascades to accounts, sessions, memberships
    await prisma.user.delete({
      where: { id: userId }
    });
    
    // 2. Clean up other relations
    await prisma.effort.deleteMany({ where: { userId } });
    await prisma.aiUsageLog.updateMany({ where: { userId }, data: { userId: null } });

    // 3. Clean up physical files from R2 Storage
    // Intentionally not awaiting in the critical path to respond faster, 
    // or we can await it if we want strict consistency. We will await it.
    await deleteUserFilesFromR2(userId);

    return NextResponse.json({ success: true, message: 'Account deleted successfully' });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
