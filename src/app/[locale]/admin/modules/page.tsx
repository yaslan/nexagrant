import React from 'react';
import { prisma } from '@/lib/db';
import { AdminModulesClient } from './client';
import { ModuleStatus } from '@/lib/modules/types';
import { errorMessage } from '@/lib/errors';

export default async function AdminModulesPage() {
  // The demo fallback here was actively dangerous, not just cosmetic: it put
  // `demo-tenant-1` / `demo-tenant-2` in the picker, and those are real seeded
  // rows — an admin flipping a module on the "preview" was writing ModuleState
  // and AuditEvent rows into a live tenant. Real tenants or an empty picker.
  let tenants: { id: string; name: string; slug: string }[] = [];
  const initialStates: Record<string, Record<string, ModuleStatus>> = {};
  let loadError: string | null = null;

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
      // The per-tenant bucket is held in a local rather than re-read from the
      // map: assigning through `initialStates[s.tenantId]` immediately after the
      // `if (!...)` init does not narrow it back to a defined value.
      const tenantStates = initialStates[s.tenantId] ?? {};
      tenantStates[s.moduleId] = s.status as ModuleStatus;
      initialStates[s.tenantId] = tenantStates;
    }
  } catch (error) {
    console.error(`[AdminModulesPage] DB query failed: ${errorMessage(error)}`);
    loadError = 'Kiracı listesi okunamadı (veritabanına ulaşılamıyor).';
  }

  const initialTenantId = tenants[0]?.id;

  if (!initialTenantId) {
    return (
      <div className="max-w-6xl mx-auto p-6">
        <div className="bg-surface border rounded-xl p-8 text-center">
          <h1 className="text-xl font-bold text-ink mb-2">Modül Yönetimi</h1>
          <p className="text-sm text-muted">
            {loadError || 'Kayıtlı kiracı yok — yönetilecek modül durumu bulunmuyor.'}
          </p>
        </div>
      </div>
    );
  }

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
