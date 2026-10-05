// Deterministic disjoint-tenant race + fail-closed check, real Postgres (fabrika_app) + real SMTP (mailpit).
// Usage: tsx i69/race.ts <I1|I2|I3> <scenario-prefix>
import { createDbClient, withTenant } from '@/lib/db';
import { smtpMailer } from '@/lib/email/mailer';
import { sendStaleRelationshipReminders } from '@/lib/relationships/stale-reminder';
const admin = createDbClient(process.env.OWNER_URL!);
const DAY = 86_400_000;
const NOW = new Date('2026-10-03T07:00:00.000Z');
const [mode, s] = process.argv.slice(2) as [string, string];
const A = `i69-${s}-a`, B = `i69-${s}-b`, U = `u69-${s}`;

async function seed() {
  for (const id of [A, B]) {
    await admin.tenant.create({ data: { id, name: id, slug: id, country: 'TR' } });
    await admin.workspace.create({ data: { tenantId: id, name: 'Ana', slug: `ws-${id}` } });
    await admin.subscription.create({ data: { tenantId: id, planId: 'pro', status: 'ACTIVE' } });
    await admin.moduleState.create({ data: { tenantId: id, moduleId: 'M4', status: 'ON' } });
  }
  await admin.user.create({ data: { id: U, email: `${U}@example.test` } });
  for (const id of [A, B]) {
    await admin.membership.create({ data: { tenantId: id, userId: U } });
    await admin.relationship.create({ data: { tenantId: id, kind: 'partner', ownerUserId: U, counterpartName: `${id}-row`, lastContactAt: new Date(NOW.getTime() - 61 * DAY) } });
  }
}

/** runTenant that parks the run right after its claim (2nd call for the tenant) until `gate` opens. */
function parkedAfterClaim(gate: Promise<void>, arrived: () => void): typeof withTenant {
  let calls = 0;
  return (async (tenantId: string, fn: never) => {
    const r = await (withTenant as any)(tenantId, fn);
    if (++calls === 2) { arrived(); await gate; }
    return r;
  }) as unknown as typeof withTenant;
}

const run = (tenantIds: string[], runTenant?: typeof withTenant) =>
  sendStaleRelationshipReminders({ mailer: smtpMailer(), appUrl: 'http://x', now: NOW, tenantIds, runTenant });
const pick = (r: Awaited<ReturnType<typeof run>>) =>
  ({ digestsSent: r.digestsSent, skippedMailedToday: r.skippedMailedToday, digestsFailed: r.digestsFailed, errors: r.errors.map((e) => e.reason.split('\n').pop()?.slice(0, 90)) });

async function main() {
  await seed();
  if (mode === 'I1') {
    // Run A sees only tenant a, run B only tenant b (each skips the other's tenant); both claim, then both check.
    let n = 0; let open!: () => void; const gate = new Promise<void>((r) => (open = r));
    const arrived = () => { if (++n === 2) open(); };
    const [ra, rb] = await Promise.all([run([A], parkedAfterClaim(gate, arrived)), run([B], parkedAfterClaim(gate, arrived))]);
    console.log('I1 A', JSON.stringify(pick(ra)), '\nI1 B', JSON.stringify(pick(rb)));
  } else if (mode === 'I2') {
    const ra = await run([A]); const rb = await run([B]);
    console.log('I2 A', JSON.stringify(pick(ra)), '\nI2 B', JSON.stringify(pick(rb)));
  } else if (mode === 'I3') {
    await admin.$executeRawUnsafe('REVOKE EXECUTE ON FUNCTION public.enter_system_scope(text) FROM fabrika_app');
    try { console.log('I3', JSON.stringify(pick(await run([A, B])))); }
    finally { await admin.$executeRawUnsafe('GRANT EXECUTE ON FUNCTION public.enter_system_scope(text) TO fabrika_app'); }
  }
  const claims = await admin.membership.findMany({ where: { userId: U }, select: { tenantId: true, staleDigestOn: true }, orderBy: { tenantId: 'asc' } });
  console.log('claims', JSON.stringify(claims));
}
main().then(() => process.exit(0), (e) => { console.error(e); process.exit(1); });
