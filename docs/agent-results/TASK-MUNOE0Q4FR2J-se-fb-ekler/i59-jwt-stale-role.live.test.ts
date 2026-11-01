import { expect, test, vi } from 'vitest';
vi.mock('next/headers', () => ({ headers: vi.fn(async () => new Headers()), cookies: vi.fn(async () => ({ get: () => undefined, set: () => undefined, delete: () => undefined })) }));
import { prisma } from '@/lib/db';
import { authConfig } from '@/lib/auth';

/** İNCELEME-59 H7 — the jwt callback on an ordinary request (no trigger) keeps the role/tenant it was minted with. */
test('H7 demoted / removed member keeps the old role in the token', async () => {
  if (!process.env.DATABASE_URL?.endsWith('/sefb_i59')) throw new Error('isolated DB only');
  const t = await prisma.tenant.create({ data: { name: 'i59 H7', slug: `i59-h7-${Date.now()}`, country: 'TR' } });
  const u = await prisma.user.create({ data: { email: `h7-${Date.now()}@i59.test`, name: 'h7' } });
  const m = await prisma.membership.create({ data: { tenantId: t.id, userId: u.id, role: 'TENANT_OWNER' } });
  const jwt = (authConfig.callbacks as any).jwt;
  const signIn = await jwt({ token: { id: u.id, email: u.email }, user: undefined, trigger: 'signIn' });
  await prisma.membership.update({ where: { id: m.id }, data: { role: 'MEMBER' } });
  const afterDemote = await jwt({ token: { ...signIn }, user: undefined, trigger: undefined });
  await prisma.membership.delete({ where: { id: m.id } });
  const afterRemove = await jwt({ token: { ...afterDemote }, user: undefined, trigger: undefined });
  console.log('H7', JSON.stringify({ signIn: { tenantId: signIn.tenantId === t.id, role: signIn.role }, afterDemote: afterDemote.role, afterRemove: { tenantId: afterRemove.tenantId === t.id, role: afterRemove.role }, maxAge: (authConfig as any).session }));
  expect(afterRemove.role).toBe('TENANT_OWNER');
});
