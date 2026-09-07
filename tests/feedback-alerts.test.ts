import { describe, it, expect, vi } from 'vitest';
import {
  buildAlertRow,
  sanitizeMeta,
  recordAlert,
} from '@/lib/observability/system-alert';
import { feedbackAlertLevel } from '@/lib/feedback/submit';

describe('alert meta sanitisation', () => {
  it('drops undefined values without listing them as redacted', () => {
    expect(sanitizeMeta({ a: 1, b: undefined })).toEqual({ a: 1 });
  });

  it('strips credential- and identity-shaped keys and says which ones went', () => {
    const meta = sanitizeMeta({
      feedbackId: 'fb_1',
      userEmail: 'partner@example.org',
      apiKey: 'sk-live-123',
      Authorization: 'Bearer x',
      priority: 'P0',
    });

    expect(meta).toEqual({
      feedbackId: 'fb_1',
      priority: 'P0',
      redactedKeys: ['Authorization', 'apiKey', 'userEmail'],
    });
    // The values themselves must not survive anywhere in the row.
    expect(JSON.stringify(meta)).not.toContain('partner@example.org');
    expect(JSON.stringify(meta)).not.toContain('sk-live-123');
  });

  it('returns undefined rather than an empty object when nothing survives', () => {
    expect(sanitizeMeta({ password: 'hunter2' })?.password).toBeUndefined();
    expect(sanitizeMeta(undefined)).toBeUndefined();
  });
});

describe('alert row shape', () => {
  it('truncates an over-long message instead of failing the write', () => {
    const row = buildAlertRow({ level: 'error', source: 'x', message: 'a'.repeat(900) });
    expect(row.message).toHaveLength(500);
  });

  it('omits meta entirely when there is nothing to record', () => {
    expect(buildAlertRow({ level: 'info', source: 'x', message: 'y' })).toEqual({
      level: 'info',
      source: 'x',
      message: 'y',
    });
  });
});

describe('recordAlert contract', () => {
  it('returns the new row id on success', async () => {
    const client = { systemAlert: { create: vi.fn().mockResolvedValue({ id: 'alert_1' }) } };
    await expect(recordAlert({ level: 'warn', source: 's', message: 'm' }, { client })).resolves.toEqual({
      status: 'recorded',
      id: 'alert_1',
    });
  });

  it('swallows a database failure — the caller is already on an error path', async () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const client = {
      systemAlert: { create: vi.fn().mockRejectedValue(new Error('connect ECONNREFUSED')) },
    };

    const result = await recordAlert({ level: 'error', source: 's', message: 'm' }, { client });

    expect(result).toEqual({ status: 'failed', reason: 'write_failed' });
    spy.mockRestore();
  });
});

describe('feedback priority to alert level', () => {
  // SystemAlert.level has no `fatal`, so P0 and P1 share `error`.
  it.each([
    ['P0', 'error'],
    ['P1', 'error'],
    ['P2', 'warn'],
    ['P3', 'info'],
  ] as const)('maps %s to %s', (priority, level) => {
    expect(feedbackAlertLevel(priority)).toBe(level);
  });
});
