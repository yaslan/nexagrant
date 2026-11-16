import type { PrismaClient } from '@prisma/client';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { PUBLIC_LEAD_CONSENT } from './public-lead-policy';
import { submitPublicLead } from './public-lead';
import { transferRecipientFor } from './transfer-org';
import { leadTransferConsentEnabled } from '@/lib/env';

// NG-212 — the form hands a stored lead to the client-pipeline bridge AFTER its write committed, and
// the bridge never decides the form's answer: a throw or a refusal still returns ok with the lead kept.
// No database: the organisation lookup and the publication flag are stubbed, the write is captured.
vi.mock('./transfer-org', () => ({ transferRecipientFor: vi.fn() }));
vi.mock('@/lib/env', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/env')>()),
  leadTransferConsentEnabled: vi.fn(),
}));

const NOW = new Date('2026-11-16T10:00:00.000Z');
const ORG = { tenantId: 't_org', name: 'Örnek Danışmanlık A.Ş.' };
const LEAD_ID = 'lead_ng212';

const valid = {
  name: 'Ayşe Yılmaz',
  email: 'ayse@example.org',
  organisation: 'İlkadım Belediyesi',
  province: 'Samsun',
  consent: true,
  consentVersion: PUBLIC_LEAD_CONSENT.version,
  source: 'fon-hazirlik',
  locale: 'tr',
  transferConsent: true,
  transferOrgName: ORG.name,
};

/** A fake Prisma client; `events` records the order of commit and bridge call. */
function fakeDb(events: string[], opts: { failCreate?: boolean } = {}) {
  const create = vi.fn(async (args: { data: Record<string, unknown> }) => {
    if (opts.failCreate) throw Object.assign(new Error('boom'), { name: 'PrismaClientKnownRequestError' });
    return { id: LEAD_ID, ...args.data };
  });
  const tx = {
    $executeRaw: vi.fn(async () => 0),
    publicLead: { count: vi.fn(async () => 0), create },
  };
  const db = {
    $transaction: vi.fn(async (cb: (t: typeof tx) => Promise<unknown>) => {
      const out = await cb(tx);
      events.push('commit');
      return out;
    }),
  };
  return { db: db as unknown as PrismaClient, create };
}

const lookup = vi.mocked(transferRecipientFor);
const gate = vi.mocked(leadTransferConsentEnabled);

describe('submitPublicLead → client-pipeline bridge (NG-212)', () => {
  beforeEach(() => {
    lookup.mockReset();
    lookup.mockResolvedValue(ORG);
    gate.mockReset();
    gate.mockReturnValue(true);
  });

  it('calls the bridge once, with the stored lead id, only after the write committed', async () => {
    const events: string[] = [];
    const { db } = fakeDb(events);
    const forwardLead = vi.fn(async (id: string) => {
      events.push(`forward:${id}`);
      return { status: 'created' };
    });
    const result = await submitPublicLead(valid, { db, now: NOW, secret: null, forwardLead });
    expect(result).toEqual({ ok: true });
    expect(forwardLead).toHaveBeenCalledTimes(1);
    expect(events).toEqual(['commit', `forward:${LEAD_ID}`]);
  });

  it('the bridge throws → the form still answers ok and the lead stays stored', async () => {
    const { db, create } = fakeDb([]);
    const forwardLead = vi.fn(async () => {
      throw new Error('M18 port down');
    });
    const result = await submitPublicLead(valid, { db, now: NOW, secret: null, forwardLead });
    expect(result).toEqual({ ok: true });
    expect(forwardLead).toHaveBeenCalledTimes(1);
    expect(create).toHaveBeenCalledTimes(1);
    expect(create.mock.calls[0]![0].data).toMatchObject({ transferConsent: true, transferConsentTenantId: ORG.tenantId });
  });

  it('the bridge refuses → the form still answers ok', async () => {
    const { db, create } = fakeDb([]);
    const forwardLead = vi.fn(async () => ({ status: 'refused', reason: 'tenant_ineligible' }));
    expect(await submitPublicLead(valid, { db, now: NOW, secret: null, forwardLead })).toEqual({ ok: true });
    expect(create).toHaveBeenCalledTimes(1);
  });

  it('no recorded transfer consent (box unticked) → the bridge is not called', async () => {
    const { db } = fakeDb([]);
    const forwardLead = vi.fn(async () => ({ status: 'created' }));
    expect(await submitPublicLead({ ...valid, transferConsent: false }, { db, now: NOW, secret: null, forwardLead })).toEqual({ ok: true });
    expect(forwardLead).not.toHaveBeenCalled();
  });

  it('publication gate off (LEAD_TRANSFER_CONSENT_ENABLED) → no consent recorded, the bridge is not called', async () => {
    gate.mockReturnValue(false);
    const { db, create } = fakeDb([]);
    const forwardLead = vi.fn(async () => ({ status: 'created' }));
    expect(await submitPublicLead(valid, { db, now: NOW, secret: null, forwardLead })).toEqual({ ok: true });
    expect(create.mock.calls[0]![0].data).toMatchObject({ transferConsent: false });
    expect(forwardLead).not.toHaveBeenCalled();
  });

  it('the write fails → server error, the bridge is not called', async () => {
    const { db } = fakeDb([], { failCreate: true });
    const forwardLead = vi.fn(async () => ({ status: 'created' }));
    expect(await submitPublicLead(valid, { db, now: NOW, secret: null, forwardLead })).toEqual({ ok: false, error: 'server' });
    expect(forwardLead).not.toHaveBeenCalled();
  });

  it('rate limited → nothing stored, the bridge is not called', async () => {
    const { db, create } = fakeDb([]);
    const tx = (db as unknown as { $transaction: ReturnType<typeof vi.fn> }).$transaction;
    tx.mockImplementationOnce(async (cb: (t: unknown) => Promise<unknown>) =>
      cb({ $executeRaw: vi.fn(async () => 0), publicLead: { count: vi.fn(async () => 99), create } })
    );
    const forwardLead = vi.fn(async () => ({ status: 'created' }));
    expect(await submitPublicLead(valid, { db, now: NOW, secret: null, forwardLead })).toEqual({ ok: false, error: 'rate_limited' });
    expect(create).not.toHaveBeenCalled();
    expect(forwardLead).not.toHaveBeenCalled();
  });
});
