/**
 * FO-61 (PS-K3, TASK-MVCH2R3VSLAJN) — the pure parts of the Partner Search API:
 * the topic signal, the access decision, the catalogue's plan terms, the query
 * schema, the list filter, masking on the way out, the export attribution and
 * the quota statement. The same statement against a real database, and its
 * eleventh-query refusal under concurrency: tests/partner-search-quota.live.test.ts.
 */
import { describe, expect, it, vi } from 'vitest';

import { grantsFor, partnerSearchGrant, PLAN_LIMIT_KEYS, planNamesGrantingPartnerSearchExport } from '@/lib/billing/catalog';
import type { TenantTx } from '@/lib/db';
import { decideModuleAccess, type ModuleAccessResult } from '@/lib/modules/tenant-access';
import type { ModuleStatus } from '@/lib/modules/types';
import {
  announcementWhere,
  computePartnerSignal,
  consumePartnerSearchQuery,
  decidePartnerSearchAccess,
  escapeLike,
  parsePartnerSearchQuery,
  quotaMonth,
  quotaResetsAt,
  quotaState,
  toAnnouncementDto,
  toExportCsv,
  toExportJson,
  type AnnouncementRow,
  type SignalRow,
} from '@/modules/m1/server/partner-search/api';

const m1Open: ModuleAccessResult = { allowed: true, status: 'ON' };
const m1NotInPlan: ModuleAccessResult = {
  allowed: false,
  status: 'OFF',
  reason: 'PLAN_UPGRADE_REQUIRED',
  requiredPlans: ['Pro', 'Ultra'],
};
const m1SwitchedOff: ModuleAccessResult = { allowed: false, status: 'OFF', reason: 'MODULE_OFF' };
const member = (role: string) => ({ kind: 'member' as const, role });
const sessionViewer = (role: string, isPlatformAdmin = false) => ({ role, isPlatformAdmin });
/** M1 as the route gets it for a tenant whose plan lacks M1 (Discover, Basic): built by the same call, not typed. */
const m1OutOfPlan = (status: ModuleStatus, role: string) => decideModuleAccess('M1', status, [], sessionViewer(role));

describe('computePartnerSignal', () => {
  it('counts requests, offers, countries, organisation types and Türkiye', () => {
    const rows: SignalRow[] = [
      { type: 'EXPERTISE_REQUEST', country: 'TR', organizationType: 'PRC' },
      { type: 'EXPERTISE_REQUEST', country: 'de', organizationType: 'HES' },
      { type: 'EXPERTISE_OFFER', country: 'DE', organizationType: 'HES' },
      { type: 'EXPERTISE_OFFER', country: null, organizationType: 'OTH' },
      { type: 'EXPERTISE_OFFER', country: 'tr', organizationType: 'PUB' },
    ];
    expect(computePartnerSignal(rows)).toEqual({
      total: 5,
      requests: 2,
      offers: 3,
      byCountry: { TR: 2, DE: 2 },
      byOrgType: { HES: 2, REC: 0, PRC: 1, PUB: 1, OTH: 1 },
      trCount: 2,
    });
  });

  it('is all zeros for a topic with no announcement, with every organisation type present', () => {
    expect(computePartnerSignal([])).toEqual({
      total: 0,
      requests: 0,
      offers: 0,
      byCountry: {},
      byOrgType: { HES: 0, REC: 0, PRC: 0, PUB: 0, OTH: 0 },
      trCount: 0,
    });
  });
});

describe('catalogue: Partner Search terms per plan', () => {
  it('meters Discover and Basic, leaves Pro unlimited and gives the export to Ultra only', () => {
    expect(partnerSearchGrant('free', false)).toEqual({ queriesMonthly: 10, export: false });
    expect(partnerSearchGrant('basic', false)).toEqual({ queriesMonthly: 10, export: false });
    expect(partnerSearchGrant('pro', true)).toEqual({ queriesMonthly: null, export: false });
    expect(partnerSearchGrant('ultra', true)).toEqual({ queriesMonthly: null, export: true });
  });

  it('reads the figure from the catalogue, never from a second copy', () => {
    expect(partnerSearchGrant('free', false).queriesMonthly).toBe(grantsFor('free')?.limits?.partner_search_queries_monthly);
    expect(PLAN_LIMIT_KEYS.partnerSearchQueriesMonthly).toBe('partner_search_queries_monthly');
  });

  it('keeps the monthly cap of a metered plan when M1 comes as an add-on, and still no export', () => {
    // An add-on M1 on Basic: the plan states 10, which still meters it.
    expect(partnerSearchGrant('basic', true)).toEqual({ queriesMonthly: 10, export: false });
    // An unknown plan id grants nothing without M1.
    expect(partnerSearchGrant('no-such-plan', false)).toEqual({ queriesMonthly: 0, export: false });
  });

  it('gives public-sector packages the terms of their base plan', () => {
    expect(partnerSearchGrant('public-starter', false)).toEqual({ queriesMonthly: 10, export: false });
    expect(partnerSearchGrant('public-team', true)).toEqual({ queriesMonthly: null, export: false });
    expect(partnerSearchGrant('public-institution', true)).toEqual({ queriesMonthly: null, export: true });
  });

  it('names the purchasable plans that carry the export for an upgrade prompt', () => {
    expect(planNamesGrantingPartnerSearchExport()).toEqual(['Ultra']);
  });
});

describe('decidePartnerSearchAccess', () => {
  const discover = { queriesMonthly: 10, export: false };

  it('Pro (M1 on) is allowed and unlimited', () => {
    expect(decidePartnerSearchAccess(member('MEMBER'), m1Open, { queriesMonthly: null, export: false }, sessionViewer('MEMBER'))).toEqual({
      allowed: true,
      quota: null,
      export: false,
    });
  });

  it('Discover (no M1, metered) is allowed with its quota and without the export', () => {
    expect(decidePartnerSearchAccess(member('TENANT_OWNER'), m1NotInPlan, discover, sessionViewer('TENANT_OWNER'))).toEqual({
      allowed: true,
      quota: 10,
      export: false,
    });
  });

  // FO-41: Discover's M1 is in the plan (limited), so the switch-off refusal is
  // what a metered plan meets first. The free signal and the quota'd list must
  // still open with the switch off, as they did before M1 moved into the plan.
  it('Discover (limited M1 in the plan, switch off) is allowed with its quota', () => {
    expect(decidePartnerSearchAccess(member('TENANT_OWNER'), m1SwitchedOff, discover, sessionViewer('TENANT_OWNER'))).toEqual({
      allowed: true,
      quota: 10,
      export: false,
    });
  });

  it('a plan with neither M1 nor a quota gets the module gate refusal and the plans to upgrade to', () => {
    expect(
      decidePartnerSearchAccess(member('TENANT_OWNER'), m1NotInPlan, { queriesMonthly: 0, export: false }, sessionViewer('TENANT_OWNER'))
    ).toEqual({
      allowed: false,
      reason: 'PLAN_UPGRADE_REQUIRED',
      requiredPlans: ['Pro', 'Ultra'],
    });
  });

  it('Pro with M1 switched off is refused: the switch is not bypassed by the quota path', () => {
    expect(
      decidePartnerSearchAccess(member('TENANT_OWNER'), m1SwitchedOff, { queriesMonthly: null, export: false }, sessionViewer('TENANT_OWNER'))
    ).toEqual({
      allowed: false,
      reason: 'MODULE_OFF',
    });
    // Same for a metered plan whose refusal is not the plan.
    expect(
      decidePartnerSearchAccess(
        member('TENANT_OWNER'),
        { allowed: false, status: 'DEV', reason: 'DEV_INTERNAL_ONLY' },
        discover,
        sessionViewer('TENANT_OWNER')
      )
    ).toEqual({ allowed: false, reason: 'DEV_INTERNAL_ONLY' });
  });

  // se-fb S1 (PR #165, round 3): on a metered plan the rollout of M1 must still hold.
  // Before the fix Discover MEMBER got 200 with M1 in DEV or PILOT, Pro MEMBER got 403.
  it('a metered plan honours M1 DEV (staff only): a tenant MEMBER is refused as on Pro', () => {
    expect(decidePartnerSearchAccess(member('MEMBER'), m1OutOfPlan('DEV', 'MEMBER'), discover, sessionViewer('MEMBER'))).toEqual({
      allowed: false,
      reason: 'DEV_INTERNAL_ONLY',
    });
    expect(
      decidePartnerSearchAccess(member('TENANT_OWNER'), m1OutOfPlan('DEV', 'TENANT_OWNER'), discover, sessionViewer('TENANT_OWNER'))
    ).toEqual({ allowed: false, reason: 'DEV_INTERNAL_ONLY' });
  });

  it('a metered plan honours M1 PILOT (managers only): a MEMBER is refused, a manager gets the quota', () => {
    expect(decidePartnerSearchAccess(member('MEMBER'), m1OutOfPlan('PILOT', 'MEMBER'), discover, sessionViewer('MEMBER'))).toEqual({
      allowed: false,
      reason: 'PILOT_MANAGERS_ONLY',
    });
    expect(
      decidePartnerSearchAccess(member('TENANT_OWNER'), m1OutOfPlan('PILOT', 'TENANT_OWNER'), discover, sessionViewer('TENANT_OWNER'))
    ).toEqual({ allowed: true, quota: 10, export: false });
  });

  it('platform staff pass M1 DEV on a metered plan, and an API key passes M1 PILOT', () => {
    expect(
      decidePartnerSearchAccess(member('MEMBER'), m1OutOfPlan('DEV', 'MEMBER'), discover, sessionViewer('MEMBER', true))
    ).toEqual({ allowed: true, quota: 10, export: false });
    expect(decidePartnerSearchAccess({ kind: 'apiKey' }, m1OutOfPlan('PILOT', 'MEMBER'), discover, { kind: 'machine', role: 'API_KEY', isPlatformAdmin: false, isMachine: true })).toEqual({
      allowed: true,
      quota: 10,
      export: false,
    });
  });

  it('an OFF switch stays open on a metered plan: no ModuleState row is the metered default', () => {
    expect(decidePartnerSearchAccess(member('MEMBER'), m1OutOfPlan('OFF', 'MEMBER'), discover, sessionViewer('MEMBER'))).toEqual({
      allowed: true,
      quota: 10,
      export: false,
    });
  });

  it('refuses a guest partner and an unknown role before anything else', () => {
    for (const role of ['GUEST_PARTNER', 'NOT_A_ROLE']) {
      expect(decidePartnerSearchAccess(member(role), m1Open, { queriesMonthly: null, export: true }, sessionViewer(role))).toEqual({
        allowed: false,
        reason: 'ROLE_FORBIDDEN',
      });
    }
  });

  it('lets an API key through on the M1 decision alone (it holds no membership role)', () => {
    expect(
      decidePartnerSearchAccess({ kind: 'apiKey' }, m1Open, { queriesMonthly: null, export: true }, { kind: 'machine', role: 'API_KEY', isPlatformAdmin: false, isMachine: true })
    ).toEqual({
      allowed: true,
      quota: null,
      export: true,
    });
  });
});

describe('query hardening (se-fb S2, S3)', () => {
  it('escapes the LIKE wildcards and the escape character itself', () => {
    expect(escapeLike('100%_\\')).toBe('100\\%\\_\\\\');
    expect(escapeLike('plain words')).toBe('plain words');
  });

  it('a search for "100%" is a substring match on that text, not a match-all pattern', () => {
    const where = announcementWhere({ q: '100%' }) as { OR: Array<Record<string, { contains: string }>> };
    expect(where.OR[0]?.organizationName?.contains).toBe('100\\%');
    expect(where.OR[1]?.description?.contains).toBe('100\\%');
  });

  it('refuses a NUL byte in q with a 400-class parse failure, not a query error', () => {
    expect(parsePartnerSearchQuery(new URLSearchParams('q=a%00b')).success).toBe(false);
    expect(parsePartnerSearchQuery(new URLSearchParams('q=ab')).success).toBe(true);
  });
});

describe('query schema and filter', () => {
  const parse = (qs: string) => parsePartnerSearchQuery(new URLSearchParams(qs));

  it('normalises case and drops blank values', () => {
    const r = parse('topic=HORIZON-CL4-2026-01&country=de&type=expertise_offer&orgType=hes&q=%20&page=2');
    expect(r.success && r.data).toEqual({
      topic: 'HORIZON-CL4-2026-01',
      country: 'DE',
      type: 'EXPERTISE_OFFER',
      orgType: 'HES',
      page: 2,
    });
    expect(parse('').success && parse('').data).toEqual({ page: 1 });
  });

  it.each(['country=DEU', 'type=OFFER', 'orgType=XYZ', 'page=0', 'page=abc', `q=${'x'.repeat(201)}`])(
    'rejects %s',
    (qs) => {
      expect(parse(qs).success).toBe(false);
    }
  );

  it('never lists withdrawn announcements, filtered or not', () => {
    expect(announcementWhere({})).toEqual({ withdrawnAt: null });
    expect(announcementWhere({ country: 'TR', q: 'robot', pic: '999999999' })).toEqual({
      withdrawnAt: null,
      country: 'TR',
      organizationPic: '999999999',
      OR: [
        { organizationName: { contains: 'robot', mode: 'insensitive' } },
        { description: { contains: 'robot', mode: 'insensitive' } },
      ],
    });
  });
});

const row = (over: Partial<AnnouncementRow> = {}): AnnouncementRow => ({
  id: 'a1',
  topicIdentifier: 'HORIZON-CL4-2026-01',
  callIdentifier: 'HORIZON-CL4-2026',
  type: 'EXPERTISE_OFFER',
  description: 'We build robots. Mail jane@example.org or call +32 2 123 45 67.',
  publishedAt: new Date('2026-09-01T10:00:00Z'),
  lastSeenAt: new Date('2026-10-20T06:00:00Z'),
  organizationPic: '999999999',
  organizationName: 'Acme Robotics',
  organizationType: 'PRC',
  isSme: true,
  country: 'TR',
  city: 'Ankara',
  keywords: ['robotics', 3, 'ai'],
  programmeCodes: ['HE'],
  ...over,
});

describe('toAnnouncementDto', () => {
  it('masks contact details on the way out and keeps only string list items', () => {
    const dto = toAnnouncementDto(row());
    expect(dto.description).not.toContain('jane@example.org');
    expect(dto.description).not.toContain('123 45 67');
    expect(dto.description).toContain('[email]');
    expect(dto.keywords).toEqual(['robotics', 'ai']);
    expect(dto.organization).toEqual({
      pic: '999999999',
      name: 'Acme Robotics',
      type: 'PRC',
      isSme: true,
      country: 'TR',
      city: 'Ankara',
    });
    expect(dto.publishedAt).toBe('2026-09-01T10:00:00.000Z');
  });
});

describe('export attribution', () => {
  const dtos = [
    toAnnouncementDto(row()),
    toAnnouncementDto(row({ id: 'a2', lastSeenAt: new Date('2026-10-22T06:00:00Z'), description: '=HYPERLINK("x")' })),
  ];

  it('CSV opens with the source line, fetched at the latest lastSeenAt, and the CC BY 4.0 line', () => {
    const lines = toExportCsv(dtos).split('\r\n');
    expect(lines[0]).toContain('Source: EU Funding & Tenders Portal, fetched 2026-10-22T06:00:00.000Z');
    expect(lines[1]).toContain('CC BY 4.0');
    expect(lines[2]?.startsWith('id,topicIdentifier,')).toBe(true);
    expect(lines).toHaveLength(6); // 2 notes + header + 2 rows + trailing ''
  });

  it('CSV cells go through csvCell, so a summary cannot start a formula', () => {
    const csv = toExportCsv(dtos);
    expect(csv).toContain(`"'=HYPERLINK(""x"")"`);
    expect(csv).not.toContain('jane@example.org');
  });

  it('JSON carries the source object and the notice', () => {
    const json = toExportJson(dtos, new Date('2026-10-25T00:00:00Z'));
    expect(json.source).toMatchObject({
      name: 'EU Funding & Tenders Portal',
      fetchedAt: '2026-10-22T06:00:00.000Z',
      license: 'CC BY 4.0',
    });
    expect(json.source.notice).toMatch(/^Source: EU Funding & Tenders Portal, fetched 2026-10-22T06:00:00\.000Z\..*CC BY 4\.0/);
    expect(json.count).toBe(2);
    expect(json.truncated).toBe(false);
    expect(json.exportedAt).toBe('2026-10-25T00:00:00.000Z');
  });

  it('a cut export says so: `truncated` in JSON, a third `#` line in CSV', () => {
    expect(toExportJson(dtos, new Date(), true)).toMatchObject({ count: 2, truncated: true });
    const lines = toExportCsv(dtos, true).split('\r\n');
    expect(lines[2]).toBe('# Truncated: only the first 2 matching rows. Narrow the filters to export the rest.');
    expect(lines[3]?.startsWith('id,topicIdentifier,')).toBe(true);
    expect(lines).toHaveLength(7);
  });

  it('an empty export still carries the attribution', () => {
    expect(toExportCsv([]).split('\r\n')[0]).toContain('fetched n/a');
    expect(toExportJson([], new Date()).source.fetchedAt).toBeNull();
  });
});

describe('quota month', () => {
  it('keys on the UTC month and resets at the first instant of the next one', () => {
    const lastSecond = new Date('2026-12-31T23:59:59Z');
    expect(quotaMonth(lastSecond)).toBe('2026-12');
    expect(quotaResetsAt(lastSecond).toISOString()).toBe('2027-01-01T00:00:00.000Z');
    expect(quotaState(10, 12, lastSecond)).toMatchObject({ limit: 10, used: 12, remaining: 0, month: '2026-12' });
  });
});

describe('consumePartnerSearchQuery', () => {
  const txReturning = (rows: Array<{ count: number }>) => {
    const queryRaw = vi.fn(async (_strings: TemplateStringsArray, ..._values: unknown[]) => rows);
    return { tx: { $queryRaw: queryRaw } as unknown as TenantTx, queryRaw };
  };

  it('increments only below the limit, in one statement keyed on (tenantId, month)', async () => {
    const { tx, queryRaw } = txReturning([{ count: 3 }]);
    await expect(consumePartnerSearchQuery(tx, 'tenant-1', 10, new Date('2026-10-25T12:00:00Z'))).resolves.toEqual({
      ok: true,
      used: 3,
    });
    const [strings, ...values] = queryRaw.mock.calls[0] ?? [];
    const sql = (strings as TemplateStringsArray).join('?');
    expect(sql).toContain('ON CONFLICT ("tenantId", "month") DO UPDATE');
    expect(sql).toContain('WHERE "PartnerSearchQuotaUsage"."count" < ?');
    expect(values).toContain('tenant-1');
    expect(values).toContain('2026-10');
    expect(values).toContain(10);
  });

  it('refuses when the statement returns no row (the month is spent)', async () => {
    const { tx } = txReturning([]);
    await expect(consumePartnerSearchQuery(tx, 'tenant-1', 10, new Date())).resolves.toEqual({ ok: false, used: 10 });
  });
});
