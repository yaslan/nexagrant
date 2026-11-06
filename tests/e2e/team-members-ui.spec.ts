import { test, expect, type Page } from '@playwright/test';
import { seedIdentity, cleanupIdentity, signInAs } from './fixtures/session';
import { shotsDir } from './fixtures/shots';
import { withSystemScope } from '../../src/lib/system-scope';
import { prisma } from '../../src/lib/db';

/*
 * Settings → Members (tr /ayarlar/uyeler): invite, list, cancel, remove.
 *
 * Runs in a tenant of its own on the 2-seat `basic` plan, so the seat limit can be hit
 * without touching `demo-tenant`. Every row it creates (tenant, subscription, workspace,
 * users, memberships, invitations, audit events) is deleted in afterAll by id.
 *
 * Mail: the dev server needs SMTP_HOST=localhost SMTP_PORT=1025 (mailpit) in its
 * environment for the cooldown paths (`recently_sent`, `role_change_blocked`); without
 * SMTP no mail policy runs and those two answers cannot happen. The mailpit inbox check
 * is opt-in through E2E_MAILPIT_URL.
 */

const SHOTS = shotsDir('TASK-MUU75LGMIBN0-team-members-ui');
const TENANT = 'tm-e2e-tenant';
const WS = { id: 'tm-e2e-workspace', slug: 'tm-e2e', name: 'Team Members E2E' };
const OWNER = { id: 'tm-e2e-owner', email: 'tm-owner@e2e.fabrika.test', name: 'TM Owner', role: 'TENANT_OWNER' as const };
const MEMBER = { id: 'tm-e2e-member', email: 'tm-member@e2e.fabrika.test', name: 'TM Member', role: 'MEMBER' as const };
const REMOVABLE = { id: 'tm-e2e-removable', email: 'tm-removable@e2e.fabrika.test', name: 'TM Removable', role: 'WRITER' as const };
const MAILPIT = process.env.E2E_MAILPIT_URL;

const PATH = '/tr/tm-e2e/ayarlar/uyeler';
const INVITE_PREFIX = 'tm-invite-';
const inviteEmail = (tag: string) => `${INVITE_PREFIX}${tag}-${Date.now().toString(36)}@e2e.fabrika.test`;

function claims(u: { id: string; email: string; name: string; role: 'TENANT_OWNER' | 'MEMBER' }) {
  return { id: u.id, email: u.email, name: u.name, role: u.role, tenantId: TENANT };
}

async function setSeatsExtra(seatsExtra: number) {
  await withSystemScope('platform-admin', 'e2e.team-members.seats', async (tx) => {
    await tx.subscription.update({ where: { tenantId: TENANT }, data: { seatsExtra } });
  });
}

async function invitationsOf(email?: string) {
  return withSystemScope('platform-admin', 'e2e.team-members.read', async (tx) =>
    tx.invitation.findMany({ where: { tenantId: TENANT, ...(email ? { email } : {}) } }),
  );
}

async function membershipCount() {
  return withSystemScope('platform-admin', 'e2e.team-members.read', async (tx) =>
    tx.membership.count({ where: { tenantId: TENANT } }),
  );
}

const emailInput = (page: Page) => page.getByRole('textbox', { name: 'meslektas@kurum.com' });
const sendButton = (page: Page) => page.getByRole('button', { name: 'Davet Gönder' });

async function invite(page: Page, email: string, role?: string) {
  await emailInput(page).fill(email);
  if (role) await page.getByRole('combobox').selectOption(role);
  await sendButton(page).click();
}

async function openMembers(page: Page, who: typeof OWNER | typeof MEMBER = OWNER) {
  await signInAs(page, claims(who));
  await page.goto(PATH);
  await expect(page.getByRole('heading', { name: 'Yeni Üye Davet Et' })).toBeVisible();
}

test.describe('Settings → Members: team management UI', () => {
  test.beforeAll(async () => {
    await withSystemScope('platform-admin', 'e2e.team-members.setup', async (tx) => {
      await tx.tenant.upsert({
        where: { id: TENANT },
        create: { id: TENANT, name: 'team members e2e (internal)', slug: TENANT, country: 'TR', orgType: 'SME' },
        update: {},
      });
      await tx.subscription.upsert({
        where: { tenantId: TENANT },
        create: { tenantId: TENANT, planId: 'basic', status: 'ACTIVE' },
        update: { planId: 'basic', status: 'ACTIVE', planVersionId: null, seatsExtra: 0 },
      });
    });
    await seedIdentity({ userId: OWNER.id, email: OWNER.email, name: OWNER.name, role: OWNER.role, tenantId: TENANT }, WS);
    await seedIdentity({ userId: MEMBER.id, email: MEMBER.email, name: MEMBER.name, role: MEMBER.role, tenantId: TENANT, workspaceIds: [WS.id] });
  });

  test.beforeEach(async () => {
    await withSystemScope('platform-admin', 'e2e.team-members.reset', async (tx) => {
      await tx.invitation.deleteMany({ where: { tenantId: TENANT } });
      await tx.auditEvent.deleteMany({ where: { tenantId: TENANT } });
    });
    await setSeatsExtra(5);
  });

  test.afterAll(async () => {
    await cleanupIdentity([OWNER.id, MEMBER.id, REMOVABLE.id]);
    await withSystemScope('platform-admin', 'e2e.team-members.teardown', async (tx) => {
      // Only rows of the tenant this spec created; demo-tenant is never touched.
      await tx.invitation.deleteMany({ where: { tenantId: TENANT } });
      await tx.auditEvent.deleteMany({ where: { tenantId: TENANT } });
      await tx.membership.deleteMany({ where: { tenantId: TENANT } });
      await tx.workspace.deleteMany({ where: { tenantId: TENANT } });
      await tx.subscription.deleteMany({ where: { tenantId: TENANT } });
      await tx.tenant.deleteMany({ where: { id: TENANT } });
    });
    await prisma.$disconnect();
  });

  test('owner invites: success message, Invitation row, pending list entry', async ({ page }) => {
    const email = inviteEmail('ok');
    await openMembers(page);
    await invite(page, email);

    const status = page.getByRole('status').filter({ hasText: 'Davet' });
    await expect(status).toContainText(/Davet e-postası gönderildi|Davet oluşturuldu ancak e-posta gönderilemedi/);
    await expect(emailInput(page)).toHaveValue('');

    const rows = await invitationsOf(email);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ role: 'MEMBER', acceptedAt: null });
    // The raw token never reaches the database: only its hash does.
    expect(rows[0]?.tokenHash).toMatch(/^[0-9a-f]{64}$/);

    const pending = page.getByRole('list', { name: 'Bekleyen davetler' });
    await expect(pending).toContainText(email);
    await expect(page.getByRole('button', { name: `${email} davetini iptal et` })).toBeVisible();
    await page.screenshot({ path: `${SHOTS}/01-owner-invite-success.png`, fullPage: true });
  });

  test('invite mail reaches the mailpit inbox', async ({ page }) => {
    test.skip(!MAILPIT, 'opt-in: set E2E_MAILPIT_URL=http://localhost:8025 and run the server with SMTP_HOST=localhost SMTP_PORT=1025');
    const email = inviteEmail('mail');
    await openMembers(page);
    await invite(page, email);
    await expect(page.getByRole('status').filter({ hasText: 'Davet e-postası gönderildi' })).toBeVisible();

    await expect
      .poll(async () => {
        const res = await fetch(`${MAILPIT}/api/v1/search?query=${encodeURIComponent(`to:${email}`)}`);
        const body = (await res.json()) as { messages_count?: number };
        return body.messages_count ?? 0;
      })
      .toBe(1);
  });

  test('invalid e-mail: the browser blocks it, the server refuses what the browser lets through', async ({ page }) => {
    await openMembers(page);

    let posts = 0;
    page.on('request', (r) => {
      if (r.url().endsWith('/api/invitations') && r.method() === 'POST') posts += 1;
    });

    // Not an address at all: native validation stops the submit, nothing is sent.
    await invite(page, 'not-an-email');
    await expect(emailInput(page)).toHaveJSProperty('validity.valid', false);
    expect(posts).toBe(0);

    // `ali@kurum` passes the browser's check but has no dot in the domain: the server says 400.
    await invite(page, 'ali@kurum');
    await expect(page.getByRole('alert').filter({ hasText: 'Geçerli bir e-posta adresi zorunludur' })).toBeVisible();
    expect(posts).toBe(1);
    expect(await invitationsOf()).toHaveLength(0);
    await page.screenshot({ path: `${SHOTS}/02-invalid-email.png`, fullPage: true });
  });

  test('inviting an existing member is refused', async ({ page }) => {
    await openMembers(page);
    await invite(page, MEMBER.email);
    await expect(page.getByRole('alert').filter({ hasText: 'zaten bu kurumun üyesidir' })).toBeVisible();
    expect(await invitationsOf()).toHaveLength(0);
  });

  // The cooldown answers exist only once a mail has really gone out, so this test
  // needs the mailpit SMTP the mailpit test above needs. Without it the first invite
  // stops at "created, mail not sent" and there is no cooldown to test.
  test('re-invite within the cooldown: same role is "recently sent", another role is role_change_blocked', async ({ page }) => {
    test.skip(!MAILPIT, 'opt-in: needs SMTP that really sends (E2E_MAILPIT_URL, SMTP_HOST=localhost SMTP_PORT=1025)');
    const email = inviteEmail('cooldown');
    await openMembers(page);

    await invite(page, email, 'MEMBER');
    await expect(page.getByRole('status').filter({ hasText: 'Davet e-postası gönderildi' })).toBeVisible();
    const [first] = await invitationsOf(email);
    expect(first?.role).toBe('MEMBER');

    // Same role: no new mail, the link in the first one still works, token kept.
    await invite(page, email, 'MEMBER');
    await expect(page.getByRole('status').filter({ hasText: 'az önce gönderildi; davetli e-postadaki bağlantıyı kullanabilir' })).toBeVisible();
    const [second] = await invitationsOf(email);
    expect(second?.tokenHash).toBe(first?.tokenHash);

    // Another role: refused, shown as an error, the row stays as mailed.
    await invite(page, email, 'WRITER');
    const blocked = page.getByRole('alert').filter({ hasText: 'rolü değiştirmek için 10 dakika sonra yeniden davet edin' });
    await expect(blocked).toBeVisible();
    const rows = await invitationsOf(email);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ role: 'MEMBER', tokenHash: first?.tokenHash });
    await page.screenshot({ path: `${SHOTS}/03-role-change-blocked.png`, fullPage: true });
  });

  test('seat limit: full plan refuses, cancelling a pending invitation frees the seat', async ({ page }) => {
    // basic = 2 seats + 1 extra; owner and member already hold two.
    await setSeatsExtra(1);
    const first = inviteEmail('seat-a');
    const second = inviteEmail('seat-b');
    await openMembers(page);

    await invite(page, first);
    await expect(page.getByRole('list', { name: 'Bekleyen davetler' })).toContainText(first);

    await invite(page, second);
    await expect(page.getByRole('alert').filter({ hasText: 'Planınızın koltuk sınırına ulaşıldı (3 koltuk: 2 üye, 1 bekleyen davet)' })).toBeVisible();
    expect(await invitationsOf(second)).toHaveLength(0);
    await page.screenshot({ path: `${SHOTS}/04-seat-limit.png`, fullPage: true });

    // Cancel through the confirmation dialog.
    await page.getByRole('button', { name: `${first} davetini iptal et` }).click();
    const dialog = page.getByRole('alertdialog');
    await expect(dialog).toContainText('Daveti iptal et?');
    await dialog.getByRole('button', { name: 'Vazgeç' }).click();
    await expect(dialog).toHaveCount(0);
    expect(await invitationsOf(first)).toHaveLength(1);

    await page.getByRole('button', { name: `${first} davetini iptal et` }).click();
    await page.getByRole('alertdialog').getByRole('button', { name: 'Evet, iptal et' }).click();
    await expect(page.getByRole('status').filter({ hasText: 'Davet iptal edildi; koltuğu boşaldı.' })).toBeVisible();
    expect(await invitationsOf(first)).toHaveLength(0);

    await invite(page, second);
    await expect(page.getByRole('list', { name: 'Bekleyen davetler' })).toContainText(second);
    expect(await invitationsOf(second)).toHaveLength(1);
  });

  test('removing a member: dialog, Keep leaves them, confirm removes them and frees the seat', async ({ page }) => {
    await seedIdentity({ userId: REMOVABLE.id, email: REMOVABLE.email, name: REMOVABLE.name, role: REMOVABLE.role, tenantId: TENANT, workspaceIds: [WS.id] });
    await openMembers(page);

    const members = page.getByRole('list', { name: 'Aktif ekip üyeleri' });
    await expect(members).toContainText(REMOVABLE.name);
    // Your own row says "siz" and has no remove button; there is no role-change control in this UI.
    await expect(members.getByRole('listitem').filter({ hasText: OWNER.name })).toContainText('(siz)');
    await expect(page.getByRole('button', { name: `${OWNER.name} üyesini çıkar` })).toHaveCount(0);
    const before = await membershipCount();

    await page.getByRole('button', { name: `${REMOVABLE.name} üyesini çıkar` }).click();
    const dialog = page.getByRole('alertdialog');
    await expect(dialog).toContainText('Üyeyi ekipten çıkar?');
    await page.screenshot({ path: `${SHOTS}/05-remove-dialog.png`, fullPage: true });

    await dialog.getByRole('button', { name: 'Vazgeç' }).click();
    await expect(dialog).toHaveCount(0);
    expect(await membershipCount()).toBe(before);

    await page.getByRole('button', { name: `${REMOVABLE.name} üyesini çıkar` }).click();
    await page.getByRole('alertdialog').getByRole('button', { name: 'Evet, çıkar' }).click();
    await expect(page.getByRole('status').filter({ hasText: 'Üye ekipten çıkarıldı; koltuğu boşaldı.' })).toBeVisible();
    await expect(members).not.toContainText(REMOVABLE.name);
    expect(await membershipCount()).toBe(before - 1);
  });

  test('MEMBER is refused: the page is a 403, invite is a 403 and writes nothing', async ({ page }) => {
    const email = inviteEmail('member');
    // NG-64: the page itself is behind `manage_users` on the server now, so a
    // MEMBER gets the 403 screen instead of the form with an in-page refusal.
    await signInAs(page, claims(MEMBER));
    const res = await page.goto(PATH);
    expect(res?.status()).toBe(403);
    await expect(page.getByRole('heading', { name: 'Bu sayfaya erişiminiz yok' })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Yeni Üye Davet Et' })).toHaveCount(0);
    await expect(page.getByRole('list', { name: 'Aktif ekip üyeleri' })).toHaveCount(0);

    const apiPost = await page.request.post('/api/invitations', { data: { email, role: 'MEMBER' } });
    expect(apiPost.status()).toBe(403);
    expect((await page.request.get('/api/team')).status()).toBe(403);
    expect(await invitationsOf(email)).toHaveLength(0);
    await page.screenshot({ path: `${SHOTS}/06-member-refused.png`, fullPage: true });
  });

  test('mobile 390px: no horizontal scroll, invite works, remove button is a 44px target', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    const email = inviteEmail('mobile');
    await openMembers(page);

    await invite(page, email);
    const pending = page.getByRole('list', { name: 'Bekleyen davetler' });
    await expect(pending).toContainText(email);

    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    expect(overflow).toBeLessThanOrEqual(0);

    const cancel = page.getByRole('button', { name: `${email} davetini iptal et` });
    const box = await cancel.boundingBox();
    expect(box?.height ?? 0).toBeGreaterThanOrEqual(44);
    await page.screenshot({ path: `${SHOTS}/07-mobile-390.png`, fullPage: true });
  });
});
