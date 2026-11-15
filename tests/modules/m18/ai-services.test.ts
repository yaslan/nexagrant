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
  describeCall,
  draftEligibilityReport,
  releasableReport,
} from '@/modules/m18/server/eligibility';
import { formatDealBriefContext } from '@/core/contracts/deal-brief-context';

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
  it('site not readable → no model call (no credit used)', async () => {
    const generate = vi.fn();
    const res = await proposeEnrichment(
      { tenantId: 't1', userId: 'u1', org, locale: 'tr' },
      { fetchSite: async () => ({ ok: false, reason: 'robots_disallow' }), generate },
    );
    expect(res).toEqual({ ok: false, code: 'SITE_UNAVAILABLE', reason: 'robots_disallow' });
    expect(generate).not.toHaveBeenCalled();
  });
  it('calls llm.ts as M18:enrich-organization, the page text only in the data fence', async () => {
    const generate = vi.fn(async (_opts: unknown) => completion('{"legalName":"Acme Teknoloji A.Ş.","sources":["https://acme.com.tr/"]}'));
    const res = await proposeEnrichment({ tenantId: 't1', userId: 'u1', org, locale: 'en' }, { fetchSite: async () => PAGES, generate });
    expect(res.ok).toBe(true);
    const opts = generate.mock.calls[0]![0] as { module: string; purpose: string; tenantId: string; system: string; prompt: string };
    expect(opts).toMatchObject({ module: 'M18', purpose: 'enrich-organization', tenantId: 't1' });
    expect(opts.system).not.toContain('Acme Teknoloji');
    expect(opts.prompt).toContain('<user_data field="pages">');
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
  it('calls llm.ts as M18:eligibility-pre-report and keeps the model name', async () => {
    const generate = vi.fn(async (_opts: unknown) => completion('### Özet\nBelirsiz.'));
    const draft = await draftEligibilityReport({ tenantId: 't1', userId: 'u1', subject, locale: 'tr' }, { generate });
    expect(generate.mock.calls[0]![0]).toMatchObject({ module: 'M18', purpose: 'eligibility-pre-report' });
    expect(draft).toEqual({ content: '### Özet\nBelirsiz.', model: 'stub-model', credits: 1 });
  });
  it('approval moves DRAFT → APPROVED only, with the approver', async () => {
    const updateMany = vi.fn(async () => ({ count: 1 }));
    const t = { leadEligibilityReport: { updateMany } } as unknown as TenantTx;
    expect(await approveEligibilityReport(t, 't1', 'r1', 'u9')).toBe(true);
    const arg = (updateMany.mock.calls[0] as unknown as [{ where: unknown; data: { status: string; approvedByUserId: string } }])[0];
    expect(arg.where).toEqual({ id: 'r1', tenantId: 't1', deletedAt: null, status: 'DRAFT' });
    expect(arg.data).toMatchObject({ status: 'APPROVED', approvedByUserId: 'u9' });
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
