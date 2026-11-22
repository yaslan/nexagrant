import { test, expect, type Page } from '@playwright/test';
import type { Role } from '@prisma/client';

import { prisma } from '../../src/lib/db';
import { signInAs } from './fixtures/session';
import {
  RG_SEATS,
  RG_TENANT,
  RG_WORKSPACE,
  setupRoleGateTenant,
  teardownRoleGateTenant,
} from './fixtures/role-gate-tenant';

/**
 * NG-257 — measurement of the CORDIS API and the three ungated-looking pages with
 * a real session per role. A probe row (distinct marker) is seeded in the shared
 * CORDIS tables so "200 + data" is visible, not assumed. Its assertions are the
 * acceptance of the NG-257 door: guest 403 + no data, the permitted role 200.
 */

const PROBE_PIC = '999000111';
const PROBE_PROJECT = 'NG257-PROBE-PROJ';
const MARKER = 'NG257 PROBE';
const ws = `/tr/${RG_WORKSPACE}`;

const API_ROUTES = [
  '/api/cordis/organizations',
  `/api/cordis/organizations/${PROBE_PIC}`,
  '/api/cordis/projects',
];

const PAGES = [
  `${ws}/partners/leaders`, // control: gated by NG-256
  `${ws}/partners/${PROBE_PIC}`, // partners/[pic] (M1 moduleGate only, no role door)
  `${ws}/kanitlar`, // evidence (requireTenantPage only)
  `${ws}/calls`, // calls (no role door)
];

type Row = { role: Role; target: string; status: number; probe: boolean };
const rows: Row[] = [];

async function signIn(page: Page, role: Role) {
  const seat = RG_SEATS[role];
  await signInAs(page, { id: seat.id, email: seat.email, tenantId: RG_TENANT, role });
}

test.describe.serial('NG-257 CORDIS API + page role measurement', () => {
  test.beforeAll(async () => {
    await setupRoleGateTenant();
    await prisma.cordisOrganization.upsert({
      where: { organisationId: PROBE_PIC },
      create: { organisationId: PROBE_PIC, name: `${MARKER} ORG`, country: 'TR', isTurkish: true },
      update: { name: `${MARKER} ORG` },
    });
    await prisma.cordisProject.upsert({
      where: { id: PROBE_PROJECT },
      create: { id: PROBE_PROJECT, title: `${MARKER} PROJECT`, framework: 'HORIZON' },
      update: { title: `${MARKER} PROJECT` },
    });
    await prisma.cordisParticipation.upsert({
      where: { projectId_organisationId: { projectId: PROBE_PROJECT, organisationId: PROBE_PIC } },
      create: { projectId: PROBE_PROJECT, organisationId: PROBE_PIC, role: 'coordinator' },
      update: {},
    });
  });

  test.afterAll(async () => {
    await prisma.cordisParticipation.deleteMany({ where: { projectId: PROBE_PROJECT } });
    await prisma.cordisProject.deleteMany({ where: { id: PROBE_PROJECT } });
    await prisma.cordisOrganization.deleteMany({ where: { organisationId: PROBE_PIC } });
    await teardownRoleGateTenant();
  });

  for (const role of ['GUEST_PARTNER', 'TENANT_OWNER'] as Role[]) {
    test(`${role}: API routes and pages`, async ({ page }) => {
      test.setTimeout(120_000);
      await signIn(page, role);
      for (const route of API_ROUTES) {
        const res = await page.request.get(route);
        const body = await res.text();
        rows.push({ role, target: route, status: res.status(), probe: body.includes(MARKER) });
      }
      for (const path of PAGES) {
        const res = await page.goto(path);
        const html = await page.content();
        rows.push({ role, target: path, status: res?.status() ?? -1, probe: html.includes(MARKER) });
      }
      const mine = rows.filter((r) => r.role === role);
      const pic = `${ws}/partners/${PROBE_PIC}`;
      if (role === 'GUEST_PARTNER') {
        // NG-257 acceptance: the partner-search door refuses a guest on the CORDIS API
        // session path and on partners/[pic]; no probe data reaches the body.
        for (const r of mine.filter((x) => x.target.startsWith('/api/cordis/'))) {
          expect(r.status, r.target).toBe(403);
          expect(r.probe, r.target).toBe(false);
        }
        // The 403 itself is asserted by role-gate.spec GUEST_CLOSED; here only the leak.
        expect(mine.find((x) => x.target === pic)?.probe, pic).toBe(false);
      } else {
        // The permitted role reaches the partner detail page (M1 on, role door open).
        expect(mine.find((x) => x.target === pic)?.status, pic).toBe(200);
        for (const r of mine.filter((x) => x.target.startsWith('/api/cordis/projects'))) {
          expect(r.status, r.target).toBe(200);
        }
      }
    });
  }
});
