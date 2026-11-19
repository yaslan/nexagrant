import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import { test, expect, type Page } from '@playwright/test';
import type { Role } from '@prisma/client';

import trMessages from '../../messages/tr.json';
import { prisma } from '../../src/lib/db';
import {
  RG_IDEA_TITLE,
  RG_INVOICE_NO,
  RG_OPP_TITLE,
  RG_PROFILE_TEXT,
  RG_REL_NAME,
  RG_SEATS,
  RG_TENANT,
  RG_WORKSPACE,
  setupRoleGateTenant,
  teardownRoleGateTenant,
} from './fixtures/role-gate-tenant';
import { signInAs } from './fixtures/session';

/**
 * NG-238 / NG-251 — GUEST_PARTNER direct-URL measurement + regression. NG-234 found 40
 * tenant pages without `requireTenantPageRole`. The measure test opens every one of
 * them by typing the URL as a GUEST_PARTNER (real minted session, role read back from
 * the membership row) and records status, final URL, which seeded markers reached the
 * page, and a screenshot (results go to a JSON file). The two pages that leaked
 * tenant data (`proje-fikri`, `ayarlar/profil` + its `settings/profile` alias) were
 * closed by NG-240: the regression test pins them at 403 with no marker in the text
 * or the RSC payload, and pins the owner at 200 with the marker visible (not blind).
 * The scan reads `page.content()` + `innerText` together: `innerText` alone misses
 * the value of a textarea/input (NG-238 review O1).
 */

const OUT = process.env.NG238_OUT ?? 'test-artifacts/ng238';
const FORBIDDEN_TITLE = trMessages.Forbidden.title;
const ws = `/tr/${RG_WORKSPACE}`;

const MARK_EVIDENCE = 'NG238 kiracıya özel kanıt belgesi';
const MARK_APIKEY = 'NG238 kiracıya özel API anahtarı';
const EXTRA_IDS = { evidence: 'ng238-evidence', apiKey: 'ng238-apikey' };
const MARK_TOPIC = 'NG251 kiracı dışı çağrı konusu';
const MARK_ORG = 'NG251 Ortak Kuruluş';
const TOPIC_IDENT = 'NG251-TOPIC-01';
const ORG_PIC = '999251001';
const MEMBER_MARK = 'owner@ng64-role-gate.e2e.fabrika.test';

const MARKERS: Record<string, string> = {
  opportunityTitle: RG_OPP_TITLE,
  relationshipName: RG_REL_NAME,
  invoiceNo: RG_INVOICE_NO,
  evidenceTitle: MARK_EVIDENCE,
  apiKeyName: MARK_APIKEY,
  memberEmail: MEMBER_MARK,
  tenantName: 'role gate e2e (internal)',
  projectIdeaTitle: RG_IDEA_TITLE,
  profileCapabilities: RG_PROFILE_TEXT,
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
    // `Call` is the parent: the detail pages read a `Topic`, so seed one of each, plus a
    // CORDIS organisation for `partners/[pic]` (NG-238 review O2).
    await prisma.programme.upsert({ where: { id: 'NG251' }, create: { id: 'NG251', name: 'NG251 programme', sourceKey: 'ng251' }, update: {} });
    const call = await prisma.call.upsert({
      where: { callIdentifier: 'NG251-CALL' },
      create: { programmeId: 'NG251', callIdentifier: 'NG251-CALL', title: 'NG251 call' },
      update: {},
    });
    await prisma.topic.upsert({
      where: { identifier: TOPIC_IDENT },
      create: { callId: call.id, identifier: TOPIC_IDENT, title: MARK_TOPIC, deadlines: [], keywords: [] },
      update: { title: MARK_TOPIC },
    });
    await prisma.cordisOrganization.upsert({
      where: { organisationId: ORG_PIC },
      create: { organisationId: ORG_PIC, name: MARK_ORG },
      update: { name: MARK_ORG },
    });
    routes = [...STATIC_ROUTES, `calls/${TOPIC_IDENT}`, `cagrilar/${TOPIC_IDENT}`, 'firsatlar/ng64-role-gate-e2e-opp', `partners/${ORG_PIC}`];
  });
  test.afterAll(async () => {
    await prisma.cordisOrganization.deleteMany({ where: { organisationId: ORG_PIC } });
    await prisma.topic.deleteMany({ where: { identifier: TOPIC_IDENT } });
    await prisma.call.deleteMany({ where: { callIdentifier: 'NG251-CALL' } });
    await prisma.programme.deleteMany({ where: { id: 'NG251' } });
    await prisma.apiKey.deleteMany({ where: { id: 'ng238-apikey' } });
    await prisma.evidence.deleteMany({ where: { id: 'ng238-evidence' } });
    await teardownRoleGateTenant();
  });

  test('regression (NG-240): guest gets 403 on proje-fikri and the profile routes; owner sees them', async ({ page }) => {
    test.setTimeout(120_000);
    mkdirSync(join(OUT, 'shots'), { recursive: true });
    const closed: Array<[string, string]> = [
      ['proje-fikri', RG_IDEA_TITLE],
      ['ayarlar/profil', RG_PROFILE_TEXT],
      ['settings/profile', RG_PROFILE_TEXT],
    ];
    await signIn(page, 'GUEST_PARTNER');
    for (const [route, marker] of closed) {
      const row = await visit(page, 'GUEST_PARTNER', route, join(OUT, 'shots'));
      expect(row.status, `guest ${route}`).toBe(403);
      expect(row.forbiddenHeading, `guest ${route} heading`).toBe(true);
      expect(row.markers, `guest ${route} text`).toEqual([]);
      // The RSC flight payload is a separate response from the HTML: scan it too.
      const rsc = await page.request.get(`${ws}/${route}`, { headers: { RSC: '1' }, failOnStatusCode: false });
      const flight = await rsc.text();
      writeFileSync(join(OUT, `rsc-guest-${route.replace(/\W+/g, '_')}.txt`), `${rsc.status()}\n${flight.slice(0, 4000)}`);
      expect(flight, `guest ${route} RSC`).not.toContain(marker);
      expect(flight, `guest ${route} RSC carries the forbidden view`).toContain(FORBIDDEN_TITLE);
    }
    await signIn(page, 'TENANT_OWNER');
    for (const [route, marker] of closed) {
      const row = await visit(page, 'TENANT_OWNER', route, join(OUT, 'shots'));
      expect(row.status, `owner ${route}`).toBe(200);
      const text = `${await page.content()}\n${await page.evaluate(() => document.body.innerText)}`;
      expect(text, `owner ${route} sees the marker (not blind)`).toContain(marker);
    }
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
    writeFileSync(join(OUT, 'measure.json'), JSON.stringify({ count: routes.length, rows }, null, 2));
    expect(rows.length).toBe(routes.length * 2);
    // Owner must see something on the page set, or the markers never reach any of them.
    const ownerHits = rows.filter((r) => r.role === 'TENANT_OWNER' && r.markers.length > 0);
    expect(ownerHits.length).toBeGreaterThan(0);
    // The three dynamic routes must be measurable: the owner gets 200 and the seeded row's text.
    for (const [route, marker] of [[`calls/${TOPIC_IDENT}`, MARK_TOPIC], [`cagrilar/${TOPIC_IDENT}`, MARK_TOPIC], [`partners/${ORG_PIC}`, MARK_ORG]] as const) {
      await page.goto(`${ws}/${route}`, { waitUntil: 'load' });
      const res = await page.request.get(`${ws}/${route}`);
      expect(res.status(), `owner ${route}`).toBe(200);
      expect(`${await page.content()}\n${await page.evaluate(() => document.body.innerText)}`, `owner ${route}`).toContain(marker);
    }
  });

  test('write probe: the guest cannot submit the proje-fikri or profile form (403, nothing stored)', async ({ page }) => {
    test.setTimeout(180_000);
    mkdirSync(join(OUT, 'shots'), { recursive: true });
    const probes: Record<string, unknown> = {};
    await signIn(page, 'GUEST_PARTNER');

    // proje-fikri: createProjectIdea (tenant table). After NG-240 the page is a 403 and has no form.
    const ideaRes = await page.goto(`${ws}/proje-fikri`);
    expect(ideaRes?.status()).toBe(403);
    const ideaForm = page.locator('input[name="title"]');
    expect(await ideaForm.count(), 'no idea form on the 403 page').toBe(0);
    await expect(page.getByRole('heading', { name: FORBIDDEN_TITLE })).toBeVisible();
    await page.screenshot({ path: join(OUT, 'shots', 'write-guest-proje_fikri.png'), fullPage: true });
    probes.projeFikri = { status: ideaRes?.status(), formPresent: false };
    expect(await prisma.projectIdea.count({ where: { tenantId: RG_TENANT, title: 'NG238 misafir yazdi' } })).toBe(0);

    // settings/profile: updateTenantProfile (tenant table).
    const profRes = await page.goto(`${ws}/settings/profile`);
    expect(profRes?.status()).toBe(403);
    expect(await page.locator('main form textarea').count(), 'no profile form on the 403 page').toBe(0);
    await expect(page.getByRole('heading', { name: FORBIDDEN_TITLE })).toBeVisible();
    await page.screenshot({ path: join(OUT, 'shots', 'write-guest-settings_profile.png'), fullPage: true });
    const prof = await prisma.tenantProfile.findUnique({ where: { tenantId: RG_TENANT }, select: { capabilities: true } });
    probes.settingsProfile = { status: profRes?.status(), capabilitiesNow: prof?.capabilities };
    expect(prof?.capabilities).toBe(RG_PROFILE_TEXT);
    writeFileSync(join(OUT, 'write-probes.json'), JSON.stringify(probes, null, 2));
  });
});
