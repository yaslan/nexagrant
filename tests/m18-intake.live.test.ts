import { afterAll, beforeAll, describe, expect, test, vi } from 'vitest';

/**
 * M18 lead intake (NG-138) — real Postgres, real Prisma, the `fabrika_app` role
 * (NOBYPASSRLS), no mocks. Same singleton swap as tests/public-lead.live.test.ts: the code
 * under test runs as fabrika_app, fixtures and counts go through the owner role.
 */
const { rlsUrl: RLS_URL, ownerUrl: OWNER_URL } = await vi.hoisted(async () => {
  const { readFileSync, existsSync } = await import('node:fs');
  const { resolve } = await import('node:path');
  const path = resolve(process.cwd(), '.env');
  const read = (key: string): string | undefined => {
    if (!existsSync(path)) return undefined;
    for (const line of readFileSync(path, 'utf8').split('\n')) {
      const t = line.trim();
      const i = t.indexOf('=');
      if (i > 0 && t.slice(0, i) === key) return t.slice(i + 1).replace(/^["']|["']$/g, '') || undefined;
    }
    return undefined;
  };
  const ownerUrl = process.env.DATABASE_URL ?? read('DATABASE_URL');
  const rlsUrl = process.env.DATABASE_URL_RLS_TEST ?? read('DATABASE_URL_RLS_TEST');
  if (rlsUrl) process.env.DATABASE_URL = rlsUrl;
  return { rlsUrl, ownerUrl };
});

import {
  LEAD_INTAKE_CONSENT_DOCUMENT_ID,
  leadIntakeSourceRef,
  type LeadIntakeRequest,
} from '@/core/contracts/lead-intake';
import { createDbClient, prisma } from '@/lib/db';
import { createLeadIntakePort, leadIntakeConsentSubject } from '@/modules/m18/server/intake-repo';
import { assertRlsSubjectRole, requireRlsTestUrl, skipOrFailInCi } from './helpers/live-db-role';

const SUITE = 'm18 lead intake test';
const admin = createDbClient(OWNER_URL ?? 'postgresql://fabrika:fabrika@localhost:5432/fabrika');
const HAS_DB =
  requireRlsTestUrl(RLS_URL, SUITE) !== undefined &&
  (await admin.$queryRaw`SELECT 1`.then(() => true).catch(() => false));
if (RLS_URL && !HAS_DB) skipOrFailInCi(SUITE, 'Postgres is unreachable');
if (HAS_DB) await assertRlsSubjectRole(prisma, SUITE);

const RUN = Math.random().toString(36).slice(2, 10);
const NOW = new Date('2026-11-14T10:00:00Z');
const port = createLeadIntakePort(prisma);
const tenants: Record<'consultancy' | 'agency' | 'other' | 'sme', string> = { consultancy: '', agency: '', other: '', sme: '' };

function req(over: Partial<LeadIntakeRequest> & { id: string; to: string }): LeadIntakeRequest {
  const { id, to, ...rest } = over;
  return {
    publicLeadId: `pl-${RUN}-${id}`,
    targetTenantId: to,
    contact: { fullName: 'Ayşe Yılmaz', email: `ayse-${id}-${RUN}@example.test` },
    organisation: { name: `İlkadım Belediyesi ${id}`, province: 'Samsun', district: 'İlkadım' },
    readiness: { code: 'municipality.111111111111111', total: 62, level: 'ready' },
    consent: { documentId: LEAD_INTAKE_CONSENT_DOCUMENT_ID, documentVersion: '2026-11-14.1', grantedAt: NOW, locale: 'tr' },
    receivedAt: NOW,
    ...rest,
  };
}

async function counts(tenantId: string) {
  const [orgs, contacts, deals, tasks, activities, consents] = await Promise.all([
    admin.leadOrganization.count({ where: { tenantId } }),
    admin.leadContact.count({ where: { tenantId } }),
    admin.deal.count({ where: { tenantId } }),
    admin.dealTask.count({ where: { tenantId } }),
    admin.dealActivity.count({ where: { tenantId } }),
    admin.consent.count({ where: { tenantId, purpose: 'LEAD_INTAKE' } }),
  ]);
  return { orgs, contacts, deals, tasks, activities, consents };
}

const ZERO = { orgs: 0, contacts: 0, deals: 0, tasks: 0, activities: 0, consents: 0 };

describe.skipIf(!HAS_DB)('M18 lead intake', () => {
  beforeAll(async () => {
    const mk = (key: keyof typeof tenants, orgType: 'CONSULTANCY' | 'SME', kind: 'ORGANIZATION' | 'AGENCY') =>
      admin.tenant
        .create({ data: { name: `intake-${key}-${RUN}`, slug: `intake-${key}-${RUN}`, country: 'TR', orgType, kind } })
        .then((t) => (tenants[key] = t.id));
    await mk('consultancy', 'CONSULTANCY', 'ORGANIZATION');
    await mk('agency', 'SME', 'AGENCY');
    await mk('sme', 'SME', 'ORGANIZATION');
    await mk('other', 'CONSULTANCY', 'ORGANIZATION');
  });

  afterAll(async () => {
    await admin.consent.deleteMany({ where: { userId: { startsWith: `public-lead:pl-${RUN}-` } } });
    await admin.tenant.deleteMany({ where: { slug: { endsWith: `-${RUN}` } } });
    await admin.$disconnect();
    await prisma.$disconnect();
  });

  test('consent given: organisation, contact, deal, task, activity and the Consent row land in the tenant', async () => {
    const r = req({ id: 'a', to: tenants.consultancy });
    const result = await port.accept(r);
    expect(result.status).toBe('created');
    if (result.status !== 'created') return;

    expect(await counts(tenants.consultancy)).toEqual({ orgs: 1, contacts: 1, deals: 1, tasks: 1, activities: 1, consents: 1 });
    const deal = await admin.deal.findUniqueOrThrow({ where: { id: result.ids.dealId } });
    expect(deal).toMatchObject({ stage: 'NEW', tenantId: tenants.consultancy, primaryContactId: result.ids.contactId });
    expect(deal.sourceRef).toBe(leadIntakeSourceRef(r.publicLeadId));
    expect(deal.title).toContain('İlkadım Belediyesi a');
    const org = await admin.leadOrganization.findUniqueOrThrow({ where: { id: result.ids.organizationId } });
    expect(org).toMatchObject({ provinceCode: '55', district: 'İlkadım' });
    const task = await admin.dealTask.findUniqueOrThrow({ where: { id: result.ids.taskId } });
    expect(task).toMatchObject({ autoGenerated: true, autoRuleKey: 'new.first-contact' });
    expect(task.dueAt?.toISOString()).toBe(new Date(NOW.getTime() + 2 * 86_400_000).toISOString());
    const consent = await admin.consent.findFirstOrThrow({ where: { tenantId: tenants.consultancy, purpose: 'LEAD_INTAKE' } });
    expect(consent).toMatchObject({
      kind: 'EXPLICIT_CONSENT',
      userId: leadIntakeConsentSubject(r.publicLeadId),
      documentId: LEAD_INTAKE_CONSENT_DOCUMENT_ID,
      withdrawnAt: null,
    });
  });

  test('an AGENCY-kind tenant receives too', async () => {
    expect((await port.accept(req({ id: 'ag', to: tenants.agency }))).status).toBe('created');
  });

  test('without consent nothing is written', async () => {
    for (const consent of [null, { documentId: 'public-lead-contact', documentVersion: 'v', grantedAt: NOW, locale: 'tr' as const }]) {
      const result = await port.accept(req({ id: 'nc', to: tenants.other, consent }));
      expect(result.status).toBe('refused');
    }
    const withdrawn = await port.accept(
      req({ id: 'wd', to: tenants.other, consent: { documentId: LEAD_INTAKE_CONSENT_DOCUMENT_ID, documentVersion: 'v', grantedAt: NOW, locale: 'tr', withdrawnAt: NOW } })
    );
    expect(withdrawn).toEqual({ status: 'refused', reason: 'consent_withdrawn' });
    expect(await counts(tenants.other)).toEqual(ZERO);
  });

  test('a tenant that is neither CONSULTANCY nor AGENCY is refused', async () => {
    expect(await port.accept(req({ id: 'sme', to: tenants.sme }))).toEqual({ status: 'refused', reason: 'tenant_ineligible' });
    expect(await counts(tenants.sme)).toEqual(ZERO);
  });

  test('an unknown tenant is refused', async () => {
    expect(await port.accept(req({ id: 'ghost', to: `ghost-${RUN}` }))).toEqual({ status: 'refused', reason: 'tenant_not_found' });
  });

  test('the same public lead twice is a duplicate with the same ids, nothing more is written', async () => {
    const r = req({ id: 'dup', to: tenants.other });
    const first = await port.accept(r);
    const before = await counts(tenants.other);
    const second = await port.accept(r);
    expect(first.status).toBe('created');
    expect(second.status).toBe('duplicate');
    if (first.status === 'created' && second.status === 'duplicate') expect(second.ids).toEqual(first.ids);
    expect(await counts(tenants.other)).toEqual(before);
  });

  test('two concurrent requests for one public lead land once', async () => {
    const r = req({ id: 'race', to: tenants.consultancy });
    const before = await counts(tenants.consultancy);
    const results = await Promise.all([port.accept(r), port.accept(r)]);
    expect(results.map((x) => x.status).sort()).toEqual(['created', 'duplicate']);
    const after = await counts(tenants.consultancy);
    expect(after.deals - before.deals).toBe(1);
    expect(after.consents - before.consents).toBe(1);
  });

  test('a tenant cannot see another tenant’s intake rows (RLS)', async () => {
    const seen = await prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT set_config('app.tenant_id', ${tenants.agency}, true)`;
      return tx.deal.count({ where: { sourceRef: { startsWith: `public-lead:pl-${RUN}-` } } });
    });
    expect(seen).toBe(1); // only 'ag'
  });
});
