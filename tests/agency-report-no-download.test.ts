import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { beforeEach, describe, expect, test, vi } from 'vitest';

/**
 * NG-341 (HUKUK-5 5d, veri sorumlusu kararı 23.11.2026) — the agency report is shown on
 * screen only and is never given as a file. The route used to answer `?format=csv` with
 * `Content-Disposition: attachment` (and the panel linked it with `download`); `?format=print`
 * was a print-to-PDF page. Now: every format other than the view is a 404, the view is
 * `inline` HTML without a print button, and no agency route or panel offers a file.
 */

const state = vi.hoisted(() => ({ agency: true, reads: 0 }));

vi.mock('@/lib/tenant', () => ({
  requireTenantApi: async () => ({
    ok: true,
    scope: { tenantId: 'agency-1', userId: 'u', role: 'TENANT_OWNER', workspaceIds: [], isPlatformAdmin: false },
  }),
}));
vi.mock('@/lib/agency/funnel', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/agency/funnel')>()),
  isAgencyTenant: async () => state.agency,
}));
vi.mock('@/lib/db', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/db')>()),
  withTenant: async (_tenantId: string, cb: (tx: unknown) => Promise<unknown>) =>
    cb({ tenant: { findFirst: async () => ({ name: 'Orta Karadeniz Kalkınma Ajansı' }) } }),
}));
vi.mock('@/lib/agency/report', async (importOriginal) => {
  const real = await importOriginal<typeof import('@/lib/agency/report')>();
  return {
    ...real,
    readAgencyReportIn: async () => {
      state.reads += 1;
      return real.buildAgencyReport(new Map(), '2026-09', new Date('2026-10-01T06:00:00Z'));
    },
  };
});

const { GET } = await import('@/app/api/agency/reports/[id]/route');

const call = (query: string) =>
  GET(new Request(`http://localhost/api/agency/reports/r1${query}`), { params: Promise.resolve({ id: 'r1' }) });

beforeEach(() => {
  state.agency = true;
  state.reads = 0;
});

describe('agency report route gives no file (NG-341)', () => {
  test.each(['?format=csv&locale=tr', '?format=csv', '?format=pdf', '?format=xlsx', '?format=CSV', '?format='])(
    '%s → 404, no attachment, no report read',
    async (q) => {
      const res = await call(q);
      expect(res.status).toBe(404);
      expect(res.headers.get('content-disposition')).toBeNull();
      expect(res.headers.get('content-type')).not.toContain('text/csv');
      expect(state.reads).toBe(0);
    }
  );

  test.each(['', '?locale=tr', '?format=view&locale=en', '?format=print&locale=tr'])(
    '%s → the on-screen view: inline HTML, no print button, no PDF hint',
    async (q) => {
      const res = await call(q);
      expect(res.status).toBe(200);
      expect(res.headers.get('content-type')).toBe('text/html; charset=utf-8');
      expect(res.headers.get('content-disposition')).toBe('inline');
      const html = await res.text();
      expect(html).not.toContain('window.print');
      expect(html).not.toMatch(/PDF/);
      expect(html).toMatch(/12 (ay saklanır|months)/);
    }
  );

  test('a non-agency tenant is still refused before any format is looked at', async () => {
    state.agency = false;
    expect((await call('?format=csv')).status).toBe(403);
  });
});

describe('no agency surface offers a file (source guard)', () => {
  const files = (dir: string): string[] =>
    readdirSync(dir).flatMap((e) => {
      const p = join(dir, e);
      return statSync(p).isDirectory() ? files(p) : /\.(ts|tsx)$/.test(e) ? [p] : [];
    });
  const surfaces = [...files('src/app/api/agency'), ...files('src/app/[locale]/(app)/ajans'), 'src/lib/agency/report.ts'];

  test.each(surfaces)('%s has no download link, CSV or attachment header', (file) => {
    const src = readFileSync(file, 'utf8');
    expect(src).not.toMatch(/\bdownload\b(?=[\s>={])/);
    expect(src).not.toContain('text/csv');
    expect(src).not.toMatch(/attachment;/);
    expect(src).not.toContain('format=csv');
  });
});
