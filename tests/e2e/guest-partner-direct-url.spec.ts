import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import { test, expect, type Page } from '@playwright/test';
import type { Role } from '@prisma/client';

import trMessages from '../../messages/tr.json';
import { prisma } from '../../src/lib/db';
import {
  RG_INVOICE_NO,
  RG_OPP_TITLE,
  RG_REL_NAME,
  RG_SEATS,
  RG_TENANT,
  RG_WORKSPACE,
  setupRoleGateTenant,
  teardownRoleGateTenant,
} from './fixtures/role-gate-tenant';
import { signInAs } from './fixtures/session';

/**
 * NG-238 — MEASUREMENT, not a gate. NG-234 found 37 tenant pages without
 * `requireTenantPageRole`. This spec opens every one of them by typing the URL as a
 * GUEST_PARTNER (real minted session, role read back from the membership row) and
 * records status, final URL, which seeded markers reached the HTML, and a full-page
 * screenshot. It does NOT pin the finding: the only assertions are about the
 * measurement being able to see (controls). Results go to a JSON file.
 */

const OUT = process.env.NG238_OUT ?? 'test-artifacts/ng238';
const FORBIDDEN_TITLE = trMessages.Forbidden.title;
const ws = `/tr/${RG_WORKSPACE}`;

const MARK_EVIDENCE = 'NG238 kiracıya özel kanıt belgesi';
const MARK_APIKEY = 'NG238 kiracıya özel API anahtarı';
const EXTRA_IDS = { evidence: 'ng238-evidence', apiKey: 'ng238-apikey' };
const MARK_IDEA = 'NG238 kiracıya özel proje fikri';
const MARK_PROFILE = 'NG238 kurum yetkinlik metni';
const MEMBER_MARK = 'owner@ng64-role-gate.e2e.fabrika.test';

const MARKERS: Record<string, string> = {
  opportunityTitle: RG_OPP_TITLE,
  relationshipName: RG_REL_NAME,
  invoiceNo: RG_INVOICE_NO,
  evidenceTitle: MARK_EVIDENCE,
  apiKeyName: MARK_APIKEY,
  memberEmail: MEMBER_MARK,
  tenantName: 'role gate e2e (internal)',
  projectIdeaTitle: MARK_IDEA,
  profileCapabilities: MARK_PROFILE,
};

/** Static routes, from `find src/app/[locale]/(app)/[workspace] -name page.tsx` minus requireTenantPageRole. */
const STATIC_ROUTES = [
  'ayarlar/faturalama', 'ayarlar/gizlilik', 'ayarlar/kapilar', 'ayarlar/moduller', 'ayarlar', 'ayarlar/profil', 'ayarlar/uyeler',
  'bildirimler', 'cagrilar', 'calls', 'dashboard', 'evidence', 'firsatlar', 'iliskiler', 'kanitlar', 'konsept-notlar',
  'modules/budget-wp', 'modules/call-fit', 'modules/compliance', 'modules/expert-pool', 'modules/interreg-review',
  'modules/post-award', 'modules/tr-layer', 'notifications', 'onay-merkezi', 'ortaklar/kaynaklar', 'ortaklar', 'panel',
  'partners/leaders', 'proje-fikri', 'settings/calendar', 'settings/modules', 'settings', 'settings/privacy',
  'settings/profile', 'tto-hizlandirici',
];

type Row = {
  route: string;
  role: Role;
  status: number | null;
  finalUrl: string;
  forbiddenHeading: boolean;
  markers: string[];
  h1: string;
  buttons: string[];
  shot: string;
};

let callId = 'none';
let routes: string[] = [];

async function visit(page: Page, role: Role, route: string, shotDir: string): Promise<Row> {
  const res = await page.goto(`${ws}/${route}`, { waitUntil: 'load' }).catch(() => null);
  await page.locator('h1').first().waitFor({ timeout: 8_000 }).catch(() => undefined);
  await page.waitForTimeout(500);
  const html = await page.content();
  const text = await page.evaluate(() => document.body.innerText).catch(() => '');
  const haystack = `${html}\n${text}`;
  const forbiddenHeading = (await page.getByRole('heading', { name: FORBIDDEN_TITLE }).count()) > 0;
  const buttons = await page
    .locator('main button:visible, main [type=submit]:visible')
    .evaluateAll((els) => els.map((e) => (e.textContent ?? '').trim().slice(0, 40)).filter(Boolean).slice(0, 12))
    .catch(() => [] as string[]);
  const h1 = ((await page.locator('h1').first().textContent({ timeout: 1_000 }).catch(() => '')) ?? '').trim().slice(0, 80);
  const slug = `${role === 'GUEST_PARTNER' ? 'guest' : 'owner'}-${route.replace(/[^a-z0-9]+/gi, '_')}`;
  const shot = join(shotDir, `${slug}.png`);
  await page.screenshot({ path: shot, fullPage: true }).catch(() => undefined);
  const hit = Object.entries(MARKERS).filter(([k, v]) => k !== 'memberEmail' && haystack.includes(v)).map(([, v]) => v);
  if (role === 'GUEST_PARTNER' && hit.length > 0) {
    // The page scrolls inside its own container, so a full-page frame shows only the top:
    // bring the first marker into view and take a frame of that.
    const loc = page.getByText(hit[0] as string, { exact: false }).first();
    await loc.scrollIntoViewIfNeeded({ timeout: 3_000 }).catch(() => undefined);
    await page.screenshot({ path: join(shotDir, `${slug}-MARKER.png`) }).catch(() => undefined);
  }
  return {
    route,
    role,
    status: res?.status() ?? null,
    finalUrl: page.url().replace(/^https?:\/\/[^/]+/, ''),
    forbiddenHeading,
    markers: Object.entries(MARKERS).filter(([, v]) => haystack.includes(v)).map(([k]) => k),
    h1,
    buttons,
    shot,
  };
}

async function signIn(page: Page, role: Role) {
  const seat = RG_SEATS[role];
  await signInAs(page, { id: seat.id, email: seat.email, tenantId: RG_TENANT, role });
}

test.describe.serial('NG-238 GUEST_PARTNER direct-URL measurement', () => {
  test.beforeAll(async () => {
    await setupRoleGateTenant();
    await prisma.evidence.upsert({
      where: { id: EXTRA_IDS.evidence },
      create: { id: EXTRA_IDS.evidence, tenantId: RG_TENANT, kind: 'certificate', title: MARK_EVIDENCE, body: 'NG238 gövde', status: 'VALID' },
      update: { title: MARK_EVIDENCE },
    });
    await prisma.apiKey.upsert({
      where: { id: EXTRA_IDS.apiKey },
      create: { id: EXTRA_IDS.apiKey, tenantId: RG_TENANT, name: MARK_APIKEY, keyHash: 'ng238-not-a-real-hash', prefix: 'ng238' },
      update: { name: MARK_APIKEY },
    });
    await prisma.projectIdea.deleteMany({ where: { id: 'ng238-idea' } });
    await prisma.projectIdea.create({
      data: { id: 'ng238-idea', tenantId: RG_TENANT, title: MARK_IDEA, summary: 'NG238 özet', keywords: ['ng238'], trl: 4, targetPrograms: [] },
    });
    await prisma.tenantProfile.upsert({
      where: { tenantId: RG_TENANT },
      create: { tenantId: RG_TENANT, capabilities: MARK_PROFILE, keywords: ['ng238'], naceCodes: [], trlRange: [3, 8], preferredRoles: [] },
      update: { capabilities: MARK_PROFILE },
    });
    const call = await prisma.call.findFirst({ select: { id: true } });
    callId = call?.id ?? 'none';
    routes = [...STATIC_ROUTES, `calls/${callId}`, `cagrilar/${callId}`, `firsatlar/ng64-role-gate-e2e-opp`, 'partners/999999999'];
  });
  test.afterAll(async () => {
    await prisma.projectIdea.deleteMany({ where: { id: 'ng238-idea' } });
    await prisma.tenantProfile.deleteMany({ where: { tenantId: 'ng64-role-gate-e2e-tenant' } });
    await prisma.apiKey.deleteMany({ where: { id: 'ng238-apikey' } });
    await prisma.evidence.deleteMany({ where: { id: 'ng238-evidence' } });
    await teardownRoleGateTenant();
  });

  test('controls: closed route is 403 for the guest; owner sees tenant data (measurement is not blind)', async ({ page }) => {
    test.setTimeout(180_000);
    mkdirSync(join(OUT, 'shots'), { recursive: true });
    const controls: Row[] = [];
    await signIn(page, 'GUEST_PARTNER');
    for (const r of ['approvals', 'firsatlar-x-unused'].slice(0, 1)) controls.push(await visit(page, 'GUEST_PARTNER', r, join(OUT, 'shots')));
    controls.push(await visit(page, 'GUEST_PARTNER', 'iliskiler', join(OUT, 'shots')));
    controls.push(await visit(page, 'GUEST_PARTNER', 'ayarlar/api-anahtarlari', join(OUT, 'shots')));
    await signIn(page, 'TENANT_OWNER');
    controls.push(await visit(page, 'TENANT_OWNER', 'iliskiler', join(OUT, 'shots')));
    controls.push(await visit(page, 'TENANT_OWNER', 'ayarlar/uyeler', join(OUT, 'shots')));
    controls.push(await visit(page, 'TENANT_OWNER', 'ayarlar/faturalama', join(OUT, 'shots')));
    writeFileSync(join(OUT, 'controls.json'), JSON.stringify(controls, null, 2));
    const by = (role: Role, route: string) => controls.find((c) => c.role === role && c.route === route);
    // Control 1 (PR #287): a gated route is closed for the guest.
    expect(by('GUEST_PARTNER', 'approvals')?.status).toBe(403);
    expect(by('GUEST_PARTNER', 'approvals')?.forbiddenHeading).toBe(true);
    expect(by('GUEST_PARTNER', 'iliskiler')?.status).toBe(403);
    // Control 2: the full-rights role sees the markers where they live.
    expect(by('TENANT_OWNER', 'iliskiler')?.markers).toContain('relationshipName');
    expect(by('TENANT_OWNER', 'ayarlar/uyeler')?.markers).toContain('memberEmail');
    expect(by('TENANT_OWNER', 'ayarlar/faturalama')?.markers).toContain('invoiceNo');
  });

  test('measure: GUEST_PARTNER and TENANT_OWNER on every page without requireTenantPageRole', async ({ page }) => {
    test.setTimeout(1_500_000);
    mkdirSync(join(OUT, 'shots'), { recursive: true });
    const rows: Row[] = [];
    for (const role of ['GUEST_PARTNER', 'TENANT_OWNER'] as const) {
      await signIn(page, role);
      for (const route of routes) rows.push(await visit(page, role, route, join(OUT, 'shots')));
    }
    writeFileSync(join(OUT, 'measure.json'), JSON.stringify({ callId, count: routes.length, rows }, null, 2));
    expect(rows.length).toBe(routes.length * 2);
    // Owner must see something on the page set, or the markers never reach any of them.
    const ownerHits = rows.filter((r) => r.role === 'TENANT_OWNER' && r.markers.length > 0);
    expect(ownerHits.length).toBeGreaterThan(0);
  });

  test('write probe: a guest submits one harmless form on each open page that stores tenant data', async ({ page }) => {
    test.setTimeout(180_000);
    mkdirSync(join(OUT, 'shots'), { recursive: true });
    const probes: Record<string, unknown> = {};
    await signIn(page, 'GUEST_PARTNER');

    // proje-fikri: createProjectIdea (tenant table). Marked title; check the DB afterwards.
    await page.goto(`${ws}/proje-fikri`);
    await page.locator('input[name="title"]').fill('NG238 misafir yazdi');
    await page.locator('textarea[name="summary"]').fill('NG238 misafir ozet — olcum');
    await page.locator('input[name="keywords"]').fill('ng238');
    await page.locator('select[name="trl"]').selectOption('4');
    await page.locator('input[name="targetPrograms"]').first().check();
    await page.locator('main form button[type="submit"]').first().click();
    await page.waitForTimeout(3_000);
    await page.screenshot({ path: join(OUT, 'shots', 'write-guest-proje_fikri.png'), fullPage: true });
    probes.projeFikri = {
      rowsCreatedByGuest: await prisma.projectIdea.count({ where: { tenantId: RG_TENANT, title: 'NG238 misafir yazdi' } }),
      visibleStatus: ((await page.locator('main [role="status"], main [role="alert"]').allTextContents()) ?? []).map((x) => x.trim().slice(0, 120)),
    };

    // settings/profile: updateTenantProfile (tenant table).
    await page.goto(`${ws}/settings/profile`);
    await page.locator('main form textarea').first().fill('NG238 misafir yetkinlik yazdi');
    await page.locator('main form button[type="submit"]').last().click();
    await page.waitForTimeout(3_000);
    await page.screenshot({ path: join(OUT, 'shots', 'write-guest-settings_profile.png'), fullPage: true });
    const prof = await prisma.tenantProfile.findUnique({ where: { tenantId: RG_TENANT }, select: { capabilities: true } });
    probes.settingsProfile = {
      capabilitiesNow: prof?.capabilities,
      changedByGuest: prof?.capabilities !== MARK_PROFILE,
      visibleStatus: (await page.locator('main [role="status"], main [role="alert"]').allTextContents()).map((x) => x.trim().slice(0, 120)),
    };
    writeFileSync(join(OUT, 'write-probes.json'), JSON.stringify(probes, null, 2));
    expect(Object.keys(probes).length).toBe(2);
  });
});
