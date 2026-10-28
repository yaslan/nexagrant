/**
 * TASK-MUN80XIW5NPV1 (security scan TASK-MUN66T2HM4A4E O-2) — the /api/cordis/*
 * routes. `?limit=zz` used to reach Prisma as `take: NaN`, and a
 * NUL byte in the id reached Postgres; both 500s quoted the Prisma query back
 * to the caller. Malformed input is now a 400 with no query run, and any 500
 * carries a fixed code.
 */
import { describe, test, expect, vi, beforeEach } from 'vitest';
import { NextRequest, NextResponse } from 'next/server';

const db = vi.hoisted(() => ({
  profileCount: vi.fn(),
  profileFindMany: vi.fn(),
  projectCount: vi.fn(),
  projectFindMany: vi.fn(),
  orgFindUnique: vi.fn(),
  coFindMany: vi.fn(),
  orgFindMany: vi.fn(),
}));

vi.mock('@/lib/db', () => ({
  prisma: {
    cordisPartnerProfile: { count: db.profileCount, findMany: db.profileFindMany },
    cordisProject: { count: db.projectCount, findMany: db.projectFindMany },
    cordisOrganization: { findUnique: db.orgFindUnique, findMany: db.orgFindMany },
    cordisCoParticipation: { findMany: db.coFindMany },
  },
}));

// The input and 500 tests below are about what the routes do once a caller is
// let in, so the caller is let in here. Who may call is pinned in
// cordis-api-auth.test.ts; the wiring test at the end pins that a refusal stops
// the route before any query.
const auth = vi.hoisted(() => ({ check: vi.fn() }));
vi.mock('@/lib/cordis-api-auth', () => ({ authenticateCordisRequest: auth.check }));

import { GET as getOrganizations } from '@/app/api/cordis/organizations/route';
import { GET as getProjects } from '@/app/api/cordis/projects/route';
import { GET as getOrganization } from '@/app/api/cordis/organizations/[id]/route';

const PRISMA_LEAK = '\nInvalid `prisma.cordisProject.findMany()` invocation:\n{ where: {}, skip: NaN, include: { participations: … } }';

function req(path: string) {
  return new NextRequest(`http://localhost${path}`);
}

beforeEach(() => {
  for (const fn of Object.values(db)) fn.mockReset().mockResolvedValue([]);
  db.profileCount.mockResolvedValue(0);
  db.projectCount.mockResolvedValue(0);
  db.orgFindUnique.mockResolvedValue(null);
  auth.check.mockReset().mockResolvedValue({ authenticated: true });
});

describe('/api/cordis/* refusal is returned as is, before any query', () => {
  const refusal = () => ({
    authenticated: false,
    errorResponse: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }),
  });

  test.each([
    ['projects', () => getProjects(req('/api/cordis/projects')), () => db.projectFindMany],
    ['organizations', () => getOrganizations(req('/api/cordis/organizations')), () => db.profileFindMany],
    [
      'organization profile',
      () => getOrganization(req('/api/cordis/organizations/123'), { params: Promise.resolve({ id: '123' }) }),
      () => db.orgFindUnique,
    ],
  ])('%s: anonymous caller gets the helper response and no query runs', async (_name, call, query) => {
    auth.check.mockResolvedValue(refusal());
    const res = await call();
    expect(res.status).toBe(401);
    expect(query()).not.toHaveBeenCalled();
  });
});

describe('/api/cordis/* input validation', () => {
  test.each([
    ['/api/cordis/projects?year_from=abc&limit=zz'],
    ['/api/cordis/projects?limit=1e3'],
    ['/api/cordis/projects?year_to=99999'],
    ['/api/cordis/projects?page=-1'],
  ])('projects %s → 400, no query', async (path) => {
    const res = await getProjects(req(path));
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ success: false, error: 'invalid_query' });
    expect(db.projectFindMany).not.toHaveBeenCalled();
  });

  test.each([['/api/cordis/organizations?limit=zz'], ['/api/cordis/organizations?min_projects=x']])(
    'organizations %s → 400, no query',
    async (path) => {
      const res = await getOrganizations(req(path));
      expect(res.status).toBe(400);
      expect(db.profileFindMany).not.toHaveBeenCalled();
    }
  );

  test('a NUL byte in the organisation id is a 400, not a Postgres error', async () => {
    const res = await getOrganization(req('/api/cordis/organizations/%00'), {
      params: Promise.resolve({ id: '\u0000' }),
    });
    expect(res.status).toBe(400);
    expect(db.orgFindUnique).not.toHaveBeenCalled();
  });

  test('valid parameters still reach the query, limit still clamped to 100', async () => {
    const res = await getProjects(req('/api/cordis/projects?year_from=2021&year_to=2024&page=2&limit=500'));
    expect(res.status).toBe(200);
    const args = db.projectFindMany.mock.calls[0]![0];
    expect(args.take).toBe(100);
    expect(args.skip).toBe(100);
    expect(args.where.startDate.gte).toEqual(new Date('2021-01-01'));
    const org = await getOrganization(req('/api/cordis/organizations/999999999'), {
      params: Promise.resolve({ id: '999999999' }),
    });
    expect(org.status).toBe(404);
  });
});

describe('/api/cordis/* 500 bodies', () => {
  test('projects: the Prisma message stays out of the body', async () => {
    db.projectFindMany.mockRejectedValue(new Error(PRISMA_LEAK));
    const res = await getProjects(req('/api/cordis/projects'));
    expect(res.status).toBe(500);
    const text = await res.text();
    expect(JSON.parse(text)).toEqual({ success: false, error: 'internal_error' });
    expect(text).not.toMatch(/prisma|invocation/i);
  });

  test('organizations: the Prisma message stays out of the body', async () => {
    db.profileFindMany.mockRejectedValue(new Error(PRISMA_LEAK));
    const res = await getOrganizations(req('/api/cordis/organizations'));
    expect(res.status).toBe(500);
    expect(await res.json()).toEqual({ success: false, error: 'internal_error' });
  });

  test('organization profile: the Prisma message stays out of the body', async () => {
    db.orgFindUnique.mockRejectedValue(new Error(PRISMA_LEAK));
    const res = await getOrganization(req('/api/cordis/organizations/123'), {
      params: Promise.resolve({ id: '123' }),
    });
    expect(res.status).toBe(500);
    expect(await res.json()).toEqual({ success: false, error: 'internal_error' });
  });
});
