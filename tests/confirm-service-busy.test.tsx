import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { confirmEvidenceUploadAction } from '@/app/[locale]/(app)/[workspace]/evidence/actions';
import { isServiceBusy } from '@/lib/service-busy';
import * as actualTenant from '@/lib/tenant';

// Mock dependencies
vi.mock('@/lib/db', () => ({
  withTenant: vi.fn(),
  withTenantLockPool: vi.fn(),
}));
vi.mock('@/lib/tenant', () => ({
  requireTenantAction: vi.fn(),
}));
vi.mock('@/lib/storage', () => ({
  getPresignedUploadUrl: vi.fn(),
  deleteTenantObject: vi.fn(),
  deleteObjectBytes: vi.fn(),
  evidenceUploadType: vi.fn(),
  finalKeyOfIncoming: vi.fn(),
  copyIncomingObject: vi.fn(),
  isFinalUploadRefusal: vi.fn(),
  uploadFileToR2: vi.fn(),
  tenantObjectKeyOf: vi.fn(),
  EVIDENCE_BUCKET: 'test-bucket',
  EVIDENCE_COPY_DEADLINE_MS: 5000,
}));
vi.mock('@/lib/evidence-ai', () => ({
  extractEvidenceMetadata: vi.fn(),
}));
vi.mock('@/lib/evidence-health', () => ({
  calculateEvidenceHealthScore: vi.fn(),
}));
vi.mock('next/cache', () => ({
  revalidatePath: vi.fn(),
}));

import { requireTenantAction } from '@/lib/tenant';
import { tenantObjectKeyOf, finalKeyOfIncoming } from '@/lib/storage';

describe('confirmEvidenceUploadAction SERVICE_BUSY handling', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns service_busy error when requireTenantAction throws SERVICE_BUSY', async () => {
    const mockServiceBusyError = new Error('Service busy: the database had no connection for this request');
    (mockServiceBusyError as any).code = 'SERVICE_BUSY';
    (mockServiceBusyError as any).digest = 'SERVICE_BUSY';

    (requireTenantAction as any).mockRejectedValue(mockServiceBusyError);

    const result = await confirmEvidenceUploadAction({
      title: 'Test Document',
      category: 'CAT-01',
      objectKey: 'test-key',
      fileName: 'test.pdf',
      fileSizeBytes: 1024,
      mimeType: 'application/pdf',
    });

    expect(result).toEqual({
      success: false,
      error: 'service_busy',
    });
  });

  it('isServiceBusy recognizes SERVICE_BUSY error', () => {
    const error = new Error('test');
    (error as any).code = 'SERVICE_BUSY';

    expect(isServiceBusy(error)).toBe(true);
  });

  it('isServiceBusy recognizes SERVICE_BUSY digest', () => {
    const error = new Error('test');
    (error as any).digest = 'SERVICE_BUSY';

    expect(isServiceBusy(error)).toBe(true);
  });

  it('isServiceBusy recognizes serviceBusy code', () => {
    expect(isServiceBusy('serviceBusy')).toBe(true);
  });

  it('confirms invalid_object_key error path still works', async () => {
    (requireTenantAction as any).mockResolvedValue({
      tenantId: 'tenant-1',
      userId: 'user-1',
    });
    (tenantObjectKeyOf as any).mockReturnValue(null);

    const result = await confirmEvidenceUploadAction({
      title: 'Test Document',
      category: 'CAT-01',
      objectKey: 'test-key',
      fileName: 'test.pdf',
      fileSizeBytes: 1024,
      mimeType: 'application/pdf',
    });

    expect(result).toEqual({
      success: false,
      error: 'invalid_object_key',
    });
  });

  it('real confirm call returns service_busy when pool is exhausted', async () => {
    // Simulate a pool timeout error that occurs inside withTenantLockPool
    const poolTimeoutError = new Error('timeout exceeded when trying to connect');
    (poolTimeoutError as any).code = 'SERVICE_BUSY';
    (poolTimeoutError as any).digest = 'SERVICE_BUSY';

    // Mock requireTenantAction to succeed
    (requireTenantAction as any).mockResolvedValue({
      tenantId: 'tenant-pool-test',
      userId: 'user-pool-test',
    });

    (tenantObjectKeyOf as any).mockReturnValue('staging/tenant-pool-test/test-key');
    (finalKeyOfIncoming as any).mockReturnValue('final/tenant-pool-test/test-key');

    // Mock withTenantLockPool to throw SERVICE_BUSY
    const { withTenantLockPool } = await import('@/lib/db');
    (withTenantLockPool as any).mockRejectedValue(poolTimeoutError);

    // Mock extractEvidenceMetadata
    const { extractEvidenceMetadata } = await import('@/lib/evidence-ai');
    (extractEvidenceMetadata as any).mockResolvedValue({ ocrSummary: '', tags: [] });

    const result = await confirmEvidenceUploadAction({
      title: 'Test Document',
      category: 'CAT-01',
      objectKey: 'staging/tenant-pool-test/test-key',
      fileName: 'test.pdf',
      fileSizeBytes: 1024,
      mimeType: 'application/pdf',
    });

    expect(result).toEqual({
      success: false,
      error: 'service_busy',
    });
  });
});
