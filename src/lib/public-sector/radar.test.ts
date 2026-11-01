import { describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/db', () => ({ prisma: {} }));

import { RECENTLY_CLOSED_DAYS, detectPublicBodySignal, selectPublicSectorCalls, type RadarTopicRow } from './radar';

const NOW = new Date('2026-09-29T10:00:00Z');
const DAY = 24 * 60 * 60 * 1000;

function row(identifier: string, over: Partial<RadarTopicRow> = {}): RadarTopicRow {
  return {
    identifier,
    title: `Topic ${identifier}`,
    status: 'OPEN',
    nextDeadlineAt: new Date(NOW.getTime() + 30 * DAY),
    deadlines: [{ stage: 1, at: '2026-10-29T15:00:00Z', tz: 'Europe/Brussels' }],
    eligibility: { restricted: null, countriesExcluded: [], eligibleCountries: [] },
    description: null,
    sourceUrl: null,
    ...over,
  };
}

const run = (rows: RadarTopicRow[], orgType: Parameters<typeof selectPublicSectorCalls>[1]['orgType'] = 'municipality') =>
  selectPublicSectorCalls(rows, { orgType, locale: 'tr', now: NOW });

describe('selectPublicSectorCalls', () => {
  it('keeps catalogue programmes and drops everything else', () => {
    const out = run([
      row('CERV-2026-CITIZENS-TOWN-TT'),
      row('HORIZON-NEB-2026-01-REGEN-01'),
      row('HORIZON-CL5-2026-01-D3-01'),
      row('EUROSTARS-2026-C1'),
    ]);
    expect(out.map((c) => c.identifier).sort()).toEqual([
      'CERV-2026-CITIZENS-TOWN-TT',
      'HORIZON-NEB-2026-01-REGEN-01',
    ]);
    expect(out.find((c) => c.identifier.startsWith('CERV'))!.programme.key).toBe('cerv-town-twinning');
  });

  it('carries the programme facts and Türkiye eligibility onto each call', () => {
    const [cerv] = run([row('CERV-2026-CITIZENS-TOWN-TT')]);
    expect(cerv!.programme.turkeyEligibility).toBe('not_eligible');
    expect(cerv!.programme.name).toMatch(/Kardeş Şehir/);
    expect(cerv!.deadlineTz).toBe('Europe/Brussels');
    expect(cerv!.sourceUrl).toContain('CERV-2026-CITIZENS-TOWN-TT');
  });

  it('drops calls restricted to EU/EEA/CH, by record or by text', () => {
    const out = run([
      row('HORIZON-NEB-2026-01-REGEN-01', { eligibility: { restricted: 'EU_EEA_CH_ONLY' } }),
      row('HORIZON-NEB-2026-01-REGEN-02', { description: 'Participation is limited to EU/EEA/CH only.' }),
      row('HORIZON-NEB-2026-01-REGEN-03', { eligibility: { countriesExcluded: ['TR'] } }),
      row('HORIZON-NEB-2026-01-BUSINESS-01'),
    ]);
    expect(out.map((c) => c.identifier)).toEqual(['HORIZON-NEB-2026-01-BUSINESS-01']);
  });

  it('marks recently closed calls and drops long-closed ones', () => {
    const out = run([
      row('LIFE-2026-SAP-ENV-GOV', { nextDeadlineAt: new Date(NOW.getTime() - 7 * DAY) }),
      row('LIFE-2023-SAP-ENV-GOV', { nextDeadlineAt: new Date(NOW.getTime() - (RECENTLY_CLOSED_DAYS + 1) * DAY) }),
      row('HORIZON-MISS-2027-04-CIT-01', { status: 'FORTHCOMING' }),
      row('HORIZON-NEB-2026-01-REGEN-01'),
      row('CERV-2026-CITIZENS-TOWN-NT', { status: 'CLOSED' }),
    ]);
    expect(out.map((c) => [c.identifier, c.phase])).toEqual([
      ['HORIZON-NEB-2026-01-REGEN-01', 'open'],
      ['HORIZON-MISS-2027-04-CIT-01', 'forthcoming'],
      ['LIFE-2026-SAP-ENV-GOV', 'recently_closed'],
    ]);
  });

  it('orders open calls by nearest deadline', () => {
    const out = run([
      row('HORIZON-NEB-2026-01-REGEN-01', { nextDeadlineAt: new Date(NOW.getTime() + 60 * DAY) }),
      row('HORIZON-NEB-2026-01-REGEN-02', { nextDeadlineAt: new Date(NOW.getTime() + 5 * DAY) }),
      row('HORIZON-NEB-2026-01-REGEN-03', { nextDeadlineAt: null }),
    ]);
    expect(out.map((c) => c.identifier)).toEqual([
      'HORIZON-NEB-2026-01-REGEN-02',
      'HORIZON-NEB-2026-01-REGEN-01',
      'HORIZON-NEB-2026-01-REGEN-03',
    ]);
  });

  it('filters by organisation type', () => {
    const rows = [row('CERV-2026-CITIZENS-TOWN-TT'), row('HORIZON-NEB-2026-01-REGEN-01')];
    expect(run(rows, 'union_of_municipalities').map((c) => c.identifier)).toEqual(['CERV-2026-CITIZENS-TOWN-TT']);
    expect(run(rows, 'development_agency')).toEqual([]);
  });

  it('Digital Europe needs a public-body signal and never shows cybersecurity', () => {
    const out = run([
      row('DIGITAL-2026-BESTUSE-10-EHDS', { description: 'Applicants: public authorities and hospitals.' }),
      row('DIGITAL-2026-AI-PILOTING-10-SCREENING', { description: 'Industry-led pilots.' }),
      row('DIGITAL-ECCC-2026-DEPLOY-CYBER-09', { description: 'Public authorities welcome.' }),
    ]);
    expect(out.map((c) => c.identifier)).toEqual(['DIGITAL-2026-BESTUSE-10-EHDS']);
  });
});

describe('detectPublicBodySignal', () => {
  it('recognises the usual SEDIA wording', () => {
    expect(detectPublicBodySignal('involving local authorities and citizens')).toBe(true);
    expect(detectPublicBodySignal('Municipalities must participate')).toBe(true);
    expect(detectPublicBodySignal('public bodies are eligible')).toBe(true);
    expect(detectPublicBodySignal('SMEs and research organisations')).toBe(false);
  });
});
