import React from 'react';
import { prisma } from '@/lib/db';
import { AdminModulesClient } from './client';
import { ModuleStatus } from '@/lib/modules/types';

export default async function AdminModulesPage() {
  let tenants: { id: string; name: string; slug: string }[] = [];
  const initialStates: Record<string, Record<string, ModuleStatus>> = {};

  try {
    tenants = await prisma.tenant.findMany({
      select: {
        id: true,
        name: true,
        slug: true,
      },
      orderBy: {
        name: 'asc',
      },
    });

    const allModuleStates = await prisma.moduleState.findMany();
    for (const s of allModuleStates) {
      if (!initialStates[s.tenantId]) {
        initialStates[s.tenantId] = {};
      }
      initialStates[s.tenantId][s.moduleId] = s.status as ModuleStatus;
    }
  } catch (error) {
    console.warn('PostgreSQL database server not reachable. Utilizing mock tenant data for Admin Modules Manager preview.');
  }

  // Fallback demo tenant if DB is empty or unreachable
  if (tenants.length === 0) {
    tenants = [
      { id: 'demo-tenant-1', name: 'Demo SME Consultancy', slug: 'demo-sme' },
      { id: 'demo-tenant-2', name: 'Horizon Research Lab', slug: 'horizon-lab' },
    ];
    
    // Default initial states for demo tenant 1
    initialStates['demo-tenant-1'] = {
      M1: 'ON',
      M2: 'ON',
      M3: 'ON',
      M4: 'ON',
      M5: 'ON',
      M6: 'PILOT',
      M8: 'DEV',
      M10: 'OFF',
      M11: 'OFF',
    };

    initialStates['demo-tenant-2'] = {
      M1: 'ON',
      M2: 'ON',
      M3: 'ON',
      M5: 'ON',
      M8: 'PILOT',
    };
  }

  const initialTenantId = tenants[0]?.id || 'demo-tenant-1';

  return (
    <div className="max-w-6xl mx-auto p-6 space-y-6">
      <AdminModulesClient
        tenants={tenants}
        initialTenantId={initialTenantId}
        initialStates={initialStates}
      />
    </div>
  );
}
