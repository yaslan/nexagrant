import { afterAll, beforeAll, describe, expect, test, vi } from 'vitest';

/**
 * NG-205 (SEC NG-203 D-A2) — a readiness lead may only go to a tenant that can see it.
 *
 * Before the fix the route target check (`isIntakeTenant`) read orgType, kind and deletedAt only:
 * a consultancy whose M18 was switched off could be picked as a province's target, and the
 * forwarder wrote the visitor's name and e-mail into a tenant where nobody can open M18. Personal
 * data with no owner who sees it (retention / KVKK).
 *
 * The rule is the module gate's own (src/lib/modules/state-machine.ts): the module must be open
 * to the tenant's own people. M18 is an unsold beta, so today that is PILOT only: DEV is staff
 * only, and OFF and ON close it as MODULE_OFF (`isStaffPreviewStatus`).
 *
 * Real Postgres, the `fabrika_app` role, no mocks (same singleton swap as m18-intake.live).
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

import { LEAD_INTAKE_CONSENT_DOCUMENT_ID, type LeadIntakeRequest } from '@/core/contracts/lead-intake';
import { createDbClient, prisma } from '@/lib/db';
import { listIntakeTenantOptions, setProvinceLeadRoute } from '@/lib/leads/province-route';
import { createLeadIntakePort } from '@/modules/m18/server/intake-repo';
import { assertRlsSubjectRole, requireRlsTestUrl, skipOrFailInCi } from './helpers/live-db-role';

const SUITE = 'm18 intake module state test';
const admin = createDbClient(OWNER_URL ?? 'postgresql://localhost:5432/unset');
const HAS_DB =
  requireRlsTestUrl(RLS_URL, SUITE) !== undefined &&
  Boolean(OWNER_URL) &&
  (await admin.$queryRaw`SELECT 1`.then(() => true).catch(() => false));
if (RLS_URL && !OWNER_URL) skipOrFailInCi(SUITE, 'DATABASE_URL (owner connection) is not set', 'Provide DATABASE_URL for the fixture/owner connection.');
else if (RLS_URL && !HAS_DB) skipOrFailInCi(SUITE, 'Postgres is unreachable');
if (HAS_DB) await assertRlsSubjectRole(prisma, SUITE);

const RUN = Math.random().toString(36).slice(2, 10);
const ACTOR = `ng205-admin-${RUN}`;
const NOW = new Date('2026-11-16T10:00:00Z');
/** Provinces no other test file uses. */
const PROVINCE = { closed: 'Muş', open: 'Ağrı' } as const;
const port = createLeadIntakePort(prisma);

/** M18 ModuleState per fixture tenant; `none` has no row at all (= OFF). All are eligible consultancies otherwise. */
const STATES = { none: null, off: 'OFF', dev: 'DEV', pilot: 'PILOT', on: 'ON' } as const;
type Key = keyof typeof STATES;
const T = {} as Record<Key, string>;
const CLOSED: Key[] = ['none', 'off', 'dev', 'on'];

function req(id: string, to: string): LeadIntakeRequest {
  return {
    publicLeadId: `pl-${RUN}-${id}`,
    targetTenantId: to,
    contact: { fullName: 'Ayşe Yılmaz', email: `ayse-${id}-${RUN}@example.test` },
    organisation: { name: `Muş Belediyesi ${id}`, province: 'Muş', district: null },
    readiness: null,
    consent: { documentId: LEAD_INTAKE_CONSENT_DOCUMENT_ID, documentVersion: '2026-11-16.1', grantedAt: NOW, locale: 'tr' },
    receivedAt: NOW,
  };
}

const written = async (tenantId: string) =>
  (await admin.leadOrganization.count({ where: { tenantId } })) + (await admin.leadContact.count({ where: { tenantId } }));

describe.skipIf(!HAS_DB)('M18 intake needs M18 open to the tenant (NG-205 / D-A2)', () => {
  beforeAll(async () => {
    await admin.provinceLeadRoute.deleteMany({ where: { province: { in: [PROVINCE.closed, PROVINCE.open] } } });
    for (const key of Object.keys(STATES) as Key[]) {
      const t = await admin.tenant.create({
        data: { name: `ng205-m18-${key}-${RUN}`, slug: `ng205-m18-${key}-${RUN}`, country: 'TR', orgType: 'CONSULTANCY', kind: 'ORGANIZATION' },
      });
      T[key] = t.id;
      const status = STATES[key];
      if (status) await admin.moduleState.create({ data: { tenantId: t.id, moduleId: 'M18', status, changedBy: 'ng205 test' } });
    }
  });

  afterAll(async () => {
    await admin.provinceLeadRoute.deleteMany({ where: { province: { in: [PROVINCE.closed, PROVINCE.open] } } });
    await admin.auditEvent.deleteMany({ where: { actorId: ACTOR } });
    await admin.consent.deleteMany({ where: { userId: { startsWith: `public-lead:pl-${RUN}-` } } });
    await admin.tenant.deleteMany({ where: { slug: { endsWith: `-${RUN}` } } });
    await admin.$disconnect();
    await prisma.$disconnect();
  });

  describe('forwarding (the M18 intake port)', () => {
    test.each(CLOSED)('M18 %s: refused as tenant_ineligible and nothing is written', async (key) => {
      const result = await port.accept(req(key, T[key]));
      expect(result).toEqual({ status: 'refused', reason: 'tenant_ineligible' });
      expect(await written(T[key])).toBe(0);
    });

    test('M18 PILOT: the lead lands', async () => {
      expect((await port.accept(req('pilot', T.pilot))).status).toBe('created');
      expect(await written(T.pilot)).toBe(2);
    });
  });

  describe('route assignment (platform admin)', () => {
    test.each(CLOSED)('M18 %s: setProvinceLeadRoute answers tenant_ineligible and writes no route, no audit', async (key) => {
      const result = await setProvinceLeadRoute({ province: PROVINCE.closed, tenantId: T[key] }, ACTOR, prisma);
      expect(result).toEqual({ ok: false, error: 'tenant_ineligible' });
      expect(await admin.provinceLeadRoute.count({ where: { province: PROVINCE.closed } })).toBe(0);
      expect(await admin.auditEvent.count({ where: { actorId: ACTOR, target: PROVINCE.closed } })).toBe(0);
    });

    test('M18 PILOT: the route is set', async () => {
      const result = await setProvinceLeadRoute({ province: PROVINCE.open, tenantId: T.pilot }, ACTOR, prisma);
      expect(result.ok).toBe(true);
    });

    test('the picker offers the PILOT tenant and none of the closed ones', async () => {
      const ids = new Set((await listIntakeTenantOptions(prisma)).map((o) => o.id));
      expect(ids.has(T.pilot)).toBe(true);
      for (const key of CLOSED) expect(ids.has(T[key]), key).toBe(false);
    });
  });
});
