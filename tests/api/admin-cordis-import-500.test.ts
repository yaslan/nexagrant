/**
 * İNCELEME-70 Y-1 (TASK-MUNVVMJDEO932) — POST /api/admin/cordis/import.
 *
 * The catch branch already answered with a fixed code, but a failed run came
 * back through `!importRes.success` and put the importer's raw message (SQL,
 * file paths) in the 500 body. The source guard cannot see that shape: it is a
 * field passed through, not `.message`. This pins the body instead.
 */
import { describe, test, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

const m = vi.hoisted(() => ({
  runCordisImport: vi.fn(),
  generatePartnerProfiles: vi.fn(),
}));

vi.mock('@/lib/tenant', () => ({ requirePlatformAdminApi: vi.fn(async () => ({ ok: true })) }));
vi.mock('@/lib/k2-cordis/importer', () => ({ runCordisImport: m.runCordisImport }));
vi.mock('@/lib/k2-cordis/partnerProfileJob', () => ({ generatePartnerProfiles: m.generatePartnerProfiles }));
vi.mock('@/lib/logger', () => ({ logger: { error: vi.fn(), info: vi.fn(), warn: vi.fn() } }));

import { POST } from '@/app/api/admin/cordis/import/route';
import { logger } from '@/lib/logger';

function post() {
  return POST(new NextRequest('http://localhost/api/admin/cordis/import', { method: 'POST', body: '{}' }));
}

beforeEach(() => {
  vi.spyOn(console, 'log').mockImplementation(() => {});
  m.runCordisImport.mockReset();
  m.generatePartnerProfiles.mockReset();
});

describe('/api/admin/cordis/import 500 body', () => {
  test('a failed run returns a fixed code and the run id', async () => {
    // Since İNCELEME-100 Y-1 the importer returns a code, not the message; the
    // detail is on the run row and in the importer's own log line.
    m.runCordisImport.mockResolvedValue({ success: false, runId: 'run-42', errorCode: 'IMPORT_FAILED' });
    const res = await post();
    expect(res.status).toBe(500);
    const text = await res.text();
    expect(JSON.parse(text)).toEqual({ success: false, error: 'import_failed', runId: 'run-42' });
    expect(text).not.toMatch(/CordisProject|secret|\/srv/);
    expect(logger.error).toHaveBeenCalledWith(expect.any(String), 'IMPORT_FAILED', { runId: 'run-42' });
    expect(m.generatePartnerProfiles).not.toHaveBeenCalled();
  });

  test('a thrown error returns internal_error', async () => {
    m.runCordisImport.mockRejectedValue(new Error('connect ECONNREFUSED 10.0.0.5:5432 secret'));
    const res = await post();
    expect(res.status).toBe(500);
    expect(await res.json()).toEqual({ success: false, error: 'internal_error' });
  });
});
