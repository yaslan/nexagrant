/**
 * İNCELEME-75 Y-1 (TASK-MUNY0O53ITDU4) — the GDPR export and erasure endpoints.
 *
 * The actions returned `error instanceof Error ? error.message : …` and six
 * route handlers passed it on as the 500 body, so a database failure showed the
 * signed-in subject `Invalid \`prisma.evaluation.findMany()\` invocation: The
 * table \`public.Evaluation\` does not exist…`. The source guard cannot see a
 * field passed through; this pins the body, and the server action result the
 * privacy page gets through the same code.
 */
import { describe, test, expect, vi, beforeEach } from 'vitest';

const PRISMA_TEXT =
  'Invalid `prisma.user.update()` invocation:\n\nDatabase error. Code: `P0001`. Message: `internal-detail: tablo=User kolon=deletedAt`';

const m = vi.hoisted(() => ({ session: null as { user: { id: string } } | null }));

vi.mock('@/lib/auth', () => ({ auth: async () => m.session }));
vi.mock('@/lib/system-scope', () => ({
  withSystemScope: vi.fn(async () => {
    throw new Error(PRISMA_TEXT);
  }),
}));
vi.mock('@/lib/db', () => ({
  prisma: new Proxy({}, { get: () => { throw new Error(PRISMA_TEXT); } }),
  withTenant: vi.fn(async () => {
    throw new Error(PRISMA_TEXT);
  }),
}));
vi.mock('@/lib/email/mailer', () => ({ smtpMailer: () => null, reportMailNotConfigured: vi.fn() }));

import { exportUserData } from '@/actions/user/export-data';
import { requestAccountDeletion, cancelAccountDeletion } from '@/actions/user/request-deletion';
import { POST as userExport } from '@/app/api/user/export/route';
import { POST as userExportData } from '@/app/api/user/export-data/route';
import { GET as gdprExport } from '@/app/api/gdpr/export/route';
import { DELETE as gdprDelete } from '@/app/api/gdpr/delete/route';
import { POST as requestDeletion, DELETE as cancelDeletion } from '@/app/api/user/request-deletion/route';

const LEAK = /prisma|invocation|P0001|tablo|deletedAt|Database error/i;

beforeEach(() => {
  m.session = { user: { id: 'user-1' } };
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

describe('GDPR routes: a server failure answers with a fixed code', () => {
  const routes: [string, () => Promise<Response>, string][] = [
    ['POST /api/user/export', userExport, 'export_failed'],
    ['POST /api/user/export-data', userExportData, 'export_failed'],
    ['GET /api/gdpr/export', gdprExport, 'export_failed'],
    ['DELETE /api/gdpr/delete', gdprDelete, 'request_failed'],
    ['POST /api/user/request-deletion', requestDeletion, 'request_failed'],
    ['DELETE /api/user/request-deletion', cancelDeletion, 'cancel_failed'],
  ];

  for (const [name, handler, code] of routes) {
    test(`${name} → 500 { error: '${code}' }, detail only in the log`, async () => {
      const res = await handler();
      expect(res.status).toBe(500);
      const text = await res.text();
      expect(JSON.parse(text)).toEqual({ error: code });
      expect(text).not.toMatch(LEAK);
      expect(console.error).toHaveBeenCalledWith(expect.any(String), expect.objectContaining({ message: PRISMA_TEXT }));
    });

    test(`${name} → 401 without a session`, async () => {
      m.session = null;
      const res = await handler();
      expect(res.status).toBe(401);
      expect(await res.json()).toEqual({ error: 'Unauthorized' });
    });
  }
});

describe('GDPR server actions: the result the privacy page receives', () => {
  test('carries a code, not the thrown text', async () => {
    const results = [await exportUserData(), await requestAccountDeletion(), await cancelAccountDeletion()];
    expect(results.map((r) => r.error)).toEqual(['export_failed', 'request_failed', 'cancel_failed']);
    for (const r of results) expect(JSON.stringify(r)).not.toMatch(LEAK);
  });
});
