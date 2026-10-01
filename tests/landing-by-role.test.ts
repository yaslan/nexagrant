import { describe, expect, it } from 'vitest';

import { can } from '@/lib/rbac';
import { landingPathFor } from '@/lib/landing';

/** TASK-MUPUGXME9DP6K (QA Y-1): every role lands on a page it may open. */
describe('landingPathFor', () => {
  it.each([
    ['TENANT_OWNER', '/tr/default/panel'],
    ['TENANT_ADMIN', '/tr/default/panel'],
    ['PIPELINE_MANAGER', '/tr/default/panel'],
    ['WRITER', '/tr/default/firsatlar'],
    ['MEMBER', '/tr/default/firsatlar'],
    ['GUEST_PARTNER', '/tr/default/bildirimler'],
  ] as const)('%s → %s', (role, path) => {
    expect(landingPathFor(role, 'tr')).toBe(path);
  });

  it('en locale uses the en paths', () => {
    expect(landingPathFor('MEMBER', 'en')).toBe('/en/default/pipeline');
    expect(landingPathFor('TENANT_OWNER', 'en')).toBe('/en/default/dashboard');
  });

  it('no role / unknown role falls back to notifications, never the gated dashboard', () => {
    expect(landingPathFor(null, 'tr')).toBe('/tr/default/bildirimler');
    expect(landingPathFor(undefined, 'en')).toBe('/en/default/notifications');
  });

  it('only roles that pass evaluate_gates land on the dashboard (gate not loosened)', () => {
    expect(can('MEMBER', 'evaluate_gates')).toBe(false);
    expect(can('WRITER', 'evaluate_gates')).toBe(false);
  });
});
