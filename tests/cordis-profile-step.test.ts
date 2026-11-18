/**
 * The partner-profile step shared by the monthly job, the CLI script, the admin
 * action and the admin API route (NG-237). Its rule: an unchanged dump rebuilds
 * the profiles only when an earlier profile build failed and its alert is open.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';

interface FakeAlert {
  source: string;
  meta: Record<string, unknown>;
  resolvedAt: Date | null;
}
const alerts: FakeAlert[] = [];

vi.mock('@/lib/observability/system-alert', () => ({
  recordAlert: (input: { source: string; dedupeKey?: string }) => recordAlert(input),
  resolveAlerts: vi.fn(async (sel: { source: string; meta?: Record<string, unknown> }) => {
    let resolved = 0;
    for (const a of alerts) {
      if (a.source !== sel.source || a.resolvedAt !== null) continue;
      if (sel.meta && !Object.entries(sel.meta).every(([k, v]) => a.meta[k] === v)) continue;
      a.resolvedAt = new Date();
      resolved++;
    }
    return { resolved };
  }),
}));

const recordAlert = vi.fn(async (input: { source: string; dedupeKey?: string }) => {
  alerts.push({ source: input.source, meta: { alertDedupeKey: input.dedupeKey }, resolvedAt: null });
  return {};
});

vi.mock('@/lib/db', () => ({
  prisma: {
    systemAlert: {
      findMany: vi.fn(async (args: { where: { source: string; resolvedAt: null } }) =>
        alerts
          .filter((a) => a.source === args.where.source && a.resolvedAt === null)
          .map((a) => ({ id: 'x', meta: a.meta }))
      ),
    },
  },
}));

const generatePartnerProfiles = vi.fn();
vi.mock('@/lib/k2-cordis/partnerProfileJob', () => ({ generatePartnerProfiles }));

const { runPartnerProfileStep, partnerProfilesOwed } = await import('../src/lib/k2-cordis/profileStep');

const PROFILES = { success: true, updatedProfiles: 3, updatedCoParticipations: 4, durationMs: 1 };

beforeEach(() => {
  alerts.length = 0;
  recordAlert.mockClear();
  generatePartnerProfiles.mockReset();
  generatePartnerProfiles.mockResolvedValue(PROFILES);
});

describe('runPartnerProfileStep', () => {
  it('builds the profiles after a fresh import', async () => {
    const result = await runPartnerProfileStep(false);

    expect(result).toEqual(PROFILES);
    expect(generatePartnerProfiles).toHaveBeenCalledTimes(1);
  });

  it('leaves the profiles alone on an unchanged dump when no profile failure is open', async () => {
    const result = await runPartnerProfileStep(true);

    expect(result).toBeNull();
    expect(generatePartnerProfiles).not.toHaveBeenCalled();
  });

  it('rebuilds them on an unchanged dump when the profile-failure alert is open, and closes it', async () => {
    alerts.push({ source: 'k2_monthly_cordis', meta: { alertDedupeKey: 'k2:partner-profiles-failed' }, resolvedAt: null });
    expect(await partnerProfilesOwed()).toBe(true);

    const result = await runPartnerProfileStep(true);

    expect(result).toEqual(PROFILES);
    expect(generatePartnerProfiles).toHaveBeenCalledTimes(1);
    expect(alerts[0]!.resolvedAt).not.toBeNull();
    expect(await partnerProfilesOwed()).toBe(false);
  });

  it('ignores an open alert of another k2 key or another source', async () => {
    alerts.push({ source: 'k2_monthly_cordis', meta: { alertDedupeKey: 'k2:heap-too-small' }, resolvedAt: null });
    alerts.push({ source: 'k2_cordis_import', meta: { alertDedupeKey: 'k2:partner-profiles-failed' }, resolvedAt: null });

    expect(await partnerProfilesOwed()).toBe(false);
    expect(await runPartnerProfileStep(true)).toBeNull();
  });

  it('a profile build failed on the manual path raises the profile-failure alert, rethrows, and the next unchanged run rebuilds', async () => {
    generatePartnerProfiles.mockRejectedValueOnce(new Error('deadlock detected'));

    // Admin action / route / CLI: the import succeeded, the profile step throws.
    await expect(runPartnerProfileStep(false, { runId: 'RUN-1' })).rejects.toThrow('deadlock detected');
    expect(recordAlert).toHaveBeenCalledTimes(1);
    expect(recordAlert).toHaveBeenCalledWith(
      expect.objectContaining({ source: 'k2_monthly_cordis', dedupeKey: 'k2:partner-profiles-failed' })
    );
    expect(await partnerProfilesOwed()).toBe(true);

    // The operator presses the same button again: same dump, profiles are rebuilt and the alert closes.
    const result = await runPartnerProfileStep(true, { runId: 'RUN-2' });
    expect(result).toEqual(PROFILES);
    expect(await partnerProfilesOwed()).toBe(false);
  });

  it('does not close the alert when the profile build fails', async () => {
    alerts.push({ source: 'k2_monthly_cordis', meta: { alertDedupeKey: 'k2:partner-profiles-failed' }, resolvedAt: null });
    generatePartnerProfiles.mockRejectedValue(new Error('deadlock detected'));

    await expect(runPartnerProfileStep(true)).rejects.toThrow('deadlock detected');
    expect(alerts[0]!.resolvedAt).toBeNull();
  });
});
