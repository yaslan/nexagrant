import type { PrismaClient } from '@prisma/client';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { leadTransferConsentEnabled } from '@/lib/env';
import { transferOrgNameFor } from './transfer-org';

// NG-179 publication gate for the organisation name: with LEAD_TRANSFER_CONSENT_ENABLED off the
// lookup never touches the database, so the box cannot reach the page.
vi.mock('@/lib/env', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/env')>()),
  leadTransferConsentEnabled: vi.fn(),
}));

const gate = vi.mocked(leadTransferConsentEnabled);

/** A database stand-in that fails the test if anything reads from it. */
const untouchedDb = () => {
  const fail = () => {
    throw new Error('database must not be read while the gate is off');
  };
  return { $transaction: vi.fn(fail) } as unknown as PrismaClient;
};

describe('transferOrgNameFor: publication gate (NG-179)', () => {
  beforeEach(() => {
    gate.mockReset();
  });

  it('gate off: returns null for any province and never reads the database', async () => {
    gate.mockReturnValue(false);
    const db = untouchedDb();
    await expect(transferOrgNameFor('Samsun', db)).resolves.toBeNull();
    expect(db.$transaction).not.toHaveBeenCalled();
  });
});
