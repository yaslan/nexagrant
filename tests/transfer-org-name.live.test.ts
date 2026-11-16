import { randomBytes } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, test, vi } from 'vitest';

/**
 * NG-179 — the transfer box's organisation name, read through
 * `public.province_transfer_org_name(text)` (prisma/migrations/add-province-transfer-org-name.sql),
 * measured on the real `fabrika_app` role (NOBYPASSRLS), no mocks.
 *
 * Why the function exists: NG-175 (SEC NG-170 D-1) closed ProvinceLeadRoute to the visitor's
 * 'public-intake' scope. transferOrgNameFor used to read the table under that scope, so as
 * fabrika_app it got 0 rows and the box never showed (the e2e only passed because the local
 * app connects as the SUPERUSER `fabrika`). D-1 is kept; the function returns one name.
 *
 * Fixtures and ground truth go through the owner role; the code under test runs as fabrika_app
 * (same singleton swap as tests/public-lead-rls.live.test.ts).
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
  // The publication gate is on for this file: with it off transferOrgNameFor reads nothing at all
  // (src/lib/leads/transfer-org.test.ts pins that side).
  process.env.LEAD_TRANSFER_CONSENT_ENABLED = 'true';
  return { rlsUrl, ownerUrl };
});

import { createDbClient, prisma } from '@/lib/db';
import { PUBLIC_LEAD_CONSENT, PUBLIC_LEAD_TRANSFER_CONSENT, submitPublicLead } from '@/lib/leads/public-lead';
import { transferOrgNameFor } from '@/lib/leads/transfer-org';
import { withSystemScopeOn } from '@/lib/system-scope';
import { isIntakeTenant } from '@/modules/m18/server/intake';
import { assertRlsSubjectRole, requireRlsTestUrl, skipOrFailInCi } from './helpers/live-db-role';

const SUITE = 'transfer org name test';
const IP_HASH_KEY = randomBytes(24).toString('hex');
const admin = createDbClient(OWNER_URL ?? 'postgresql://localhost:5432/unset');
const HAS_DB =
  requireRlsTestUrl(RLS_URL, SUITE) !== undefined &&
  Boolean(OWNER_URL) &&
  (await admin.$queryRaw`SELECT 1`.then(() => true).catch(() => false));
if (RLS_URL && !OWNER_URL) skipOrFailInCi(SUITE, 'DATABASE_URL (owner connection) is not set', 'Provide DATABASE_URL for the fixture/owner connection.');
else if (RLS_URL && !HAS_DB) skipOrFailInCi(SUITE, 'Postgres is unreachable');
if (HAS_DB) await assertRlsSubjectRole(prisma, SUITE);

const RUN = Math.random().toString(36).slice(2, 10);
const MINE = { endsWith: `-${RUN}@example.test` };

// Provinces this file owns (no other test uses them). One case each.
const CASES = {
  consultancy: { province: 'Tunceli', orgType: 'CONSULTANCY', kind: 'ORGANIZATION', deleted: false, active: true },
  agency: { province: 'Bayburt', orgType: 'SME', kind: 'AGENCY', deleted: false, active: true },
  notIntake: { province: 'Kilis', orgType: 'SME', kind: 'ORGANIZATION', deleted: false, active: true },
  deleted: { province: 'Hakkari', orgType: 'CONSULTANCY', kind: 'ORGANIZATION', deleted: true, active: true },
  inactive: { province: 'Bartın', orgType: 'CONSULTANCY', kind: 'ORGANIZATION', deleted: false, active: false },
} as const;
type Case = keyof typeof CASES;
const UNMAPPED = 'Gümüşhane';
const PROVINCES = [...Object.values(CASES).map((c) => c.province), UNMAPPED];
const ids = {} as Record<Case, string>;
const nameOf = (c: Case) => `ng179-${c}-${RUN}`;

/** fabrika_app inside one tenant's session, like withTenantOn. */
const asTenant = <R>(tenantId: string, fn: (tx: Parameters<Parameters<typeof prisma.$transaction>[0]>[0]) => Promise<R>) =>
  prisma.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT set_config('app.tenant_id', ${tenantId}, true)`;
    return fn(tx);
  });

describe.skipIf(!HAS_DB)('province_transfer_org_name (NG-179)', () => {
  beforeAll(async () => {
    await admin.provinceLeadRoute.deleteMany({ where: { province: { in: PROVINCES } } });
    for (const [key, c] of Object.entries(CASES) as [Case, (typeof CASES)[Case]][]) {
      const t = await admin.tenant.create({
        data: {
          name: nameOf(key), slug: nameOf(key), country: 'TR', orgType: c.orgType, kind: c.kind,
          deletedAt: c.deleted ? new Date() : null,
        },
      });
      ids[key] = t.id;
      await admin.provinceLeadRoute.create({ data: { province: c.province, targetTenantId: t.id, active: c.active } });
    }
  });

  afterAll(async () => {
    await admin.publicLead.deleteMany({ where: { email: MINE } });
    await admin.provinceLeadRoute.deleteMany({ where: { province: { in: PROVINCES } } });
    await admin.tenant.deleteMany({ where: { slug: { endsWith: `-${RUN}` } } });
    await admin.$disconnect();
    await prisma.$disconnect();
  });

  describe('what the visitor gets (fabrika_app, no scope)', () => {
    test('an active route to an eligible tenant → that tenant\'s name (consultancy and agency)', async () => {
      expect(await transferOrgNameFor(CASES.consultancy.province)).toBe(nameOf('consultancy'));
      expect(await transferOrgNameFor(CASES.agency.province)).toBe(nameOf('agency'));
    });

    test.each(['notIntake', 'deleted', 'inactive'] as const)('%s → null', async (c) => {
      expect(await transferOrgNameFor(CASES[c].province)).toBeNull();
    });

    test('unmapped, empty and unknown provinces → null', async () => {
      expect(await transferOrgNameFor(UNMAPPED)).toBeNull();
      expect(await transferOrgNameFor('')).toBeNull();
      expect(await transferOrgNameFor(null)).toBeNull();
      expect(await transferOrgNameFor('Atlantis')).toBeNull();
    });

    test('the function itself, given anything that is not a mapped province name, answers NULL', async () => {
      for (const p of [UNMAPPED, "Tunceli' OR '1'='1", '%', 'tunceli', ' Tunceli', '']) {
        const rows = await prisma.$queryRaw<Array<{ name: string | null }>>`SELECT public.province_transfer_org_name(${p}) AS name`;
        expect(rows, p).toEqual([{ name: null }]);
      }
    });

    test('same rule as isIntakeTenant(): for every fixture the function answers iff the tenant is eligible and the route active', async () => {
      const tenants = await admin.tenant.findMany({
        where: { id: { in: Object.values(ids) } },
        select: { id: true, orgType: true, kind: true, deletedAt: true },
      });
      for (const [key, c] of Object.entries(CASES) as [Case, (typeof CASES)[Case]][]) {
        const t = tenants.find((x) => x.id === ids[key]);
        expect(t, key).toBeDefined();
        const expected = c.active && isIntakeTenant(t!) ? nameOf(key) : null;
        const rows = await prisma.$queryRaw<Array<{ name: string | null }>>`SELECT public.province_transfer_org_name(${c.province}) AS name`;
        expect(rows[0]?.name ?? null, key).toBe(expected);
      }
    });
  });

  describe('what a tenant session cannot learn through it', () => {
    test('the signature: one text in, one text out, not a set, no other column', async () => {
      const [fn] = await prisma.$queryRaw<
        Array<{ args: string; result: string; retset: boolean; definer: boolean; config: string[] | null; owner_is_me: boolean }>
      >`SELECT pg_get_function_identity_arguments(p.oid) AS args, format_type(p.prorettype, NULL) AS result,
               p.proretset AS retset, p.prosecdef AS definer, p.proconfig AS config,
               pg_get_userbyid(p.proowner) = current_user AS owner_is_me
          FROM pg_proc p WHERE p.oid = 'public.province_transfer_org_name(text)'::regprocedure`;
      expect(fn).toEqual({
        args: 'p_province text', result: 'text', retset: false, definer: true,
        config: ['search_path=public, pg_temp'], owner_is_me: false,
      });
    });

    test('in tenant A\'s session: `SELECT *` gives one column `province_transfer_org_name`, the name and nothing else', async () => {
      const rows = await asTenant(ids.consultancy, (tx) =>
        tx.$queryRaw<Array<Record<string, unknown>>>`SELECT * FROM public.province_transfer_org_name(${CASES.consultancy.province})`
      );
      expect(rows).toEqual([{ province_transfer_org_name: nameOf('consultancy') }]);
      // No tenant id anywhere in what came back.
      expect(JSON.stringify(rows)).not.toContain(ids.consultancy);
    });

    test('in tenant A\'s session the table itself still reads 0 rows (the function is not a way in)', async () => {
      const seen = await asTenant(ids.consultancy, (tx) => tx.provinceLeadRoute.count({ where: { province: { in: PROVINCES } } }));
      expect(seen).toBe(0);
    });

    test('PUBLIC has no EXECUTE; fabrika_app has it by name', async () => {
      const [acl] = await admin.$queryRaw<Array<{ public_exec: boolean; app_exec: boolean }>>`
        SELECT EXISTS (SELECT 1 FROM aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) a
                        WHERE a.grantee = 0 AND a.privilege_type = 'EXECUTE') AS public_exec,
               has_function_privilege('fabrika_app', p.oid, 'EXECUTE') AS app_exec
          FROM pg_proc p WHERE p.oid = 'public.province_transfer_org_name(text)'::regprocedure`;
      expect(acl).toEqual({ public_exec: false, app_exec: true });
    });
  });

  describe('D-1 is unchanged: public-intake still cannot read ProvinceLeadRoute', () => {
    test.each(['public-intake', 'tenant-discovery'] as const)('a sealed %s scope reads 0 route rows', async (purpose) => {
      const n = await withSystemScopeOn(prisma, purpose, 'ng-179.test', (tx) => tx.provinceLeadRoute.count({ where: { province: { in: PROVINCES } } }));
      expect(n).toBe(0);
    });

    test('the owner sees all five fixture routes (the 0 above is the policy, not an empty table)', async () => {
      expect(await admin.provinceLeadRoute.count({ where: { province: { in: PROVINCES } } })).toBe(5);
    });
  });

  describe('province_transfer_org (NG-204): the submit-side twin returns the id of the SAME organisation', () => {
    test('for every case: same eligibility as the name function; id + name of that tenant, or no row', async () => {
      for (const c of Object.keys(CASES) as Case[]) {
        const named = await prisma.$queryRaw<Array<{ name: string | null }>>`SELECT public.province_transfer_org_name(${CASES[c].province}) AS name`;
        const rows = await prisma.$queryRaw<Array<{ tenant_id: string; org_name: string }>>`SELECT * FROM public.province_transfer_org(${CASES[c].province})`;
        if (named[0]?.name) expect(rows).toEqual([{ tenant_id: ids[c], org_name: named[0].name }]);
        else expect(rows).toEqual([]);
      }
      expect(await prisma.$queryRaw`SELECT * FROM public.province_transfer_org(${UNMAPPED})`).toEqual([]);
    });

    test('SECURITY DEFINER, fixed search_path, PUBLIC/anon/authenticated cannot execute it, fabrika_app can', async () => {
      const [fn] = await admin.$queryRaw<Array<{ definer: boolean; config: string[] | null; pub: boolean; anon: boolean | null; auth: boolean | null; app: boolean }>>`
        SELECT p.prosecdef AS definer, p.proconfig AS config,
               EXISTS (SELECT 1 FROM aclexplode(COALESCE(p.proacl, acldefault('f', p.proowner))) a WHERE a.grantee = 0 AND a.privilege_type = 'EXECUTE') AS pub,
               CASE WHEN EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN has_function_privilege('anon', p.oid, 'EXECUTE') END AS anon,
               CASE WHEN EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN has_function_privilege('authenticated', p.oid, 'EXECUTE') END AS auth,
               has_function_privilege('fabrika_app', p.oid, 'EXECUTE') AS app
          FROM pg_proc p WHERE p.oid = 'public.province_transfer_org(text)'::regprocedure`;
      expect(fn).toMatchObject({ definer: true, config: ['search_path=public, pg_temp'], pub: false, app: true });
      expect(fn?.anon).not.toBe(true);
      expect(fn?.auth).not.toBe(true);
    });
  });

  describe('the lead write as fabrika_app', () => {
    // NG-204: the form sends the organisation name it showed under the box alongside the tick.
    const submit = (who: string, province: string, transferConsent: boolean, ip: string, transferOrgName?: string) =>
      submitPublicLead(
        {
          name: 'Ayşe Yılmaz', email: `${who}-${RUN}@example.test`, organisation: 'Pertek Belediyesi', province, district: '',
          readinessCode: 'municipality.111111111111111', consent: true, consentVersion: PUBLIC_LEAD_CONSENT.version,
          transferConsent, transferOrgName, source: 'fon-hazirlik', locale: 'tr', website: '',
        },
        { ip, secret: IP_HASH_KEY }
      );
    const stored = (who: string) =>
      admin.publicLead.findFirst({
        where: { email: `${who}-${RUN}@example.test` },
        select: { transferConsent: true, transferConsentVersion: true, transferConsentAt: true, transferConsentTenantId: true, transferConsentOrgName: true },
      });

    test('mapped province + box ticked → the transfer consent is recorded', async () => {
      expect(await submit('ticked', CASES.consultancy.province, true, '192.0.2.179', nameOf('consultancy'))).toEqual({ ok: true });
      const row = await stored('ticked');
      expect(row).toMatchObject({
        transferConsent: true, transferConsentVersion: PUBLIC_LEAD_TRANSFER_CONSENT.version,
        transferConsentTenantId: ids.consultancy, transferConsentOrgName: nameOf('consultancy'),
      });
      expect(row?.transferConsentAt).toBeInstanceOf(Date);
    });

    test('ineligible tenant + box ticked → lead stored, no transfer consent', async () => {
      expect(await submit('ineligible', CASES.deleted.province, true, '192.0.2.180', nameOf('deleted'))).toEqual({ ok: true });
      expect(await stored('ineligible')).toEqual({
        transferConsent: false, transferConsentVersion: null, transferConsentAt: null, transferConsentTenantId: null, transferConsentOrgName: null,
      });
    });
  });
});
