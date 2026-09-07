'use server';

import { requireTenantAction } from '@/lib/tenant';
import { prisma } from '@/lib/db';

export async function disconnectCalendar(connectionId: string) {
  const { tenantId, userId } = await requireTenantAction();

  const connection = await prisma.calendarConnection.findUnique({
    where: { id: connectionId },
  });

  if (!connection) {
    throw new Error('Calendar connection not found');
  }

  if (connection.tenantId !== tenantId || connection.userId !== userId) {
    throw new Error('Unauthorized');
  }

  await prisma.calendarConnection.delete({
    where: { id: connectionId },
  });

  return { success: true };
}

export async function connectCalendar(provider: 'google' | 'outlook' | 'ics') {
  const { tenantId, userId } = await requireTenantAction();

  // Check if connection already exists
  const existing = await prisma.calendarConnection.findUnique({
    where: { tenantId_userId_provider: { tenantId, userId, provider } },
  });

  if (existing) {
    throw new Error('Calendar already connected');
  }

  // Create a pending connection record
  // In production, this would be part of an OAuth flow
  const connection = await prisma.calendarConnection.create({
    data: {
      id: `cal-${Date.now()}`,
      tenantId,
      userId,
      provider,
      isConnected: false,
      externalId: null,
      accessToken: null,
      refreshToken: null,
    },
  });

  return { success: true, connectionId: connection.id };
}
