import { test, expect } from '@playwright/test';

import { prisma } from '../../src/lib/db';
import { shotsDir } from './fixtures/shots';
import { expectHydrated } from './fixtures/hydration';
import { signInAs } from './fixtures/session';

/**
 * TASK-MTVPOR2CMV1RT — posting a note from a pipeline card, in a real browser.
 *
 * The updater that clears a card's draft after the note is posted used to be
 * `{ ...prev[oppId], text: '' }`. Under `noUncheckedIndexedAccess` that is
 * `NoteInput | undefined` being spread, so the missing-entry case wrote back
 * `{ text: '' }` — a record with no `authorId` — into state whose type says
 * `authorId: string`.
 *
 * Why this spec exists even though the unit test carries the red/green proof:
 * `clearNoteText` is now on the live path at board.tsx, and the author `<select>`
 * next to the note box is CONTROLLED on exactly the field that used to go
 * missing. So this run proves, against Chromium and Postgres, that after a real
 * note is posted the select still holds the author the user chose (it does not
 * snap back to the first member), the draft box really is cleared, and React
 * never logs the controlled→uncontrolled downgrade that a missing `authorId`
 * would cause.
 *
 * The fixture is created and removed here rather than in `scripts/`: that
 * directory belongs to another agent's slice in this tree.
 */
const SHOTS = shotsDir('TASK-MTVPOR2CMV1RT-screenshots');

const F = {
  tenantId: 'nuia-note-e2e-tenant',
  workspaceId: 'nuia-note-e2e-workspace',
  workspaceSlug: 'nuia-note-e2e',
  oppId: 'nuia-note-e2e-opportunity',
  oppTitle: 'NUIA Note E2E — kart notu',
  // Two members, so "the author survived" is distinguishable from "fell back to
  // members[0]". `getWorkspaceMembers` orders by membership createdAt asc.
  firstUserId: 'nuia-note-e2e-user-1',
  firstEmail: 'nuia-note-e2e-1@fabrika.test',
  firstName: 'Ada Birinci',
  secondUserId: 'nuia-note-e2e-user-2',
  secondEmail: 'nuia-note-e2e-2@fabrika.test',
  secondName: 'Bora Ikinci',
} as const;

const BOARD_URL = `/tr/${F.workspaceSlug}/pipeline`;
const NOTE_TEXT = 'NUIA regresyon notu — yazar korunmali';

test.beforeAll(async () => {
  await prisma.tenant.upsert({
    where: { id: F.tenantId },
    update: {},
    create: { id: F.tenantId, name: 'NUIA Note E2E', slug: F.tenantId, country: 'TR', orgType: 'SME' },
  });
  await prisma.workspace.upsert({
    where: { id: F.workspaceId },
    update: {},
    create: { id: F.workspaceId, tenantId: F.tenantId, name: 'NUIA Note E2E', slug: F.workspaceSlug },
  });
  // M5 owns the pipeline board; the gate reads the tenant's own ModuleState row.
  await prisma.moduleState.upsert({
    where: { tenantId_moduleId: { tenantId: F.tenantId, moduleId: 'M5' } },
    update: { status: 'ON' },
    create: { tenantId: F.tenantId, moduleId: 'M5', status: 'ON', changedBy: 'TASK-MTVPOR2CMV1RT e2e' },
  });

  for (const [i, u] of [
    { id: F.firstUserId, email: F.firstEmail, name: F.firstName },
    { id: F.secondUserId, email: F.secondEmail, name: F.secondName },
  ].entries()) {
    await prisma.user.upsert({
      where: { id: u.id },
      update: { email: u.email, name: u.name },
      create: { id: u.id, email: u.email, name: u.name, locale: 'tr' },
    });
    await prisma.membership.upsert({
      where: { tenantId_userId: { tenantId: F.tenantId, userId: u.id } },
      update: { role: 'TENANT_OWNER', workspaceIds: [F.workspaceId] },
      // Fixed, ordered createdAt: the member list is ordered by it, and this spec
      // asserts on "the second member", not on whatever the clock produced.
      create: {
        userId: u.id,
        tenantId: F.tenantId,
        role: 'TENANT_OWNER',
        workspaceIds: [F.workspaceId],
        createdAt: new Date(Date.UTC(2026, 0, 1, 0, i)),
      },
    });
  }

  await prisma.opportunity.upsert({
    where: { id: F.oppId },
    update: { deletedAt: null },
    create: {
      id: F.oppId,
      tenantId: F.tenantId,
      workspaceId: F.workspaceId,
      title: F.oppTitle,
      stage: 'G0',
      ownerId: F.firstUserId,
    },
  });
});

test.afterAll(async () => {
  await prisma.opportunity.deleteMany({ where: { id: F.oppId } });
  await prisma.membership.deleteMany({ where: { tenantId: F.tenantId } });
  await prisma.user.deleteMany({ where: { id: { in: [F.firstUserId, F.secondUserId] } } });
  await prisma.moduleState.deleteMany({ where: { tenantId: F.tenantId } });
  await prisma.workspace.deleteMany({ where: { id: F.workspaceId } });
  await prisma.tenant.deleteMany({ where: { id: F.tenantId } });
  await prisma.$disconnect();
});

test('posting a note keeps the chosen author and clears only the text', async ({ page }) => {
  // React logs the controlled→uncontrolled downgrade as a console error. A
  // missing `authorId` on the select is exactly what raises it, so it is
  // collected rather than ignored.
  const consoleErrors: string[] = [];
  page.on('console', (msg) => {
    if (msg.type() === 'error') consoleErrors.push(msg.text());
  });

  // Sign in with JWT fixture pattern
  await signInAs(page, {
    id: F.firstUserId,
    email: F.firstEmail,
    name: F.firstName,
    role: 'TENANT_OWNER',
    tenantId: F.tenantId,
  });
  await page.goto(BOARD_URL);

  const card = page.getByTestId(`pipeline-card-${F.oppId}`);
  await expect(card).toBeVisible();

  // Expand the card to reach the note box — once React has attached the handler.
  const cardHeading = card.getByRole('heading', { name: F.oppTitle });
  await expectHydrated(cardHeading);
  await cardHeading.click();

  // Addressed by test id, not by position: an expanded card also carries the
  // "Atanan" owner select, and that one comes first in the DOM.
  const authorSelect = page.getByTestId(`pipeline-note-author-${F.oppId}`);
  const noteBox = page.getByTestId(`pipeline-note-text-${F.oppId}`);
  const addButton = page.getByTestId(`pipeline-note-add-${F.oppId}`);

  // Members arrive from a server action after mount.
  await expect(authorSelect.locator('option')).toHaveCount(2, { timeout: 20_000 });

  // Choose the SECOND member — not the default — so a silent fallback to
  // members[0] is visible rather than indistinguishable from success.
  await authorSelect.selectOption(F.secondUserId);
  await noteBox.fill(NOTE_TEXT);
  await page.screenshot({ path: `${SHOTS}/01-note-drafted.png`, fullPage: true });

  await addButton.click();

  // The note is on the card...
  await expect(card.getByText(NOTE_TEXT)).toBeVisible({ timeout: 20_000 });
  // ...the draft box was cleared...
  await expect(noteBox).toHaveValue('');
  // ...and the author the user picked is STILL the one selected. This is the
  // assertion the old updater put at risk: dropping `authorId` left the select
  // with `value={undefined}` and re-attributed the next note to members[0].
  await expect(authorSelect).toHaveValue(F.secondUserId);
  await page.screenshot({ path: `${SHOTS}/02-note-posted-author-kept.png`, fullPage: true });

  // The posted note is attributed to the member the user chose. `handleAddNote`
  // resolves the author with `members.find((m) => m.id === cardInput.authorId)
  // || members[0]`, so a dropped `authorId` shows up right here as the FIRST
  // member's name on the note — which is why the fixture has two of them.
  // (Notes are held in the in-memory pipeline store, not a table, so the screen
  // is where this is observable.)
  const postedNote = page.getByTestId(`pipeline-note-item-${F.oppId}`);
  await expect(postedNote).toHaveCount(1);
  await expect(postedNote).toContainText(NOTE_TEXT);
  await expect(postedNote).toContainText(F.secondName);
  await expect(postedNote).not.toContainText(F.firstName);

  const controlledWarnings = consoleErrors.filter((e) => /uncontrolled|controlled input/i.test(e));
  expect(controlledWarnings).toEqual([]);
});
