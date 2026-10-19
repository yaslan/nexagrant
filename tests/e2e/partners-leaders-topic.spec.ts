import { test, expect, type Page } from '@playwright/test';

import { prisma } from '../../src/lib/db';
import { shotsDir } from './fixtures/shots';
import { presentIds } from '../helpers/teardown-guard';
import { seedIdentity, cleanupIdentity, signInAs } from './fixtures/session';

/**
 * /partners/leaders?topic= (TASK-MVBBPXU1ZW0F5, FO-5) — real browser, real DB.
 *
 * Covers what the unit and live-DB tests cannot: the topic field reaches the
 * server component, the list shows the coordinator of the prefix and not the
 * participant, an invalid prefix shows the message instead of a list, and the
 * page text is in the chosen locale. Fixture rows use their own ids and are
 * removed afterwards.
 */

const SHOTS = shotsDir('TASK-MVBBPXU1ZW0F5-screenshots');
const WORKSPACE = 'main';
const MEMBER = {
  userId: 'e2e-fo5-leaders-member',
  email: 'fo5-leaders-member@e2e.fabrika.test',
  role: 'PIPELINE_MANAGER' as const,
  tenantId: 'demo-tenant',
};
const COORDINATOR = 'FO5E2E-ORG-COORD';
const PARTICIPANT = 'FO5E2E-ORG-PART';
const PROJECT = 'FO5E2E-PROJ-1';
const PREFIX = 'FO5E2E-CL5-';
const TOPIC = 'FO5E2E-CL5-2024-01';
const COORD_NAME = 'FO5 Coordinator Institute';
const PART_NAME = 'FO5 Participant Institute';
// The coordinator's 150000 EUR fixture contribution, in each locale's money format (FO-15).
const EC_TOTAL = { tr: '\u20ac150.000', en: '\u20ac150,000' } as const;

async function rollback() {
  await prisma.cordisParticipation.deleteMany({ where: { organisationId: { in: presentIds([COORDINATOR, PARTICIPANT]) } } });
  await prisma.cordisProject.deleteMany({ where: { id: { in: presentIds([PROJECT]) } } });
  await prisma.cordisOrganization.deleteMany({ where: { organisationId: { in: presentIds([COORDINATOR, PARTICIPANT]) } } });
}

async function seed() {
  await rollback();
  await prisma.cordisOrganization.createMany({
    data: [
      { organisationId: COORDINATOR, name: COORD_NAME, country: 'DE', activityType: 'REC' },
      { organisationId: PARTICIPANT, name: PART_NAME, country: 'FR', activityType: 'PRC' },
    ],
  });
  await prisma.cordisProject.create({
    data: {
      id: PROJECT,
      acronym: 'FO5E2E',
      title: 'FO-5 leaders e2e fixture project',
      framework: 'HORIZON',
      topics: { create: [{ topicCode: TOPIC, topicTitle: 'FO-5 fixture topic' }] },
    },
  });
  await prisma.cordisParticipation.createMany({
    data: [
      { projectId: PROJECT, organisationId: COORDINATOR, role: 'coordinator', ecContribution: BigInt(150000) },
      { projectId: PROJECT, organisationId: PARTICIPANT, role: 'participant', ecContribution: BigInt(90000) },
    ],
  });
}

async function open(page: Page, locale: string, query: string) {
  await signInAs(page, { id: MEMBER.userId, email: MEMBER.email, tenantId: MEMBER.tenantId, role: MEMBER.role });
  await page.goto(`/${locale}/${WORKSPACE}/partners/leaders${query}`);
}

test.describe('Partners leaders — topic filter (FO-5)', () => {
  test.beforeAll(async () => {
    await seedIdentity({ ...MEMBER, workspaceIds: [] });
    await seed();
  });
  test.afterAll(async () => {
    await rollback();
    await cleanupIdentity([MEMBER.userId]);
    await prisma.$disconnect();
  });

  for (const locale of ['tr', 'en'] as const) {
    test(`lists the coordinator of the prefix, not the participant (${locale})`, async ({ page }) => {
      await open(page, locale, `?topic=${PREFIX}`);

      const card = page.getByText(COORD_NAME, { exact: true });
      await expect(card).toBeVisible({ timeout: 30_000 });
      await expect(page.getByText(PART_NAME, { exact: true })).toHaveCount(0);
      await expect(page.getByRole('heading', { level: 1 })).toContainText(PREFIX);
      await expect(page.getByText(EC_TOTAL[locale], { exact: true })).toBeVisible();
      await page.screenshot({ path: `${SHOTS}/01-topic-${locale}.png`, fullPage: true });
    });
  }

  test('an invalid prefix shows the message and no list', async ({ page }) => {
    await open(page, 'en', '?topic=H%25');
    await expect(page.getByText('The prefix must be at least 3 characters', { exact: false })).toBeVisible({ timeout: 30_000 });
    await expect(page.getByText(COORD_NAME, { exact: true })).toHaveCount(0);
  });
});
