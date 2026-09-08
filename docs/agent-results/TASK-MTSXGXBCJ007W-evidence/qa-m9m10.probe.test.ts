/** QA probe — same question for M9 and M10. Real DB, real llm.ts, stubbed HTTPS + session. */
import { describe, it, expect, vi, beforeAll, afterAll } from 'vitest';
import fs from 'fs';
const OUT = '/tmp/qa-m9m10.txt';
const log = (...a: unknown[]) => fs.appendFileSync(OUT, a.map(String).join(' ') + '\n');

const TENANT = 'demo-tenant';
const PROBE = 'QA_PROBE_M9M10';

vi.mock('@/lib/tenant', () => ({
  requireTenantAction: async () => ({ tenantId: TENANT, userId: null, workspaceSlug: 'demo' }),
}));
vi.mock('@/lib/modules/access', () => ({
  assertModuleAccess: async () => undefined,
  ModuleAccessError: class extends Error {},
}));
vi.mock('next/cache', () => ({ revalidatePath: () => undefined }));
vi.mock('@/lib/auth', () => ({ auth: async () => ({ user: { id: 'probe-user', email: 'qa@probe.local' } }) }));
vi.mock('@/lib/env', async (orig) => {
  const actual = (await orig()) as { env: Record<string, unknown> };
  return { ...actual, env: { ...actual.env, ANTHROPIC_API_KEY: 'probe-key' } };
});

import { prisma, withTenant } from '@/lib/db';

const balance = () =>
  withTenant(TENANT, (tx) => tx.creditLedger.aggregate({ where: { tenantId: TENANT }, _sum: { delta: true } }))
    .then((r) => r._sum.delta ?? 0);

const debitsSince = (since: Date) =>
  withTenant(TENANT, (tx) =>
    tx.creditLedger.findMany({
      where: { tenantId: TENANT, delta: { lt: 0 }, createdAt: { gte: since } },
      select: { delta: true, reason: true },
      orderBy: { createdAt: 'asc' },
    })
  );

describe('per-module: how many debits does ONE AI action write?', () => {
  beforeAll(async () => {
    await withTenant(TENANT, (tx) =>
      tx.creditLedger.create({ data: { tenantId: TENANT, delta: 500, reason: PROBE + '_grant' } })
    );
    vi.stubGlobal('fetch', async () =>
      new Response(
        JSON.stringify({
          content: [{ type: 'text', text: 'PROBE BRIEF BODY' }],
          usage: { input_tokens: 4000, output_tokens: 1000 },
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      )
    );
  });

  afterAll(async () => {
    await withTenant(TENANT, async (tx) => {
      await tx.meetingBrief.deleteMany({ where: { tenantId: TENANT, interactionId: { startsWith: PROBE } } });
      await tx.followupDoc.deleteMany({ where: { tenantId: TENANT, opportunityId: 'demo-opp-1' } });
      await tx.aiUsageLog.deleteMany({ where: { tenantId: TENANT, purpose: { in: ['meeting_brief', 'document_generation', 'document'] } } });
      await tx.creditLedger.deleteMany({ where: { tenantId: TENANT, delta: { not: 0 } } });
    });
    log('CLEANUP -> CreditLedger left:', await prisma.creditLedger.count(), 'AiUsageLog left:', await prisma.aiUsageLog.count());
    await prisma.$disconnect();
  });

  it('M9 meeting brief', async () => {
    const { generateMeetingBrief } = await import('@/modules/m9/server/actions');
    const t0 = new Date(); await new Promise((r) => setTimeout(r, 20));
    const b0 = await balance();
    await generateMeetingBrief({ interactionId: PROBE + '_i1', partnerName: 'ACME', callTopic: 'HORIZON-CL5' });
    const rows = await debitsSince(t0);
    const usage = await withTenant(TENANT, (tx) => tx.aiUsageLog.findMany({ where: { tenantId: TENANT, purpose: 'meeting_brief' }, select: { credits: true } }));
    log('M9 debit rows:', JSON.stringify(rows));
    log('M9 AiUsageLog credits:', JSON.stringify(usage), '| balance moved:', b0 - (await balance()));
    expect(rows.length).toBe(1);
  });

  it('M10 standard document', async () => {
    const { generateStandardDoc } = await import('@/modules/m10/server/actions');
    const t0 = new Date(); await new Promise((r) => setTimeout(r, 20));
    const b0 = await balance();
    await generateStandardDoc('demo-opp-1', 'NDA');
    const rows = await debitsSince(t0);
    const usage = await withTenant(TENANT, (tx) => tx.aiUsageLog.findMany({ where: { tenantId: TENANT, module: 'M10' }, select: { credits: true, purpose: true } }));
    log('M10 debit rows:', JSON.stringify(rows));
    log('M10 AiUsageLog credits:', JSON.stringify(usage), '| balance moved:', b0 - (await balance()));
    expect(rows.length).toBe(1);
  });
});
