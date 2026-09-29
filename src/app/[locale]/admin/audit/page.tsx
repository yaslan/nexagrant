import React from 'react';
import { withSystemScope } from '@/lib/system-scope';
import { ScrollText } from 'lucide-react';
import { errorMessage } from '@/lib/errors';

export default async function AdminAuditPage() {
  // An audit log that invents entries is worse than an empty one: it is the
  // record an operator reaches for when they need to know what actually
  // happened. Real rows or an explicit empty/error state, never placeholders.
  /** The AuditEvent columns this table renders. */
  interface AuditEventRow {
    id: string;
    type: string;
    target: string | null;
    tenantId: string | null;
    actorId: string | null;
    createdAt: Date | string;
  }

  let auditEvents: AuditEventRow[] = [];
  let loadError: string | null = null;
  try {
    // Every tenant's events and the tenant-less ones (plan admin, KVKK/GDPR
    // erasure) — the platform-admin view, behind the admin layout's check.
    // AuditEvent is strict (TASK-MULUJ8O4JH1PF): outside system scope a
    // non-BYPASSRLS role reads zero rows here.
    auditEvents = await withSystemScope('platform-admin', 'admin-audit.list', (tx) =>
      tx.auditEvent.findMany({
        take: 50,
        orderBy: { createdAt: 'desc' }
      })
    );
  } catch (e) {
    console.error(`[AdminAuditPage] DB query failed: ${errorMessage(e)}`);
    loadError = 'Denetim kayıtları okunamadı (veritabanına ulaşılamıyor).';
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-surface p-4 sm:p-6 rounded-xl border shadow-2xs">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold text-ink">Denetim Kayıtları (Audit Logs)</h1>
          <p className="text-xs sm:text-sm text-muted">Sistem modül değişiklikleri, kapı kararları ve güvenlik olayları log geçmişi.</p>
        </div>
        <div className="flex items-center space-x-2 bg-surface-hover text-ink border border-border px-3 py-1.5 rounded-lg text-xs font-semibold shrink-0 self-start sm:self-auto">
          <ScrollText className="w-4 h-4 text-ink-2" />
          <span>{auditEvents.length} Kayıtlı Olay</span>
        </div>
      </div>

      <div className="bg-surface border rounded-xl shadow-2xs overflow-x-auto">
        <table className="w-full text-left border-collapse text-sm min-w-[600px]">
          <thead>
            <tr className="bg-ground border-b text-ink-2 font-semibold">
              <th className="p-4">Event Type</th>
              <th className="p-4">Target</th>
              <th className="p-4">Tenant ID</th>
              <th className="p-4">Actor</th>
              <th className="p-4 text-right">Timestamp</th>
            </tr>
          </thead>
          <tbody>
            {auditEvents.map((ev) => (
              <tr key={ev.id} className="border-b last:border-0 hover:bg-ground transition-colors">
                <td className="p-4 font-mono font-bold text-blue-700">{ev.type}</td>
                <td className="p-4 font-mono text-xs text-ink">{ev.target || '-'}</td>
                <td className="p-4 font-mono text-xs text-muted">{ev.tenantId || '-'}</td>
                <td className="p-4 text-xs font-semibold text-ink-2">{ev.actorId || 'system'}</td>
                <td className="p-4 text-right text-xs text-muted font-mono">
                  {new Date(ev.createdAt).toLocaleString()}
                </td>
              </tr>
            ))}
            {auditEvents.length === 0 && (
              <tr>
                <td colSpan={5} className="p-6 text-center text-muted text-xs">
                  {loadError || 'Henüz denetim kaydı yok.'}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
