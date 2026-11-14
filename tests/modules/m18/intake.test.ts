import { describe, expect, test } from 'vitest';

import {
  LEAD_INTAKE_CONSENT_DOCUMENT_ID,
  leadIntakeSourceRef,
  type LeadIntakeConsent,
  type LeadIntakeRequest,
} from '@/core/contracts/lead-intake';
import { checkIntakeConsent, isIntakeTenant, parseIntakeRequest } from '@/modules/m18/server/intake';

const consent = (over: Partial<LeadIntakeConsent> = {}): LeadIntakeConsent => ({
  documentId: LEAD_INTAKE_CONSENT_DOCUMENT_ID,
  documentVersion: '2026-11-14.1',
  grantedAt: new Date('2026-11-14T10:00:00Z'),
  locale: 'tr',
  ...over,
});

const request = (over: Partial<LeadIntakeRequest> = {}): LeadIntakeRequest => ({
  publicLeadId: 'pl_1',
  targetTenantId: 't_1',
  contact: { fullName: 'Ayşe Yılmaz', email: 'Ayse@Example.test' },
  organisation: { name: 'İlkadım Belediyesi', province: 'Samsun', district: 'İlkadım' },
  readiness: { code: 'MUNICIPALITY.111', total: 62, level: 'ready' },
  consent: consent(),
  receivedAt: new Date('2026-11-14T10:00:00Z'),
  ...over,
});

describe('isIntakeTenant', () => {
  test('CONSULTANCY and AGENCY tenants only', () => {
    expect(isIntakeTenant({ orgType: 'CONSULTANCY', kind: 'ORGANIZATION', deletedAt: null })).toBe(true);
    expect(isIntakeTenant({ orgType: 'SME', kind: 'AGENCY', deletedAt: null })).toBe(true);
    for (const orgType of ['SME', 'LARGE', 'UNIVERSITY', 'RESEARCH', 'PUBLIC', 'NGO', 'CLUSTER', 'MUNICIPALITY']) {
      expect(isIntakeTenant({ orgType, kind: 'ORGANIZATION', deletedAt: null })).toBe(false);
    }
  });
  test('a deleted tenant receives nothing', () => {
    expect(isIntakeTenant({ orgType: 'CONSULTANCY', kind: 'AGENCY', deletedAt: new Date() })).toBe(false);
  });
});

describe('checkIntakeConsent', () => {
  test('no consent, no transfer', () => {
    expect(checkIntakeConsent(null)).toBe('consent_missing');
  });
  test('the readiness form consent is not a transfer consent', () => {
    expect(checkIntakeConsent(consent({ documentId: 'public-lead-contact' }))).toBe('consent_wrong_document');
  });
  test('a withdrawn consent transfers nothing', () => {
    expect(checkIntakeConsent(consent({ withdrawnAt: new Date() }))).toBe('consent_withdrawn');
  });
  test('blank version or invalid date is no consent', () => {
    expect(checkIntakeConsent(consent({ documentVersion: '  ' }))).toBe('consent_missing');
    expect(checkIntakeConsent(consent({ grantedAt: new Date('nope') }))).toBe('consent_missing');
  });
  test('a granted, current consent passes', () => {
    expect(checkIntakeConsent(consent())).toBeNull();
  });
});

describe('parseIntakeRequest', () => {
  test('normalises the e-mail and accepts a well-formed request', () => {
    expect(parseIntakeRequest(request())?.contact.email).toBe('ayse@example.test');
  });
  test('rejects an unknown province, a bad e-mail and an out-of-range score', () => {
    expect(parseIntakeRequest(request({ organisation: { name: 'X Org', province: 'Atlantis', district: null } }))).toBeNull();
    expect(parseIntakeRequest(request({ contact: { fullName: 'Ayşe Yılmaz', email: 'nope' } }))).toBeNull();
    expect(parseIntakeRequest(request({ readiness: { code: 'c', total: 101, level: 'x' } }))).toBeNull();
  });
  test('readiness and province are optional', () => {
    expect(parseIntakeRequest(request({ readiness: null, organisation: { name: 'X Org', province: null, district: null } }))).not.toBeNull();
  });
});

test('sourceRef references the public lead', () => {
  expect(leadIntakeSourceRef('pl_1')).toBe('public-lead:pl_1');
});
