import { describe, test, expect, vi } from 'vitest';
import { generateStandardDoc, signDocument, createNewVersion } from '../../src/modules/m10/server/actions';

vi.mock('../../src/lib/db', () => ({
  prisma: {
    creditLedger: {
      create: vi.fn().mockResolvedValue({ id: 'ledger-1' }),
    },
    opportunity: {
      findUnique: vi.fn().mockResolvedValue({ id: 'opp-10', tenantId: 'tenant-10', title: 'Test Opp' }),
    },
    followupDoc: {
      create: vi.fn().mockImplementation(async ({ data }) => ({
        id: 'doc-101',
        tenantId: data.tenantId,
        opportunityId: data.opportunityId,
        kind: data.kind,
        version: data.version,
        contentUrl: data.contentUrl,
        signedAt: null,
      })),
      findUnique: vi.fn().mockResolvedValue({
        id: 'doc-101',
        tenantId: 'tenant-10',
        opportunityId: 'opp-10',
        kind: 'NDA',
        version: 1,
        contentUrl: 'https://storage.fabrika.app/docs/tenant-10/opp-10/nda_v1.pdf',
      }),
      update: vi.fn().mockImplementation(async ({ data }) => ({
        id: 'doc-101',
        signedAt: data.signedAt || null,
        version: data.version || 1,
        contentUrl: data.contentUrl || 'https://storage.fabrika.app/docs/tenant-10/opp-10/nda_v2.pdf',
      })),
    },
  },
}));

vi.mock('../../src/lib/ai/llm', () => ({
  generateText: vi.fn().mockResolvedValue(`### MUTUAL NON-DISCLOSURE AGREEMENT (NDA)\n\nMock document content.`),
}));

describe('M10 Follow-up Documents Module', () => {
  test('generateStandardDoc creates an NDA document draft with structured text', async () => {
    const doc = await generateStandardDoc('opp-10', 'tenant-10', 'NDA');
    expect(doc).toBeDefined();
    expect(doc.kind).toBe('NDA');
    expect(doc.contentText).toContain('MUTUAL NON-DISCLOSURE AGREEMENT');
  });

  test('generateStandardDoc creates a TÜBİTAK Eşik Üstü Ödül Paketi document', async () => {
    const doc = await generateStandardDoc('opp-10', 'tenant-10', 'AWARD_PACK');
    expect(doc).toBeDefined();
    expect(doc.kind).toBe('AWARD_PACK');
  });

  test('signDocument updates document signedAt timestamp', async () => {
    const res = await signDocument('doc-101');
    expect(res.success).toBe(true);
    expect(res.signedAt).toBeDefined();
  });

  test('createNewVersion increments document version', async () => {
    const res = await createNewVersion('doc-101');
    expect(res.success).toBe(true);
    expect(res.updatedDoc.version).toBe(2);
  });
});
