import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * NG-212 — the production wiring of the readiness → M18 bridge, without a database:
 *  - the public form action hands submitPublicLead the composition-root forwarder;
 *  - the forwarder (src/lib/ports/lead-intake.ts) runs forwardPublicLead with the M18 port,
 *    which is loaded there and nowhere in src/lib/leads (CLAUDE.md "Mimari kurallar" 2).
 */
const m = vi.hoisted(() => ({
  submitPublicLead: vi.fn(),
  forwardPublicLead: vi.fn(),
  createLeadIntakePort: vi.fn(),
}));

vi.mock('next/headers', () => ({ headers: async () => new Headers({ 'x-forwarded-for': '203.0.113.7' }) }));
vi.mock('@/lib/leads/public-lead', () => ({ submitPublicLead: m.submitPublicLead, clientIpFrom: () => '203.0.113.7' }));
vi.mock('@/lib/leads/transfer-org', () => ({ transferOrgNameFor: vi.fn() }));
vi.mock('@/lib/leads/public-lead-intake', () => ({ forwardPublicLead: m.forwardPublicLead }));
vi.mock('@/modules/m18/server/intake-repo', () => ({ createLeadIntakePort: m.createLeadIntakePort }));

import { submitReadinessLead } from '@/app/[locale]/(public)/fon-hazirlik/actions';
import { forwardPublicLeadToPipeline } from '@/lib/ports/lead-intake';

describe('readiness lead → M18 bridge wiring (NG-212)', () => {
  beforeEach(() => {
    m.submitPublicLead.mockReset();
    m.forwardPublicLead.mockReset();
    m.createLeadIntakePort.mockReset();
  });

  it('the form action passes the pipeline forwarder to submitPublicLead', async () => {
    m.submitPublicLead.mockResolvedValue({ ok: true });
    const input = { name: 'x' };
    expect(await submitReadinessLead(input)).toEqual({ ok: true });
    expect(m.submitPublicLead).toHaveBeenCalledWith(input, { ip: '203.0.113.7', forwardLead: forwardPublicLeadToPipeline });
  });

  it('the forwarder runs forwardPublicLead with the M18 intake port', async () => {
    const port = { accept: vi.fn() };
    m.createLeadIntakePort.mockReturnValue(port);
    m.forwardPublicLead.mockResolvedValue({ status: 'skipped', reason: 'transfer_consent_off' });
    expect(await forwardPublicLeadToPipeline('lead_1')).toEqual({ status: 'skipped', reason: 'transfer_consent_off' });
    expect(m.forwardPublicLead).toHaveBeenCalledWith('lead_1', port);
  });
});
