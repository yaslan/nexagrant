// İNCELEME-69 fixture seed (owner connection). Usage: tsx i69/seed.ts
import { createDbClient } from '@/lib/db';
const admin = createDbClient(process.env.OWNER_URL!);
const DAY = 86_400_000;
const T0 = new Date('2026-09-30T07:00:00.000Z');
const LATE = new Date(T0.getTime() - 60 * DAY + 20 * 60_000); // stale at 07:20
const DUE = new Date(T0.getTime() - 61 * DAY);
const NOON = new Date(Date.parse('2026-09-30T12:00:00.000Z') - 60 * DAY); // stale at 12:00
const MID_D = new Date(Date.parse('2026-09-30T23:59:59.999Z') - 61 * DAY);
const MID_LATE = new Date(Date.parse('2026-10-01T00:00:00.000Z') - 60 * DAY); // stale exactly at midnight

async function tenant(id: string) {
  await admin.tenant.create({ data: { id, name: id, slug: id, country: 'TR' } });
  await admin.workspace.create({ data: { tenantId: id, name: 'Ana', slug: `ws-${id}` } });
  await admin.subscription.create({ data: { tenantId: id, planId: 'pro', status: 'ACTIVE' } });
  await admin.moduleState.create({ data: { tenantId: id, moduleId: 'M4', status: 'ON' } });
}
async function user(id: string) { await admin.user.create({ data: { id, email: `${id}@example.test`, locale: 'tr' } }); }
async function member(tenantId: string, userId: string) { await admin.membership.create({ data: { tenantId, userId } }); }
async function rel(tenantId: string, owner: string, lastContactAt: Date, name: string) {
  await admin.relationship.create({ data: { tenantId, kind: 'partner', ownerUserId: owner, counterpartName: name, lastContactAt } });
}

async function main() {
  // S0 control, S1 M4 closed, S2 pilot over, S3 tenant read fails, S7 removed, S8 TZ
  for (const s of ['s0', 's1', 's2', 's3', 's7']) {
    await tenant(`i69-${s}-a`); await tenant(`i69-${s}-b`); await user(`u69-${s}`);
    await member(`i69-${s}-a`, `u69-${s}`); await member(`i69-${s}-b`, `u69-${s}`);
    await rel(`i69-${s}-b`, `u69-${s}`, DUE, `${s}-d-X65`);
    await rel(`i69-${s}-a`, `u69-${s}`, LATE, `${s}-e-XLATE`);
  }
  // S6 new tenant: only a at first; c created + joined between runs (mutate.ts)
  await tenant('i69-s6-a'); await user('u69-s6'); await member('i69-s6-a', 'u69-s6');
  await rel('i69-s6-a', 'u69-s6', DUE, 's6-d-X65');
  // S4 midnight
  await tenant('i69-s4-a'); await tenant('i69-s4-b'); await user('u69-s4');
  await member('i69-s4-a', 'u69-s4'); await member('i69-s4-b', 'u69-s4');
  await rel('i69-s4-b', 'u69-s4', MID_D, 's4-d-MIDNIGHT');
  await rel('i69-s4-a', 'u69-s4', MID_LATE, 's4-e-AFTERMID');
  // S5 race: 30 users x 2 tenants, due at 12:00
  await tenant('i69-s5-a'); await tenant('i69-s5-b');
  for (let i = 0; i < 30; i++) {
    const u = `u69-s5-${String(i).padStart(2, '0')}`;
    await user(u); await member('i69-s5-a', u); await member('i69-s5-b', u);
    await rel('i69-s5-a', u, NOON, `${u}-a`); await rel('i69-s5-b', u, NOON, `${u}-b`);
  }
  console.log('seeded');
}
main().finally(() => admin.$disconnect());
