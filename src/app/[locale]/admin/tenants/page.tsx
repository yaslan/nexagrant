import React from 'react';
import { prisma } from '@/lib/db';
import { Building2, Shield, Users } from 'lucide-react';

export default async function AdminTenantsPage() {
  // CLAUDE.md §7: the tenant list is real rows or nothing. The previous
  // fallback rendered two invented organisations (with user counts and PIC
  // numbers) whenever the query failed or returned nothing, so an operator
  // could not tell an empty platform from an unreachable database.
  let tenants: any[] = [];
  let loadError: string | null = null;
  try {
    tenants = await prisma.tenant.findMany({
      include: {
        _count: {
          select: { users: true, workspaces: true }
        }
      },
      orderBy: { createdAt: 'desc' }
    });
  } catch (e: any) {
    console.error(`[AdminTenantsPage] DB query failed: ${e.message}`);
    loadError = 'Kiracı listesi okunamadı (veritabanına ulaşılamıyor).';
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-surface p-4 sm:p-6 rounded-xl border shadow-2xs">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold text-ink">Kiracı Hesapları (Tenants)</h1>
          <p className="text-xs sm:text-sm text-muted">Platformda kayıtlı tüm organizasyonlar ve üye kapasiteleri.</p>
        </div>
        <div className="flex items-center space-x-2 bg-blue-50 text-blue-800 border border-blue-200 px-3 py-1.5 rounded-lg text-xs font-semibold shrink-0 self-start sm:self-auto">
          <Building2 className="w-4 h-4 text-blue-600" />
          <span>{tenants.length} Kayıtlı Kiracı</span>
        </div>
      </div>

      <div className="bg-surface border rounded-xl shadow-2xs overflow-x-auto">
        <table className="w-full text-left border-collapse text-sm min-w-[640px]">
          <thead>
            <tr className="bg-ground border-b text-ink-2 font-semibold">
              <th className="p-4">Tenant Name</th>
              <th className="p-4">Slug</th>
              <th className="p-4">Country</th>
              <th className="p-4">Org Type</th>
              <th className="p-4">PIC</th>
              <th className="p-4 text-center">Users</th>
              <th className="p-4 text-center">Workspaces</th>
            </tr>
          </thead>
          <tbody>
            {tenants.map((t: any) => (
              <tr key={t.id} className="border-b last:border-0 hover:bg-ground transition-colors">
                <td className="p-4 font-bold text-ink">{t.name}</td>
                <td className="p-4 font-mono text-xs text-muted">{t.slug}</td>
                <td className="p-4 font-semibold text-ink-2">{t.country}</td>
                <td className="p-4">
                  <span className="bg-surface-hover text-ink-2 px-2 py-0.5 rounded font-mono text-xs font-semibold">
                    {t.orgType}
                  </span>
                </td>
                <td className="p-4 font-mono text-xs text-blue-600">{t.pic || '-'}</td>
                <td className="p-4 text-center font-bold">{t._count?.users || 0}</td>
                <td className="p-4 text-center font-bold">{t._count?.workspaces || 0}</td>
              </tr>
            ))}
            {tenants.length === 0 && (
              <tr>
                <td colSpan={7} className="p-6 text-center text-muted text-xs">
                  {loadError || 'Kayıtlı kiracı yok.'}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
