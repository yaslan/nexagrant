import { describe, expect, test, vi } from 'vitest';

import type { LeadIntakePort } from '@/core/contracts/lead-intake';
import { LEAD_INTAKE_CONSENT_DOCUMENT_ID } from '@/core/contracts/lead-intake';
import { buildIntakeRequest, type PublicLeadForIntake } from './public-lead-intake';

const T0 = new Date('2026-11-14T10:00:00Z');
const lead = (over: Partial<PublicLeadForIntake> = {}): PublicLeadForIntake => ({
  id: 'pl_1',
  name: 'Ayşe Yılmaz',
  email: 'ayse@example.test',
  organisation: 'İlkadım Belediyesi',
  province: 'Samsun',
  district: 'İlkadım',
  readinessCode: 'municipality.012012012012012',
  transferConsent: true,
  transferConsentVersion: 'v-test',
  transferConsentAt: T0,
  transferConsentTenantId: 't_1',
  locale: 'tr',
  createdAt: T0,
  ...over,
});

describe('buildIntakeRequest — transfer-consent gate', () => {
  test('open gate builds a request carrying the separate consent document, readiness recomputed', () => {
    const r = buildIntakeRequest(lead(), 't_1');
    expect(r).not.toBeNull();
    expect(r!.consent).toMatchObject({ documentId: LEAD_INTAKE_CONSENT_DOCUMENT_ID, documentVersion: 'v-test' });
    expect(r!.targetTenantId).toBe('t_1');
    expect(r!.readiness?.code).toBe('municipality.012012012012012');
    expect(Number.isInteger(r!.readiness?.total)).toBe(true);
  });

  test.each([
    ['flag false', { transferConsent: false }],
    ['no version', { transferConsentVersion: null }],
    ['blank version', { transferConsentVersion: '' }],
    ['no time', { transferConsentAt: null }],
  ])('shut gate (%s) builds nothing', (_n, over) => {
    expect(buildIntakeRequest(lead(over), 't_1')).toBeNull();
  });

  test('NG-204: a target other than the consented recipient builds nothing', () => {
    expect(buildIntakeRequest(lead(), 't_2')).toBeNull();
  });

  test('NG-204: a lead with no recorded recipient builds nothing for any target', () => {
    expect(buildIntakeRequest(lead({ transferConsentTenantId: null }), 't_1')).toBeNull();
  });

  test('a malformed readiness code is dropped, the lead still forwards', () => {
    expect(buildIntakeRequest(lead({ readinessCode: 'garbage' }), 't_1')?.readiness).toBeNull();
  });

  test('the port is never needed to answer a shut gate', () => {
    const port: LeadIntakePort = { accept: vi.fn() };
    expect(buildIntakeRequest(lead({ transferConsent: false }), 't_1')).toBeNull();
    expect(port.accept).not.toHaveBeenCalled();
  });
});
