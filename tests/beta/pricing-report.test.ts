import { describe, it, expect } from 'vitest';
import { buildReportData, parsePricingResponses } from '@/lib/beta/pricing-analysis';
import { renderPricingReport } from '@/lib/beta/pricing-report';
import { responseCsvHeader } from '@/lib/beta/pricing-survey';
import { TRANSITION_TIERS } from '@/lib/beta/pricing-transition';

const HEADER = responseCsvHeader();

function row(id: string, overrides: Record<string, string | number> = {}): string {
  const base: Record<string, string | number> = {
    respondentId: id,
    slug: 'acme',
    country: 'TR',
    orgType: 'SME',
    locale: 'tr',
    submittedAt: '2026-10-20',
    segment: 'sme',
    teamSize: 4,
    proposalsPerYear: 5,
    currentSpendEur: 500,
    vwTooCheap: 50,
    vwCheap: 150,
    vwExpensive: 300,
    vwTooExpensive: 500,
    gg149: 'yes',
    gg199: 'yes',
    gg249: 'no',
    gg299: 'no',
    gg349: 'no',
    planChoice: 'team',
    seatsNeeded: 5,
    workspacesNeeded: 1,
    addons: 'addon_m6',
    creditsEnough: 'no',
    billingCycle: 'monthly',
    currencyPref: 'EUR',
    needsEInvoice: 'yes',
    successFee: 'conditional',
    convertDiscountPct: 30,
    payLikelihood: 8,
    comment: '',
    ...overrides,
  };
  return HEADER.split(',')
    .map((column) => String(base[column] ?? ''))
    .join(',');
}

const ctx = {
  generatedAt: '2026-09-06 00:00:00Z',
  sourcePath: 'docs/BETA_DATA/x.csv',
  invited: 10,
  anchorPlanId: 'team',
};

function report(banner: string, ids = ['A', 'B']): string {
  const csv = [banner, HEADER, ...ids.map((id) => row(id))].filter(Boolean).join('\n');
  return renderPricingReport(buildReportData(parsePricingResponses(csv)), ctx);
}

describe('renderPricingReport', () => {
  it('shouts when the dataset is a fixture', () => {
    const md = report('# STATUS: FIXTURE not real');
    expect(md).toContain('GERÇEK ORTAK YANITI DEĞİLDİR');
    expect(md).toContain('Bu sayılara dayanarak fiyat kararı alınmaz');
  });

  it('drops the warning once the dataset declares itself real', () => {
    const md = report('# STATUS: REAL');
    expect(md).not.toContain('GERÇEK ORTAK YANITI DEĞİLDİR');
    expect(md).toContain('Veri: gerçek beta yanıtları');
  });

  it('asks for a declaration when the CSV carries none', () => {
    expect(report('')).toContain('beyan edilmemiş');
  });

  it('flags a sample below the ≥8 acceptance criterion', () => {
    expect(report('# STATUS: REAL')).toContain('Kabul kriteri ≥8 yanıt');
    expect(report('# STATUS: REAL', ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H'])).not.toContain('Kabul kriteri ≥8');
  });

  it('renders the transition policy from the constants, not from prose', () => {
    const md = report('# STATUS: REAL');
    for (const tier of TRANSITION_TIERS) {
      expect(md).toContain(`\`${tier.tier}\``);
      expect(md).toContain(`**%${tier.discountPct}**`);
    }
    // The worked example is computed, so the founding monthly figure must appear.
    expect(md).toContain('€149');
  });

  it('lists every rejected row with its reason', () => {
    const csv = [
      '# STATUS: REAL',
      HEADER,
      row('A'),
      row('B', { vwCheap: 900 }),
    ].join('\n');
    const md = renderPricingReport(buildReportData(parsePricingResponses(csv)), ctx);
    expect(md).toContain('Reddedilen satır: **1**');
    expect(md).toMatch(/\| 2 \| B \| Van Westendorp/);
  });
});
