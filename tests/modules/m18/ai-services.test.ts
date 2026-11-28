import { describe, expect, it, vi } from 'vitest';
import type { TenantTx } from '@/lib/db';
import type { LlmCompletion } from '@/lib/llm';
import {
  applyEnrichment,
  parseEnrichmentAnswer,
  proposeEnrichment,
  type EnrichmentSubject,
} from '@/modules/m18/server/enrichment';
import {
  approveEligibilityReport,
  createEligibilityReport,
  describeCall,
  releasableReport,
} from '@/modules/m18/server/eligibility';
import { formatDealBriefContext } from '@/core/contracts/deal-brief-context';
import { loadDealBriefContext } from '@/modules/m18/server/deal-brief-context';

/**
 * NG-136 (M18-F5) — enrichment and eligibility services. The model boundary (`generate`) is a stub:
 * no provider is ever called (patron kuralı, 15.11.2026). The live test
 * (tests/m18-ai.live.test.ts) proves the real llm.ts path writes AiUsageLog and debits credit.
 */

const org: EnrichmentSubject = {
  id: 'org-1',
  name: 'Acme',
  legalName: null,
  district: null,
  provinceCode: '06',
  website: 'https://acme.com.tr',
  sizeBand: null,
  themes: [],
  sectorCodes: [],
};

function completion(text: string): LlmCompletion {
  return { text, inputTokens: 10, outputTokens: 10, credits: 1, provider: 'anthropic', model: 'stub-model', stopReason: 'end_turn' };
}

/** The credit boundary stubbed: the balance check passes, reserve hands out a refId, release records what was given back. */
function creditStub(credits = 1) {
  const precheck = vi.fn(async (_tenantId: string, _purpose: string) => {});
  const reserve = vi.fn(async (_tenantId: string, purpose: string) => ({ refId: `ref:${purpose}`, credits }));
  const release = vi.fn(async (_tenantId: string, _refId: string) => {});
  return { precheck, reserve, release };
}

const PAGES = { ok: true as const, pages: [{ url: 'https://acme.com.tr/', text: 'Acme Teknoloji A.Ş.' }], skipped: [] };

describe('parseEnrichmentAnswer', () => {
  it('normalises each field on its own and keeps only fetched sources', () => {
    const p = parseEnrichmentAnswer(
      'Here: {"legalName":" Acme  Teknoloji A.Ş. ","district":"Çankaya","sizeBand":"small","themes":["IoT","IoT",3],"sectorCodes":["c26.1","BAD"],"sources":["https://acme.com.tr/","https://evil.example/"],"extra":"x"}',
      ['https://acme.com.tr/'],
    );
    expect(p).toEqual({
      legalName: 'Acme Teknoloji A.Ş.',
      district: 'Çankaya',
      sizeBand: 'SMALL',
      themes: ['IoT'],
      sectorCodes: ['C26.1'],
      sources: ['https://acme.com.tr/'],
    });
  });
  it('a bad sizeBand or a missing key becomes null / empty, not an error', () => {
    expect(parseEnrichmentAnswer('{"sizeBand":"HUGE"}', [])).toEqual({
      legalName: null,
      district: null,
      sizeBand: null,
      themes: [],
      sectorCodes: [],
      sources: [],
    });
  });
  it('no JSON object → null', () => {
    expect(parseEnrichmentAnswer('sorry', [])).toBeNull();
    expect(parseEnrichmentAnswer('[1,2]', [])).toBeNull();
  });
});

describe('proposeEnrichment', () => {
  it('no website → no fetch, no model call', async () => {
    const fetchSite = vi.fn();
    const generate = vi.fn();
    const res = await proposeEnrichment({ tenantId: 't1', userId: 'u1', org: { ...org, website: null }, locale: 'tr' }, { fetchSite, generate });
    expect(res).toEqual({ ok: false, code: 'NO_WEBSITE' });
    expect(fetchSite).not.toHaveBeenCalled();
    expect(generate).not.toHaveBeenCalled();
  });
  it('site not readable → no reservation, no model call (no credit used)', async () => {
    const generate = vi.fn();
    const credits = creditStub();
    const res = await proposeEnrichment(
      { tenantId: 't1', userId: 'u1', org, locale: 'tr' },
      { fetchSite: async () => ({ ok: false, reason: 'robots_disallow' }), generate, credits },
    );
    expect(res).toEqual({ ok: false, code: 'SITE_UNAVAILABLE', reason: 'robots_disallow' });
    expect(generate).not.toHaveBeenCalled();
    expect(credits.reserve).not.toHaveBeenCalled();
  });
  it('reserves M18:enrich-organization, then calls llm.ts as the free attempt; the page text only in the data fence', async () => {
    const generate = vi.fn(async (_opts: unknown) => completion('{"legalName":"Acme Teknoloji A.Ş.","sources":["https://acme.com.tr/"]}'));
    const credits = creditStub(1);
    const res = await proposeEnrichment({ tenantId: 't1', userId: 'u1', org, locale: 'en' }, { fetchSite: async () => PAGES, generate, credits });
    expect(res).toMatchObject({ ok: true, credits: 1 });
    expect(credits.reserve).toHaveBeenCalledWith('t1', 'enrich-organization');
    expect(credits.reserve.mock.invocationCallOrder[0]!).toBeLessThan(generate.mock.invocationCallOrder[0]!);
    expect(credits.release).not.toHaveBeenCalled();
    const opts = generate.mock.calls[0]![0] as { module: string; purpose: string; tenantId: string; system: string; prompt: string };
    expect(opts).toMatchObject({ module: 'M18', purpose: 'enrich-organization-attempt', tenantId: 't1', creditsReserved: true, reservationRefId: 'ref:enrich-organization' });
    expect(opts.system).not.toContain('Acme Teknoloji');
    expect(opts.prompt).toContain('<user_data field="pages">');
  });
  it('an answer with no JSON is BAD_ANSWER and gives the reservation back', async () => {
    const generate = vi.fn(async (_opts: unknown) => completion('sorry'));
    const credits = creditStub();
    const res = await proposeEnrichment({ tenantId: 't1', userId: 'u1', org, locale: 'tr' }, { fetchSite: async () => PAGES, generate, credits });
    expect(res).toEqual({ ok: false, code: 'BAD_ANSWER' });
    expect(credits.release).toHaveBeenCalledWith('t1', 'ref:enrich-organization');
  });
  it('a failed model call rethrows and gives the reservation back', async () => {
    const generate = vi.fn(async () => {
      throw new Error('provider down');
    });
    const credits = creditStub();
    await expect(
      proposeEnrichment({ tenantId: 't1', userId: 'u1', org, locale: 'tr' }, { fetchSite: async () => PAGES, generate, credits }),
    ).rejects.toThrow(/provider down/);
    expect(credits.release).toHaveBeenCalledTimes(1);
  });
  it('NG-202 B2: a balance below the price is refused before the site is read (no fetch, no reservation)', async () => {
    const fetchSite = vi.fn(async () => PAGES);
    const generate = vi.fn(async (_opts: unknown) => completion('{}'));
    const precheck = vi.fn(async (_tenantId: string, _purpose: string) => {
      throw new Error('Insufficient AI credits. Please purchase more credits or upgrade your plan.');
    });
    const credits = { ...creditStub(), precheck };
    await expect(
      proposeEnrichment({ tenantId: 't1', userId: 'u1', org, locale: 'tr' }, { fetchSite, generate, credits }),
    ).rejects.toThrow(/Insufficient AI credits/);
    expect(precheck).toHaveBeenCalledWith('t1', 'enrich-organization');
    expect(fetchSite).not.toHaveBeenCalled();
    expect(credits.reserve).not.toHaveBeenCalled();
    expect(generate).not.toHaveBeenCalled();
  });
  it('NG-202 B2: the balance check runs before the site read, the reservation after it', async () => {
    const fetchSite = vi.fn(async () => PAGES);
    const generate = vi.fn(async (_opts: unknown) => completion('{"legalName":"Acme"}'));
    const precheck = vi.fn(async (_tenantId: string, _purpose: string) => {});
    const credits = { ...creditStub(), precheck };
    await expect(proposeEnrichment({ tenantId: 't1', userId: 'u1', org, locale: 'tr' }, { fetchSite, generate, credits })).resolves.toMatchObject({ ok: true });
    expect(precheck.mock.invocationCallOrder[0]!).toBeLessThan(fetchSite.mock.invocationCallOrder[0]!);
    expect(fetchSite.mock.invocationCallOrder[0]!).toBeLessThan(credits.reserve.mock.invocationCallOrder[0]!);
  });
  it('refused credits → no model call', async () => {
    const generate = vi.fn();
    const reserve = vi.fn(async () => {
      throw new Error('Insufficient AI credits. Please purchase more credits or upgrade your plan.');
    });
    await expect(
      proposeEnrichment({ tenantId: 't1', userId: 'u1', org, locale: 'tr' }, { fetchSite: async () => PAGES, generate, credits: { precheck: async () => {}, reserve } }),
    ).rejects.toThrow(/Insufficient AI credits/);
    expect(generate).not.toHaveBeenCalled();
  });
});

describe('applyEnrichment', () => {
  function tx(count = 1) {
    const updateMany = vi.fn(async () => ({ count }));
    return { tx: { leadOrganization: { updateMany } } as unknown as TenantTx, updateMany };
  }
  it('writes only the ticked fields, tenant-bound', async () => {
    const { tx: t, updateMany } = tx();
    expect(await applyEnrichment(t, 't1', { organizationId: 'org-1', district: 'Çankaya', sectorCodes: ['c26.1'] })).toBe(true);
    expect(updateMany).toHaveBeenCalledWith({
      where: { id: 'org-1', tenantId: 't1', deletedAt: null },
      data: { district: 'Çankaya', sectorCodes: ['C26.1'] },
    });
  });
  it('refuses unknown fields and an empty selection', async () => {
    const { tx: t, updateMany } = tx();
    await expect(applyEnrichment(t, 't1', { organizationId: 'org-1', lifecycle: 'CLIENT' })).rejects.toThrow();
    await expect(applyEnrichment(t, 't1', { organizationId: 'org-1' })).rejects.toThrow();
    expect(updateMany).not.toHaveBeenCalled();
  });
});

describe('eligibility pre-report', () => {
  const subject = {
    org: { ...org, orgType: 'SME', nuts2: null },
    call: {
      id: 'call-1',
      title: 'Digital SMEs',
      callIdentifier: 'DIGITAL-2026-SME-01',
      programme: 'Digital Europe',
      eligibleApplicantTypes: [],
      eligibleRegions: [],
      cofinancingRateBp: null,
      topics: [],
    },
  };
  it('an empty rule is "not recorded", never "no restriction"', () => {
    const text = describeCall(subject.call);
    expect(text).toContain('eligibleApplicantTypes: not recorded');
    expect(text).toContain('cofinancingRate: not recorded');
  });
  it('reserves M18:eligibility-pre-report, calls the free attempt and saves the DRAFT with the model name', async () => {
    const generate = vi.fn(async (_opts: unknown) => completion('### Özet\nBelirsiz.'));
    const credits = creditStub(2);
    const save = vi.fn(async (_input: unknown) => ({ id: 'r1' }));
    const saved = await createEligibilityReport({ tenantId: 't1', userId: 'u1', subject, locale: 'tr' }, { generate, credits, save });
    expect(credits.reserve).toHaveBeenCalledWith('t1', 'eligibility-pre-report');
    expect(generate.mock.calls[0]![0]).toMatchObject({ module: 'M18', purpose: 'eligibility-pre-report-attempt', creditsReserved: true, reservationRefId: 'ref:eligibility-pre-report' });
    expect(save).toHaveBeenCalledWith({
      organizationId: 'org-1',
      callId: 'call-1',
      userId: 'u1',
      locale: 'tr',
      draft: { content: '### Özet\nBelirsiz.', model: 'stub-model' },
    });
    expect(saved).toEqual({ id: 'r1', credits: 2 });
    expect(credits.release).not.toHaveBeenCalled();
  });
  it('a DRAFT that cannot be saved gives the reservation back', async () => {
    const credits = creditStub(2);
    await expect(
      createEligibilityReport(
        { tenantId: 't1', userId: 'u1', subject, locale: 'tr' },
        {
          generate: async () => completion('x'),
          credits,
          save: async () => {
            throw new Error('write failed');
          },
        },
      ),
    ).rejects.toThrow(/write failed/);
    expect(credits.release).toHaveBeenCalledWith('t1', 'ref:eligibility-pre-report');
  });
  it('approval moves DRAFT → APPROVED only, with the approver', async () => {
    const updateMany = vi.fn(async () => ({ count: 1 }));
    const t = { leadEligibilityReport: { updateMany } } as unknown as TenantTx;
    expect(await approveEligibilityReport(t, 't1', 'r1', 'u9')).toBe(true);
    const arg = (updateMany.mock.calls[0] as unknown as [{ where: unknown; data: { status: string; approvedByUserId: string } }])[0];
    expect(arg.where).toEqual({ id: 'r1', tenantId: 't1', deletedAt: null, status: 'DRAFT' });
    expect(arg.data).toMatchObject({ status: 'APPROVED', approvedByUserId: 'u9' });
  });
  it('an empty model answer is not a report: it throws, no DRAFT is saved, the reservation is given back', async () => {
    const generate = vi.fn(async (_opts: unknown) => completion('   \n  '));
    const credits = creditStub(2);
    const save = vi.fn();
    await expect(createEligibilityReport({ tenantId: 't1', userId: 'u1', subject, locale: 'tr' }, { generate, credits, save })).rejects.toThrow(
      /empty eligibility pre-report/,
    );
    expect(save).not.toHaveBeenCalled();
    expect(credits.release).toHaveBeenCalledWith('t1', 'ref:eligibility-pre-report');
  });
  it('no call → no releasable report, and the table is not even read (NG-136 review)', async () => {
    const findFirst = vi.fn(async () => ({ id: 'r-other-call', callId: 'call-9', content: 'x', approvedAt: new Date() }));
    const t = { leadEligibilityReport: { findFirst } } as unknown as TenantTx;
    expect(await releasableReport(t, 't1', 'org-1', null)).toBeNull();
    expect(await releasableReport(t, 't1', 'org-1', '')).toBeNull();
    expect(findFirst).not.toHaveBeenCalled();
  });
  it('only an APPROVED report is releasable', async () => {
    const findFirst = vi.fn(async () => null);
    const t = { leadEligibilityReport: { findFirst } } as unknown as TenantTx;
    await releasableReport(t, 't1', 'org-1', 'call-1');
    const arg = (findFirst.mock.calls[0] as unknown as [{ where: Record<string, unknown> }])[0];
    expect(arg.where).toMatchObject({ tenantId: 't1', organizationId: 'org-1', status: 'APPROVED', callId: 'call-1', deletedAt: null });
  });
});

describe('deal brief context contract', () => {
  function dealTx(callId: string | null) {
    const findFirst = vi.fn(async () => ({ id: 'r1', callId: 'call-1', content: 'approved text', approvedAt: new Date('2026-11-10T09:00:00Z') }));
    const tx = {
      deal: {
        findFirst: vi.fn(async () => ({
          title: 'Deal',
          stage: 'PROPOSAL',
          callId,
          organizationId: 'org-1',
          organization: { name: 'Acme', orgType: 'SME', provinceCode: '06', sizeBand: null, themes: [], deletedAt: null },
          call: callId ? { callIdentifier: 'DIGITAL-2026-SME-01', title: 'Digital SMEs' } : null,
        })),
      },
      leadEligibilityReport: { findFirst },
    } as unknown as TenantTx;
    return { tx, findFirst };
  }
  it('a deal without a call gets no approved pre-assessment (not one of another call)', async () => {
    const { tx, findFirst } = dealTx(null);
    const ctx = await loadDealBriefContext(tx, 't1', 'deal-1');
    expect(ctx?.approvedEligibility).toBeNull();
    expect(findFirst).not.toHaveBeenCalled();
  });
  it('a deal with a call gets only that call\'s approved report', async () => {
    const { tx, findFirst } = dealTx('call-1');
    const ctx = await loadDealBriefContext(tx, 't1', 'deal-1');
    expect(ctx?.approvedEligibility?.summary).toBe('approved text');
    const arg = (findFirst.mock.calls[0] as unknown as [{ where: Record<string, unknown> }])[0];
    expect(arg.where).toMatchObject({ callId: 'call-1', status: 'APPROVED', tenantId: 't1', organizationId: 'org-1' });
  });
  it('formats organisation and deal facts, labels the pre-assessment, carries no contact data', () => {
    const text = formatDealBriefContext({
      dealTitle: 'Digital SMEs application',
      dealStage: 'PROPOSAL',
      organization: { name: 'Acme', orgType: 'SME', provinceCode: '06', sizeBand: 'SMALL', themes: ['IoT'] },
      call: { callIdentifier: 'DIGITAL-2026-SME-01', title: 'Digital SMEs' },
      approvedEligibility: { approvedAt: new Date('2026-11-10T09:00:00Z'), summary: 'x'.repeat(5000) },
    });
    expect(text).toContain('client organisation: Acme');
    expect(text).toContain('internal eligibility pre-assessment (approved 2026-11-10; not an official evaluation)');
    expect(text).not.toMatch(/@|phone|e-mail/i);
    expect(text.length).toBeLessThan(2_000);
  });
});
