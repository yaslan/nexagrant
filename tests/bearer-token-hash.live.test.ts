/**
 * TASK-MULQLL2T8ZJX4 — the partner portal token and the invite token are stored
 * only as SHA-256, against the real database with only the session faked:
 *
 *   - the invitation route hands out a link once; the row holds the hash of
 *     the link's token, never the token, and the response does not echo it;
 *   - a portal link issued from the application screen writes a budget line;
 *     the stored hash presented as a token, and a link that was rotated away,
 *     are refused and write nothing;
 *   - Postgres's sha256() (what the migration used on existing rows) agrees
 *     with the Node hash, so a link issued before the migration still works.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

const session = vi.hoisted(() => ({ current: null as Record<string, unknown> | null }));

vi.mock('@/lib/auth', () => ({ auth: vi.fn(async () => session.current) }));
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));

import { prisma } from '@/lib/db';
import { hashSecretToken } from '@/lib/secret-token';
import { POST as invite } from '@/app/api/invitations/route';
import { issuePartnerPortalLink } from '@/modules/m11/server/partner-link';
import { addBudgetLineByToken } from '@/modules/m11/server/actions';
import { requireId } from './helpers/teardown-guard';

const suffix = () => `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

function ownerSession(tenantId: string) {
  return { user: { id: 'token-hash-user', email: 'token-hash@example.test' }, tenantId, role: 'TENANT_OWNER' };
}

describe('bearer tokens are stored as SHA-256 only (live DB)', () => {
  let tenantId: string;

  beforeEach(async () => {
    const tenant = await prisma.tenant.create({
      data: { name: 'Token Hash Test', slug: `token-hash-${suffix()}`, country: 'TR' },
    });
    tenantId = tenant.id;
    session.current = ownerSession(tenantId);
  });

  afterEach(async () => {
    session.current = null;
    await prisma.tenant.deleteMany({ where: { id: requireId(tenantId, 'tenantId') } });
  });

  it('an invitation stores the hash of the link token, and the response does not carry the row\'s secret', async () => {
    const res = await invite(
      new Request('http://localhost/api/invitations', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ email: 'invitee@example.test', role: 'MEMBER' }),
      })
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as { inviteLink: string; invitation: Record<string, unknown> };
    const token = new URL(body.inviteLink).searchParams.get('token');
    expect(token).toMatch(/^[0-9a-f]{64}$/);
    expect(body.invitation).not.toHaveProperty('token');
    expect(body.invitation).not.toHaveProperty('tokenHash');

    const rows = await prisma.$queryRaw<Array<{ tokenHash: string }>>`
      SELECT "tokenHash" FROM "Invitation" WHERE "tenantId" = ${tenantId}`;
    expect(rows).toHaveLength(1);
    expect(rows[0]!.tokenHash).toBe(hashSecretToken(token!));
    expect(rows[0]!.tokenHash).not.toContain(token!);

    // Looked up the way an accept step has to: by hash. The raw token is not a key.
    expect(await prisma.invitation.findUnique({ where: { tokenHash: token! } })).toBeNull();
    expect(await prisma.invitation.findUnique({ where: { tokenHash: hashSecretToken(token!) } })).not.toBeNull();

    // Re-sending replaces the hash: the first link is dead.
    const again = (await (
      await invite(
        new Request('http://localhost/api/invitations', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ email: 'invitee@example.test', role: 'MEMBER' }),
        })
      )
    ).json()) as { inviteLink: string };
    const token2 = new URL(again.inviteLink).searchParams.get('token')!;
    expect(token2).not.toBe(token);
    const resent = await prisma.$queryRaw<Array<{ tokenHash: string }>>`
      SELECT "tokenHash" FROM "Invitation" WHERE "tenantId" = ${tenantId}`;
    expect(resent.map((r) => r.tokenHash)).toEqual([hashSecretToken(token2)]);
    expect(await prisma.invitation.findUnique({ where: { tokenHash: hashSecretToken(token!) } })).toBeNull();
  });

  it('a portal link writes; the stored hash and a rotated-away link are refused and write nothing', async () => {
    const workspace = await prisma.workspace.create({ data: { tenantId, name: 'WS', slug: `ws-${suffix()}` } });
    const opp = await prisma.opportunity.create({ data: { tenantId, workspaceId: workspace.id, title: 'Opp' } });
    const part = await prisma.applicationPart.create({
      data: { tenantId, opportunityId: opp.id, part: 'PART_A', content: {} },
    });
    const budget = async () =>
      ((await prisma.applicationPart.findUniqueOrThrow({ where: { id: part.id } })).content as { budget?: unknown[] })
        .budget ?? [];

    const first = await issuePartnerPortalLink(part.id);
    expect(first).not.toBeNull();
    const stored = (await prisma.applicationPart.findUniqueOrThrow({ where: { id: part.id } })).magicTokenHash;
    expect(stored).toBe(hashSecretToken(first!.token));

    // The partner has no session.
    session.current = null;
    await expect(addBudgetLineByToken(first!.token, 'Partner One', 3)).resolves.toMatchObject({ success: true });
    expect(await budget()).toHaveLength(1);

    // Someone holding a copy of the database has only the hash — not a credential.
    await expect(addBudgetLineByToken(stored!, 'Leaked DB', 3)).resolves.toEqual({ success: false });
    expect(await budget()).toHaveLength(1);

    // Rotating revokes the old link.
    session.current = ownerSession(tenantId);
    const second = await issuePartnerPortalLink(part.id);
    session.current = null;
    await expect(addBudgetLineByToken(first!.token, 'Old Link', 3)).resolves.toEqual({ success: false });
    await expect(addBudgetLineByToken(second!.token, 'Partner Two', 2)).resolves.toMatchObject({ success: true });
    expect(await budget()).toHaveLength(2);
  });

  it('Postgres sha256() — what the migration wrote for existing rows — equals the Node hash', async () => {
    const legacy = 'legacy-plain-token-' + suffix();
    const [row] = await prisma.$queryRaw<Array<{ h: string }>>`
      SELECT encode(sha256(convert_to(${legacy}, 'UTF8')), 'hex') AS h`;
    expect(row!.h).toBe(hashSecretToken(legacy));
  });
});
