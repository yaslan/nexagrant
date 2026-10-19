import { NextRequest, NextResponse } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * FO-19 (TASK-MVBIXPP33UK1B) — the admin CSV export refuses anyone who is not a
 * platform admin, before it reads a single row (no personal data leaks).
 */
const exportSpy = vi.hoisted(() => vi.fn(async () => 'ad,e-posta\r\n'));
const gate = vi.hoisted(() => ({ current: null as null | { ok: boolean; response?: NextResponse } }));

vi.mock('@/lib/tenant', () => ({
  requirePlatformAdminApi: vi.fn(async () => gate.current),
}));
vi.mock('@/lib/expert-prereg/server/admin', async (importOriginal) => {
  const real = await importOriginal<typeof import('@/lib/expert-prereg/server/admin')>();
  return { ...real, exportExpertPreRegistrationsCsv: exportSpy };
});

import { GET } from '@/app/api/admin/expert-preregistrations/export.csv/route';

function request(query = '') {
  return new NextRequest(`http://localhost:3000/api/admin/expert-preregistrations/export.csv${query}`);
}

describe('GET /api/admin/expert-preregistrations/export.csv', () => {
  beforeEach(() => {
    exportSpy.mockClear();
  });

  it('answers 401 to a visitor who is not signed in and reads no rows', async () => {
    gate.current = { ok: false, response: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) };
    const response = await GET(request());
    expect(response.status).toBe(401);
    expect(exportSpy).not.toHaveBeenCalled();
  });

  it('answers 403 to a signed-in user who is not a platform admin and reads no rows', async () => {
    gate.current = { ok: false, response: NextResponse.json({ error: 'Forbidden' }, { status: 403 }) };
    const response = await GET(request());
    expect(response.status).toBe(403);
    expect(exportSpy).not.toHaveBeenCalled();
  });

  it('serves the CSV to a platform admin with a download name and no caching', async () => {
    gate.current = { ok: true };
    const response = await GET(request('?status=verified'));
    expect(response.status).toBe(200);
    expect(response.headers.get('content-type')).toContain('text/csv');
    expect(response.headers.get('cache-control')).toBe('no-store');
    expect(response.headers.get('content-disposition')).toContain('uzman-on-kayit-');
    expect(exportSpy).toHaveBeenCalledWith({ status: 'verified' });
  });

  it('refuses an unknown filter value with 400 before reading anything', async () => {
    gate.current = { ok: true };
    const response = await GET(request('?status=hacked'));
    expect(response.status).toBe(400);
    expect(exportSpy).not.toHaveBeenCalled();
  });
});
