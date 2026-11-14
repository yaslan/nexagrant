import { describe, expect, it } from 'vitest';

import {
  CAPACITY_POINTS,
  SOFT_POINTS,
  matchOrganizationToCall,
  type MatchCall,
  type MatchOrganization,
} from '@/modules/m18/server/matching';

const now = new Date('2026-11-13T12:00:00Z');

const org = (over: Partial<MatchOrganization> = {}): MatchOrganization => ({
  orgType: 'cooperative',
  provinceCode: '06',
  nuts2: 'TR51',
  sectorCodes: ['tarım'],
  themes: ['enerji', 'su'],
  sizeBand: 'small',
  lifecycle: 'qualified',
  deletedAt: null,
  ...over,
});

const call = (over: Partial<MatchCall> = {}): MatchCall => ({
  eligibleApplicantTypes: ['NGO'],
  eligibleRegions: ['06'],
  complexity: 'MEDIUM',
  keywords: ['Tarım', 'enerji', 'su'],
  deadlineAt: new Date('2027-02-01T15:00:00Z'),
  ...over,
});

const points = (result: ReturnType<typeof matchOrganizationToCall>) =>
  Object.fromEntries(result.reasons.map((r) => [r.code, r.points]));

describe('M18 matching — rule table', () => {
  it('soft maxima add up to 100', () => {
    const { applicantType, region, topic, capacity } = SOFT_POINTS;
    expect(applicantType.max + region.max + topic.max + capacity.max).toBe(100);
    for (const row of Object.values(CAPACITY_POINTS)) {
      for (const p of Object.values(row)) expect(p).toBeLessThanOrEqual(capacity.max);
    }
  });
});

describe('M18 matching — hard rules', () => {
  it('a perfect fit scores 100 with no hard fail', () => {
    const r = matchOrganizationToCall(org(), call(), now);
    expect(r).toMatchObject({ hardFail: false, hardFailReasons: [], fitScore: 100 });
  });

  it('closed call, wrong applicant type, wrong region and a disqualified org all hard-fail, together', () => {
    const r = matchOrganizationToCall(
      org({ lifecycle: 'disqualified', orgType: 'sme', provinceCode: '34', nuts2: 'TR10' }),
      call({ deadlineAt: new Date('2026-11-01T00:00:00Z') }),
      now
    );
    expect(r.hardFail).toBe(true);
    expect(r.fitScore).toBe(0);
    expect(r.hardFailReasons).toEqual(['ORG_DISQUALIFIED', 'CALL_CLOSED', 'APPLICANT_TYPE', 'REGION']);
  });

  it('a deleted org hard-fails', () => {
    expect(matchOrganizationToCall(org({ deletedAt: now }), call(), now).hardFailReasons).toEqual(['ORG_DISQUALIFIED']);
  });

  it('a call with no deadline is not closed', () => {
    expect(matchOrganizationToCall(org(), call({ deadlineAt: null }), now).hardFail).toBe(false);
  });

  it('accepts the finer HibeLead code in eligibleApplicantTypes', () => {
    const r = matchOrganizationToCall(org(), call({ eligibleApplicantTypes: ['Cooperative'] }), now);
    expect(points(r).APPLICANT_TYPE_MATCH).toBe(30);
  });
});

describe('M18 matching — soft rules', () => {
  it('unrestricted calls give half points for type and region', () => {
    const r = matchOrganizationToCall(org(), call({ eligibleApplicantTypes: [], eligibleRegions: [] }), now);
    expect(points(r)).toMatchObject({ APPLICANT_TYPE_UNRESTRICTED: 15, REGION_UNRESTRICTED: 10 });
    expect(r.fitScore).toBe(15 + 10 + 30 + 20);
  });

  it('unknown org type or location scores 0 for that rule but is not a hard fail', () => {
    const r = matchOrganizationToCall(org({ orgType: null, provinceCode: null, nuts2: '  ' }), call(), now);
    expect(r.hardFail).toBe(false);
    expect(points(r)).toMatchObject({ APPLICANT_TYPE_UNKNOWN: 0, REGION_UNKNOWN: 0 });
  });

  it('regions match by NUTS prefix', () => {
    expect(points(matchOrganizationToCall(org({ provinceCode: null }), call({ eligibleRegions: ['TR5'] }), now)).REGION_MATCH).toBe(20);
    expect(matchOrganizationToCall(org({ provinceCode: null }), call({ eligibleRegions: ['TR6'] }), now).hardFailReasons).toEqual(['REGION']);
    expect(matchOrganizationToCall(org({ provinceCode: null }), call({ eligibleRegions: ['35'] }), now).hardFailReasons).toEqual(['REGION']);
    expect(matchOrganizationToCall(org({ nuts2: null }), call({ eligibleRegions: ['TR51'] }), now).hardFailReasons).toEqual(['REGION']);
  });

  it('topic overlap scales to the keywords needed for full points', () => {
    const p = (orgTerms: string[], keywords: string[]) =>
      points(matchOrganizationToCall(org({ sectorCodes: orgTerms, themes: [] }), call({ keywords }), now));
    expect(p(['tarım'], ['tarım', 'enerji', 'su', 'iklim'])).toMatchObject({ TOPIC_OVERLAP: 10 });
    expect(p(['tarım', 'su'], ['tarım', 'enerji', 'su'])).toMatchObject({ TOPIC_OVERLAP: 20 });
    expect(p(['TARIM'], ['tarım'])).toMatchObject({ TOPIC_OVERLAP: 30 });
    expect(p(['x'], ['tarım'])).toMatchObject({ TOPIC_OVERLAP: 0 });
    expect(p([], ['tarım'])).toMatchObject({ TOPIC_UNKNOWN: 0 });
    expect(p(['tarım'], [' '])).toMatchObject({ TOPIC_UNKNOWN: 0 });
  });

  it('capacity reads the complexity × size table; unknown is half', () => {
    const cap = (sizeBand: string | null, complexity: string | null) =>
      points(matchOrganizationToCall(org({ sizeBand }), call({ complexity }), now));
    expect(cap('micro', 'HIGH')).toMatchObject({ CAPACITY: 5 });
    expect(cap('Large', 'high')).toMatchObject({ CAPACITY: 20 });
    expect(cap(null, 'HIGH')).toMatchObject({ CAPACITY_UNKNOWN: 10 });
    expect(cap('small', null)).toMatchObject({ CAPACITY_UNKNOWN: 10 });
    expect(cap('giant', 'LOW')).toMatchObject({ CAPACITY_UNKNOWN: 10 });
  });
});
