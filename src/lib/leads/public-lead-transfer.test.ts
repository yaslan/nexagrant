import type { PrismaClient } from '@prisma/client';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { PUBLIC_LEAD_CONSENT, PUBLIC_LEAD_TRANSFER_CONSENT, PUBLIC_CONTACT_EMAIL } from './public-lead-policy';
import { submitPublicLead } from './public-lead';
import { transferRecipientFor } from './transfer-org';
import { leadTransferConsentEnabled } from '@/lib/env';

// The transfer box's server gate (NG-179), without a database: the organisation lookup is
// stubbed, the publication flag is set per test, and the write is captured. The live rows are
// checked against Postgres separately.
vi.mock('./transfer-org', () => ({ transferRecipientFor: vi.fn() }));
vi.mock('@/lib/env', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/env')>()),
  leadTransferConsentEnabled: vi.fn(),
}));

const NOW = new Date('2026-11-14T10:00:00.000Z');

const valid = {
  name: 'Ayşe Yılmaz',
  email: 'ayse@example.org',
  organisation: 'İlkadım Belediyesi',
  province: 'Samsun',
  readinessCode: undefined,
  consent: true,
  consentVersion: PUBLIC_LEAD_CONSENT.version,
  source: 'fon-hazirlik',
  locale: 'tr',
};

/** A fake Prisma client that records what the lead write would store. */
function fakeDb() {
  const create = vi.fn(async (args: { data: Record<string, unknown> }) => args);
  const tx = {
    $executeRaw: vi.fn(async () => 0),
    publicLead: { count: vi.fn(async () => 0), create },
  };
  const db = { $transaction: vi.fn(async (cb: (t: typeof tx) => Promise<unknown>) => cb(tx)) };
  return { db: db as unknown as PrismaClient, create };
}

const lookup = vi.mocked(transferRecipientFor);
const ORG = { tenantId: 't_org', name: 'Örnek Danışmanlık A.Ş.' };
const gate = vi.mocked(leadTransferConsentEnabled);

describe('transfer box: server gate (NG-179)', () => {
  beforeEach(() => {
    lookup.mockReset();
    gate.mockReset();
    gate.mockReturnValue(true);
  });

  it('publication gate off: a ticked box writes no transfer consent and no organisation is read', async () => {
    gate.mockReturnValue(false);
    lookup.mockResolvedValue(ORG);
    const { db, create } = fakeDb();
    const result = await submitPublicLead({ ...valid, transferConsent: true, transferOrgName: ORG.name }, { db, now: NOW, secret: null });
    expect(result).toEqual({ ok: true });
    expect(lookup).not.toHaveBeenCalled();
    expect(create.mock.calls[0]![0].data).toMatchObject({ transferConsent: false, transferConsentVersion: null, transferConsentAt: null });
  });

  it('uses its own id and version, never the contact consent version', () => {
    expect(PUBLIC_LEAD_TRANSFER_CONSENT.version).toBe('transfer-consent-v1-2026-11');
    expect(PUBLIC_LEAD_TRANSFER_CONSENT.id).toBe('lead-intake-transfer');
    expect(PUBLIC_LEAD_TRANSFER_CONSENT.version).not.toBe(PUBLIC_LEAD_CONSENT.version);
  });

  it('writes the transfer consent (server version and time) when ticked and the province has an organisation', async () => {
    lookup.mockResolvedValue(ORG);
    const { db, create } = fakeDb();
    const result = await submitPublicLead({ ...valid, transferConsent: true, transferOrgName: ORG.name }, { db, now: NOW, secret: null });
    expect(result).toEqual({ ok: true });
    const data = create.mock.calls[0]![0].data;
    expect(data).toMatchObject({
      transferConsent: true,
      transferConsentVersion: 'transfer-consent-v1-2026-11',
      transferConsentAt: NOW,
      transferConsentTenantId: ORG.tenantId,
      transferConsentOrgName: ORG.name,
    });
  });

  it('NG-204: the form showed another organisation (map moved before submit): no transfer consent, no recipient', async () => {
    lookup.mockResolvedValue(ORG);
    const { db, create } = fakeDb();
    const result = await submitPublicLead({ ...valid, transferConsent: true, transferOrgName: 'Eski Danışmanlık Ltd.' }, { db, now: NOW, secret: null });
    expect(result).toEqual({ ok: true });
    expect(create.mock.calls[0]![0].data).toMatchObject({
      transferConsent: false, transferConsentVersion: null, transferConsentAt: null, transferConsentTenantId: null, transferConsentOrgName: null,
    });
  });

  it('NG-204: a ticked box without the shown organisation name records no transfer consent', async () => {
    lookup.mockResolvedValue(ORG);
    const { db, create } = fakeDb();
    await submitPublicLead({ ...valid, transferConsent: true }, { db, now: NOW, secret: null });
    expect(create.mock.calls[0]![0].data).toMatchObject({ transferConsent: false, transferConsentTenantId: null, transferConsentOrgName: null });
  });

  // NG-213 D-4 (sec-gnd NG-204 review): the schema trims the name the form sends back, the stored
  // Tenant.name is not trimmed. A tenant whose name has a leading or trailing space must not lose every
  // legitimate consent: both sides are compared the same way, and the stored name is the one the
  // visitor was shown (the DB value, unchanged).
  it.each([
    ['trailing space in the stored name', `${ORG.name} `],
    ['leading space in the stored name', ` ${ORG.name}`],
    ['spaces on both ends of the stored name', `  ${ORG.name}\t`],
  ])('NG-213 D-4: %s, the form sends back what it showed → the consent is recorded', async (_label, stored) => {
    lookup.mockResolvedValue({ tenantId: ORG.tenantId, name: stored });
    const { db, create } = fakeDb();
    const result = await submitPublicLead({ ...valid, transferConsent: true, transferOrgName: stored }, { db, now: NOW, secret: null });
    expect(result).toEqual({ ok: true });
    expect(create.mock.calls[0]![0].data).toMatchObject({
      transferConsent: true,
      transferConsentTenantId: ORG.tenantId,
      transferConsentOrgName: stored,
    });
  });

  it('NG-213 D-4: normalising the ends does not make another name match (inner text still compared exactly)', async () => {
    lookup.mockResolvedValue({ tenantId: ORG.tenantId, name: ` ${ORG.name} ` });
    const { db, create } = fakeDb();
    await submitPublicLead({ ...valid, transferConsent: true, transferOrgName: ORG.name.replace(' ', '  ') }, { db, now: NOW, secret: null });
    expect(create.mock.calls[0]![0].data).toMatchObject({ transferConsent: false, transferConsentTenantId: null, transferConsentOrgName: null });
  });

  it('a ticked box for an unmapped province is accepted but writes no transfer consent', async () => {
    lookup.mockResolvedValue(null);
    const { db, create } = fakeDb();
    const result = await submitPublicLead({ ...valid, transferConsent: true, transferOrgName: ORG.name }, { db, now: NOW, secret: null });
    expect(result).toEqual({ ok: true });
    const data = create.mock.calls[0]![0].data;
    expect(data).toMatchObject({ transferConsent: false, transferConsentVersion: null, transferConsentAt: null });
  });

  it('an unticked box never looks up an organisation and writes no transfer consent', async () => {
    const { db, create } = fakeDb();
    await submitPublicLead(valid, { db, now: NOW, secret: null });
    expect(lookup).not.toHaveBeenCalled();
    expect(create.mock.calls[0]![0].data).toMatchObject({ transferConsent: false, transferConsentVersion: null, transferConsentAt: null });
  });

  it('anything but a literal true counts as unticked', async () => {
    const { db, create } = fakeDb();
    await submitPublicLead({ ...valid, transferConsent: 'yes' }, { db, now: NOW, secret: null });
    expect(lookup).not.toHaveBeenCalled();
    expect(create.mock.calls[0]![0].data).toMatchObject({ transferConsent: false });
  });

  it('a client-supplied transfer version or time is ignored; the server writes its own', async () => {
    lookup.mockResolvedValue(ORG);
    const { db, create } = fakeDb();
    await submitPublicLead(
      { ...valid, transferConsent: true, transferOrgName: ORG.name, transferConsentVersion: 'forged', transferConsentAt: '2001-01-01' },
      { db, now: NOW, secret: null },
    );
    expect(create.mock.calls[0]![0].data).toMatchObject({
      transferConsentVersion: 'transfer-consent-v1-2026-11',
      transferConsentAt: NOW,
    });
  });

  it('a failed organisation lookup stores the lead without transfer consent (the lead is not lost)', async () => {
    lookup.mockRejectedValue(new Error('db down'));
    const { db, create } = fakeDb();
    const result = await submitPublicLead({ ...valid, transferConsent: true, transferOrgName: ORG.name }, { db, now: NOW, secret: null });
    expect(result).toEqual({ ok: true });
    expect(create.mock.calls[0]![0].data).toMatchObject({ transferConsent: false, transferConsentVersion: null, transferConsentAt: null });
  });

  it('withdrawal address is the footer contact address', () => {
    expect(PUBLIC_CONTACT_EMAIL).toBe('info@nexagrant.com');
  });
});
