/**
 * E11.2 — weekly feedback digest: the pure half.
 *
 * Aggregation and HTML rendering live here, away from the job scheduler and the mailer, so
 * the numbers and the escaping are unit-testable without a scheduler or an
 * outbound email.
 */

import { PRIORITY_SLA_HOURS, type FeedbackPriorityValue } from './triage';
import { PRODUCT_NAME } from '@/lib/brand';

export interface DigestRow {
  id: string;
  title: string;
  category: string;
  priority: string;
  status: string;
  tenantName: string;
  createdAt: Date;
}

export interface DigestSummary {
  windowStart: Date;
  windowEnd: Date;
  newCount: number;
  openCount: number;
  overdueCount: number;
  byPriority: Record<FeedbackPriorityValue, number>;
  /** Open reports past their SLA, most urgent first — the part that needs action. */
  overdue: DigestRow[];
  /** Everything filed inside the window, most urgent first. */
  recent: DigestRow[];
}

const OPEN_STATUSES = new Set(['NEW', 'TRIAGED', 'IN_PROGRESS']);
const PRIORITY_RANK: Record<string, number> = { P0: 0, P1: 1, P2: 2, P3: 3 };

export function isOverdue(row: { priority: string; status: string; createdAt: Date }, now: Date): boolean {
  if (!OPEN_STATUSES.has(row.status)) return false;
  const budgetMs = (PRIORITY_SLA_HOURS[row.priority as FeedbackPriorityValue] ?? 336) * 3600_000;
  return now.getTime() - row.createdAt.getTime() > budgetMs;
}

function byUrgency(a: DigestRow, b: DigestRow): number {
  const rank = (PRIORITY_RANK[a.priority] ?? 9) - (PRIORITY_RANK[b.priority] ?? 9);
  return rank !== 0 ? rank : b.createdAt.getTime() - a.createdAt.getTime();
}

/**
 * `allOpen` is every still-open report regardless of age — an overdue P0 from
 * three weeks ago belongs in this week's digest. `windowRows` is what came in
 * during the window.
 */
export function summariseFeedback(
  windowRows: DigestRow[],
  allOpen: DigestRow[],
  windowStart: Date,
  windowEnd: Date
): DigestSummary {
  const byPriority: Record<FeedbackPriorityValue, number> = { P0: 0, P1: 0, P2: 0, P3: 0 };
  for (const row of windowRows) {
    if (row.priority in byPriority) {
      byPriority[row.priority as FeedbackPriorityValue] += 1;
    }
  }

  const overdue = allOpen.filter((row) => isOverdue(row, windowEnd)).sort(byUrgency);

  return {
    windowStart,
    windowEnd,
    newCount: windowRows.length,
    openCount: allOpen.length,
    overdueCount: overdue.length,
    byPriority,
    overdue: overdue.slice(0, 25),
    recent: [...windowRows].sort(byUrgency).slice(0, 25),
  };
}

/** Escape before interpolating: report titles are attacker-controlled free text. */
export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function formatDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function rowsTable(rows: DigestRow[], emptyText: string): string {
  if (rows.length === 0) return `<p style="color:#64748b;font-size:13px">${emptyText}</p>`;
  const body = rows
    .map(
      (r) => `<tr>
      <td style="padding:6px 10px;border-bottom:1px solid #e2e8f0;font-family:monospace;font-weight:700">${escapeHtml(r.priority)}</td>
      <td style="padding:6px 10px;border-bottom:1px solid #e2e8f0">${escapeHtml(r.title)}</td>
      <td style="padding:6px 10px;border-bottom:1px solid #e2e8f0;font-size:12px;color:#475569">${escapeHtml(r.tenantName)}</td>
      <td style="padding:6px 10px;border-bottom:1px solid #e2e8f0;font-size:12px;color:#475569">${escapeHtml(r.status)}</td>
      <td style="padding:6px 10px;border-bottom:1px solid #e2e8f0;font-size:12px;color:#475569">${formatDate(r.createdAt)}</td>
    </tr>`
    )
    .join('');
  return `<table style="width:100%;border-collapse:collapse;font-size:14px">
    <thead><tr style="text-align:left;background:#f1f5f9">
      <th style="padding:6px 10px">Priority</th><th style="padding:6px 10px">Report</th>
      <th style="padding:6px 10px">Tenant</th><th style="padding:6px 10px">Status</th><th style="padding:6px 10px">Filed</th>
    </tr></thead><tbody>${body}</tbody></table>`;
}

export function renderDigestSubject(summary: DigestSummary): string {
  const urgent = summary.byPriority.P0 + summary.byPriority.P1;
  const urgentPart = urgent > 0 ? `, ${urgent} urgent` : '';
  return `${PRODUCT_NAME} beta feedback — ${summary.newCount} new${urgentPart} (week of ${formatDate(summary.windowStart)})`;
}

export function renderDigestHtml(summary: DigestSummary, appUrl: string): string {
  const boardUrl = `${appUrl.replace(/\/$/, '')}/tr/admin/feedback`;
  return `<div style="font-family:system-ui,-apple-system,Segoe UI,sans-serif;color:#0f172a;max-width:720px">
  <h2 style="margin:0 0 4px">${PRODUCT_NAME} beta feedback — weekly digest</h2>
  <p style="margin:0 0 16px;color:#64748b;font-size:13px">
    ${formatDate(summary.windowStart)} → ${formatDate(summary.windowEnd)}
  </p>

  <table style="border-collapse:collapse;font-size:14px;margin-bottom:20px">
    <tr>
      <td style="padding:8px 14px;border:1px solid #e2e8f0"><strong>${summary.newCount}</strong><br><span style="color:#64748b;font-size:12px">new this week</span></td>
      <td style="padding:8px 14px;border:1px solid #e2e8f0"><strong>${summary.openCount}</strong><br><span style="color:#64748b;font-size:12px">open total</span></td>
      <td style="padding:8px 14px;border:1px solid #e2e8f0"><strong style="color:${summary.overdueCount > 0 ? '#b91c1c' : '#0f172a'}">${summary.overdueCount}</strong><br><span style="color:#64748b;font-size:12px">past SLA</span></td>
    </tr>
  </table>

  <p style="font-size:14px;margin:0 0 8px">
    <strong>New by priority:</strong>
    P0 ${summary.byPriority.P0} ·
    P1 ${summary.byPriority.P1} ·
    P2 ${summary.byPriority.P2} ·
    P3 ${summary.byPriority.P3}
  </p>

  <h3 style="margin:24px 0 8px;font-size:15px">Past SLA — needs a reply</h3>
  ${rowsTable(summary.overdue, 'Nothing is past its response-time budget.')}

  <h3 style="margin:24px 0 8px;font-size:15px">Filed this week</h3>
  ${rowsTable(summary.recent, 'No reports were filed this week.')}

  <p style="margin-top:24px;font-size:13px">
    <a href="${escapeHtml(boardUrl)}" style="color:#1d4ed8">Open the triage board</a>
  </p>
</div>`;
}
