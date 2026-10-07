import { afterAll, beforeAll, describe, expect, test, vi } from 'vitest';

/**
 * Evidence-expiring producer (ADR-0011 §2.2, TASK-MUVR7HQQZVA2Z) — real Postgres,
 * the `fabrika_app` role (NOBYPASSRLS).
 *
 * The producer runs as fabrika_app through the singleton (swapped below, as in
 * notifications.live.test.ts), so a read or write outside the tenant's scope
 * finds nothing instead of passing on a superuser. Fixtures and read-backs go
 * through the owner role. Every row is tagged with this run's tenants and the
 * run is limited to them (`tenantIds`), so the file is safe on a shared DB.
 *
 * Mutant (docs/agent-results/TASK-MUVR7HQQZVA2Z-be-fb.md): without the dedupeKey
 * the second run writes every row again and "a rerun writes nothing" goes red.
 */
const { rlsUrl: RLS_URL, ownerUrl: OWNER_URL } = await vi.hoisted(async () => {
  const { readFileSync, existsSync } = await import('node:fs');
  const { resolve } = await import('node:path');
  const path = resolve(process.cwd(), '.env');
  const read = (key: string): string | undefined => {
    if (!existsSync(path)) return undefined;
    for (const line of readFileSync(path, 'utf8').split('\n')) {
      const t = line.trim();
      const i = t.indexOf('=');
      if (i > 0 && t.slice(0, i) === key) {
        const v = t.slice(i + 1).replace(/^["']|["']$/g, '');
        return v || undefined;
      }
    }
    return undefined;
  };
  const ownerUrl = process.env.DATABASE_URL ?? read('DATABASE_URL');
  const rlsUrl = process.env.DATABASE_URL_RLS_TEST ?? read('DATABASE_URL_RLS_TEST');
  if (rlsUrl) process.env.DATABASE_URL = rlsUrl;
  return { rlsUrl, ownerUrl };
});

import { createDbClient, prisma, withTenant, type TenantTx } from '@/lib/db';
import { evidenceBadge, EXPIRING_SOON_DAYS } from '@/lib/evidence-status';
import { EVIDENCE_EXPIRING_PAGE_SIZE, notifyExpiringEvidence } from '@/lib/notifications/evidence-expiring';
import { assertRlsSubjectRole, requireRlsTestUrl, skipOrFailInCi } from './helpers/live-db-role';
import { presentIds, requireId } from './helpers/teardown-guard';

const admin = createDbClient(OWNER_URL ?? 'postgresql://fabrika:fabrika@localhost:5432/fabrika');
const SUITE = 'evidence-expiring live test';

const HAS_DB =
  requireRlsTestUrl(RLS_URL, SUITE) !== undefined &&
  (await admin.$queryRaw`SELECT 1`.then(() => true).catch(() => false));
if (RLS_URL && !HAS_DB) skipOrFailInCi(SUITE, 'Postgres is unreachable (`docker compose up -d`)');
if (HAS_DB) await assertRlsSubjectRole(prisma, SUITE);

const RUN = `evexp-${Math.random().toString(36).slice(2, 10)}`;
const DAY = 24 * 3600 * 1000;
const NOW = new Date();
const inDays = (d: number) => new Date(NOW.getTime() + d * DAY);

type Who = 'owner' | 'member' | 'left' | 'ownerB';
type Doc = 'byMember' | 'bySystem' | 'byLeft' | 'far' | 'unverified' | 'rejected' | 'expired' | 'inB';

const fx: {
  tenantA?: string;
  tenantB?: string;
  users: Partial<Record<Who, string>>;
  docs: Partial<Record<Doc, string>>;
} = { users: {}, docs: {} };

const run = () =>
  notifyExpiringEvidence({ now: NOW, tenantIds: presentIds([fx.tenantA, fx.tenantB]) });

/** Every notification of this run's tenants, read through the owner role. */
async function rows() {
  return admin.notification.findMany({
    where: { tenantId: { in: presentIds([fx.tenantA, fx.tenantB]) } },
    select: { tenantId: true, userId: true, type: true, payload: true, dedupeKey: true },
    orderBy: { dedupeKey: 'asc' },
  });
}

const evidenceOf = (r: { payload: unknown }) => (r.payload as { evidenceId?: string }).evidenceId;

describe.skipIf(!HAS_DB)('evidence-expiring producer (live, fabrika_app)', () => {
  beforeAll(async () => {
    const a = await admin.tenant.create({ data: { name: `${RUN} a`, slug: `${RUN}-a`, country: 'TR' } });
    const b = await admin.tenant.create({ data: { name: `${RUN} b`, slug: `${RUN}-b`, country: 'TR' } });
    fx.tenantA = a.id;
    fx.tenantB = b.id;
    for (const who of ['owner', 'member', 'left', 'ownerB'] as Who[]) {
      const u = await admin.user.create({ data: { email: `${who}@${RUN}.test`, name: `${RUN} ${who}` } });
      fx.users[who] = u.id;
    }
    const id = (w: Who) => requireId(fx.users[w], w);
    // `left` uploaded a document and is no longer a member of A.
    await admin.membership.createMany({
      data: [
        { tenantId: a.id, userId: id('owner'), role: 'TENANT_OWNER' },
        { tenantId: a.id, userId: id('member'), role: 'MEMBER' },
        { tenantId: b.id, userId: id('ownerB'), role: 'TENANT_OWNER' },
      ],
    });

    const docs: Array<[Doc, string, string, string, Date]> = [
      // name, tenant, createdBy, status, validUntil
      ['byMember', a.id, id('member'), 'VALID', inDays(10)],
      ['bySystem', a.id, 'system', 'EXPIRING_SOON', inDays(EXPIRING_SOON_DAYS - 1)],
      ['byLeft', a.id, id('left'), 'VALID', inDays(5)],
      ['far', a.id, id('member'), 'VALID', inDays(EXPIRING_SOON_DAYS + 5)],
      ['unverified', a.id, id('member'), 'UNVERIFIED', inDays(10)],
      ['rejected', a.id, id('member'), 'REJECTED', inDays(10)],
      ['expired', a.id, id('member'), 'VALID', inDays(-2)],
      ['inB', b.id, id('ownerB'), 'VALID', inDays(3)],
    ];
    for (const [name, tenantId, createdBy, status, validUntil] of docs) {
      const e = await admin.evidence.create({
        data: { tenantId, kind: 'certificate', title: `${RUN} ${name}`, body: '', createdBy, status, validUntil },
      });
      fx.docs[name] = e.id;
    }
  });

  afterAll(async () => {
    await admin.notification.deleteMany({ where: { tenantId: { in: presentIds([fx.tenantA, fx.tenantB]) } } });
    await admin.evidence.deleteMany({ where: { tenantId: { in: presentIds([fx.tenantA, fx.tenantB]) } } });
    for (const id of presentIds([fx.tenantA, fx.tenantB])) await admin.tenant.delete({ where: { id } });
    for (const id of presentIds(Object.values(fx.users))) await admin.user.delete({ where: { id } });
    await admin.$disconnect();
  });

  test('a document the badge calls EXPIRING_SOON gets exactly one notification, to the right person', async () => {
    const r = await run();
    expect(r.tenantsFailed).toBe(0);
    expect(r.errors).toEqual([]);

    const got = (await rows()).map((n) => ({ userId: n.userId, evidenceId: evidenceOf(n) }));
    const d = (k: Doc) => requireId(fx.docs[k], k);
    const u = (w: Who) => requireId(fx.users[w], w);
    expect(got).toHaveLength(4);
    expect(got).toEqual(
      expect.arrayContaining([
        { userId: u('member'), evidenceId: d('byMember') }, // the uploader
        { userId: u('owner'), evidenceId: d('bySystem') }, // 'system' → owners
        { userId: u('owner'), evidenceId: d('byLeft') }, // uploader left → owners
        { userId: u('ownerB'), evidenceId: d('inB') },
      ])
    );
    expect(r.documentsDue).toBe(4);
    expect(r.notificationsWritten).toBe(4);

    // The bell and the badge agree on every fixture.
    const all = await admin.evidence.findMany({
      where: { tenantId: { in: presentIds([fx.tenantA, fx.tenantB]) } },
      select: { id: true, status: true, validUntil: true },
    });
    const notified = new Set(got.map((g) => g.evidenceId));
    for (const e of all) expect(notified.has(e.id)).toBe(evidenceBadge(e, NOW).kind === 'EXPIRING_SOON');
  });

  test('payload carries ids and the date only; type and dedupeKey are the documented ones', async () => {
    const byMember = requireId(fx.docs.byMember, 'byMember');
    const row = (await rows()).find((n) => evidenceOf(n) === byMember);
    const validUntil = inDays(10).toISOString();
    expect(row?.type).toBe('EVIDENCE_EXPIRING');
    expect(row?.payload).toEqual({ evidenceId: byMember, validUntil });
    expect(row?.dedupeKey).toBe(`evidence-expiring:${byMember}:${validUntil}`);
  });

  test('a rerun writes nothing', async () => {
    const before = await rows();
    const r = await run();
    expect(r.notificationsWritten).toBe(0);
    expect(r.notificationsSkipped).toBe(4);
    expect(await rows()).toEqual(before);
  });

  test("tenant B's owner gets no notification for tenant A's documents", async () => {
    const ownerB = requireId(fx.users.ownerB, 'ownerB');
    const theirs = (await rows()).filter((n) => n.userId === ownerB);
    expect(theirs.map(evidenceOf)).toEqual([requireId(fx.docs.inB, 'inB')]);
    expect(theirs.every((n) => n.tenantId === fx.tenantB)).toBe(true);
  });

  test('a renewed document (new validUntil) is warned again under a new dedupeKey', async () => {
    const byMember = requireId(fx.docs.byMember, 'byMember');
    await admin.evidence.update({ where: { id: byMember }, data: { validUntil: inDays(20) } });
    const r = await run();
    expect(r.notificationsWritten).toBe(1);
    const mine = (await rows()).filter((n) => evidenceOf(n) === byMember);
    expect(mine).toHaveLength(2);
    expect(new Set(mine.map((n) => n.dedupeKey)).size).toBe(2);
    expect(mine.every((n) => n.userId === fx.users.member)).toBe(true);
  });
});

/**
 * A large tenant (TASK-MUXODEF0OKBGR). Before batching, every (document,
 * recipient) row was its own insert inside one tenant transaction: at 6000
 * documents uploaded by 'system' with 3 owners (18 000 rows) the transaction
 * passed Prisma's 5 s limit, every write was rolled back, and the tenant was
 * never told — the next day failed the same way.
 *
 * Mutants (docs/agent-results/TASK-MUXODEF0OKBGR-be-fb.md): one insert per row in a
 * single transaction → tenantsFailed 1, written 0; batched but one transaction for
 * the whole tenant → the transaction count goes red; one transaction per page but one
 * insert per row → the insert count goes red (TASK-MUXODEF0OKBGR-crw2-fb.md Ö-1).
 */
const LOAD_DOCS = 6000;
const LOAD_OWNERS = 3;

describe.skipIf(!HAS_DB)('evidence-expiring producer — a large tenant (live, fabrika_app)', () => {
  const load: { tenant?: string; owners: string[] } = { owners: [] };
  // Counts the transactions: one per page of documents, never one for the whole tenant.
  let transactions = 0;
  // Counts the notification insert calls: one per page, never one per (document, recipient).
  let inserts = 0;
  const countInserts = (tx: TenantTx): TenantTx =>
    new Proxy(tx, {
      get(target, prop, receiver) {
        const value = Reflect.get(target, prop, receiver);
        if (prop !== 'notification') return value;
        return new Proxy(value, {
          get(model, key, r) {
            const fn = Reflect.get(model, key, r);
            if (key !== 'createMany') return fn;
            return (...args: unknown[]) => {
              inserts++;
              return fn.apply(model, args);
            };
          },
        });
      },
    });
  const runLoad = () =>
    notifyExpiringEvidence({
      now: NOW,
      tenantIds: presentIds([load.tenant]),
      runTenant: (id, cb) => {
        transactions++;
        return withTenant(id, (tx) => cb(countInserts(tx)));
      },
    });

  beforeAll(async () => {
    const t = await admin.tenant.create({ data: { name: `${RUN} load`, slug: `${RUN}-load`, country: 'TR' } });
    load.tenant = t.id;
    for (let i = 0; i < LOAD_OWNERS; i++) {
      const u = await admin.user.create({ data: { email: `load-owner${i}@${RUN}.test`, name: `${RUN} load ${i}` } });
      load.owners.push(u.id);
    }
    await admin.membership.createMany({
      data: load.owners.map((userId) => ({ tenantId: t.id, userId, role: 'TENANT_OWNER' as const })),
    });
    await admin.evidence.createMany({
      data: Array.from({ length: LOAD_DOCS }, (_, i) => ({
        tenantId: t.id,
        kind: 'certificate',
        title: `${RUN} load ${i}`,
        body: '',
        createdBy: 'system',
        status: 'VALID',
        validUntil: inDays(1 + (i % (EXPIRING_SOON_DAYS - 2))),
      })),
    });
  }, 120_000);

  afterAll(async () => {
    await admin.notification.deleteMany({ where: { tenantId: { in: presentIds([load.tenant]) } } });
    await admin.evidence.deleteMany({ where: { tenantId: { in: presentIds([load.tenant]) } } });
    for (const id of presentIds([load.tenant])) await admin.tenant.delete({ where: { id } });
    for (const id of presentIds(load.owners)) await admin.user.delete({ where: { id } });
  }, 120_000);

  test(`${LOAD_DOCS} documents × ${LOAD_OWNERS} owners are written in one run; a rerun writes nothing`, async () => {
    const first = await runLoad();
    expect({ failed: first.tenantsFailed, errors: first.errors.map((e) => e.reason.slice(0, 160)) }).toEqual({
      failed: 0,
      errors: [],
    });
    expect(first.documentsDue).toBe(LOAD_DOCS);
    // Every full page and the empty one that ends the scan.
    expect(transactions).toBe(Math.floor(LOAD_DOCS / EVIDENCE_EXPIRING_PAGE_SIZE) + 1);
    // One insert statement per non-empty page, never one per (document, recipient).
    expect(inserts).toBe(Math.ceil(LOAD_DOCS / EVIDENCE_EXPIRING_PAGE_SIZE));
    expect(first.notificationsWritten).toBe(LOAD_DOCS * LOAD_OWNERS);
    expect(await admin.notification.count({ where: { tenantId: requireId(load.tenant, 'load') } })).toBe(
      LOAD_DOCS * LOAD_OWNERS
    );

    const second = await runLoad();
    expect(second.tenantsFailed).toBe(0);
    expect(second.notificationsWritten).toBe(0);
    expect(second.notificationsSkipped).toBe(LOAD_DOCS * LOAD_OWNERS);
  }, 120_000);
});
