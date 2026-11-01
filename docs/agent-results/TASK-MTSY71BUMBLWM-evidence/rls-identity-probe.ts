import 'dotenv/config';
import { createDbClient } from '/Users/macbook/AgentSpace/fabrika/src/lib/db';

/**
 * Targeted isolation measurement for TenantBillingIdentity: a row written for
 * tenant A must be invisible in tenant B's context. Run under the RLS-subject
 * role — the app role bypasses RLS and would report a false pass.
 */
const url = process.env.DATABASE_URL_RLS_TEST;
if (!url) { console.error('DATABASE_URL_RLS_TEST not set'); process.exit(1); }
const A = 'demo-tenant';
const B = 'cmtrhjys10001ncxk13gwtbcb';
const db = createDbClient(url);

(async () => {
  const who = await db.$queryRawUnsafe<any[]>(
    `select current_user, (select rolbypassrls from pg_roles where rolname=current_user) as bypass`);
  console.log('measuring role:', who[0]);

  try {
    await db.$transaction(async (tx) => {
      await tx.$executeRawUnsafe(`select set_config('app.tenant_id', '${A}', true)`);
      await tx.$executeRawUnsafe(
        `insert into "TenantBillingIdentity" ("tenantId","buyerName","buyerVknTckn","buyerTaxOffice","buyerAddress","buyerCity","buyerCountry","createdAt","updatedAt")
         values ('${A}','RLS Probe A.Ş.','1000000000','Maslak VD','Test Cad 1','İstanbul','TR', now(), now())
         on conflict ("tenantId") do update set "buyerName"='RLS Probe A.Ş.'`);
      const own = await tx.$queryRawUnsafe<any[]>(`select "tenantId","buyerVknTckn" from "TenantBillingIdentity"`);
      console.log(`own context (${A}) sees:`, own.length, own);

      await tx.$executeRawUnsafe(`select set_config('app.tenant_id', '${B}', true)`);
      const other = await tx.$queryRawUnsafe<any[]>(`select "tenantId","buyerVknTckn" from "TenantBillingIdentity"`);
      console.log(`OTHER tenant context (${B}) sees:`, other.length, other);

      await tx.$executeRawUnsafe(`select set_config('app.tenant_id', '', true)`);
      const none = await tx.$queryRawUnsafe<any[]>(`select "tenantId" from "TenantBillingIdentity"`);
      console.log('no tenant context sees:', none.length);

      console.log(other.length === 0 && none.length === 0 && own.length === 1
        ? '✅ TenantBillingIdentity: own=1, cross-tenant=0, unscoped=0 — isolation holds'
        : '❌ LEAK or unexpected count');
      throw new Error('__rollback__'); // never persist the probe row
    });
  } catch (e: any) {
    if (e?.message !== '__rollback__') throw e;
    console.log('(probe row rolled back)');
  }
  await db.$disconnect();
})();
