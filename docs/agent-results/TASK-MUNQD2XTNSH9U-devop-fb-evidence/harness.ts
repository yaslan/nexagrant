// devop-fb İNCELEME-61 re-check: the two lines of src/app/[locale]/fon-hazirlik/actions.ts
// (clientIpFrom(headers) + submitPublicLead(input, { ip })) behind a plain HTTP server,
// so REAL nginx sits in front of the REAL rate-limit code and a REAL (isolated) Postgres.
// Only Next's server-action transport is left out; that transport is unchanged by this card.
// Run from the repo root: DATABASE_URL=<fabrika_app url> OWNER_URL=<owner url> AUTH_SECRET=… pnpm exec tsx <this> 3962
import { createServer } from 'node:http';
import { createDbClient } from '@/lib/db';
import { PUBLIC_LEAD_CONSENT, clientIpFrom, submitPublicLead } from '@/lib/leads/public-lead';

const owner = createDbClient(process.env.OWNER_URL!);
const port = Number(process.argv[2] ?? 3962);

createServer(async (req, res) => {
  const url = new URL(req.url ?? '/', 'http://x');
  const headers = new Headers();
  for (const [k, v] of Object.entries(req.headers)) if (v !== undefined) headers.set(k, Array.isArray(v) ? v.join(', ') : v);
  if (url.pathname === '/lead') {
    const email = url.searchParams.get('email')!;
    const result = await submitPublicLead(
      { name: 'Nginx Check', email, organisation: 'devop-fb qd2', consent: true, consentVersion: PUBLIC_LEAD_CONSENT.version, source: 'fon-hazirlik', locale: 'tr' },
      { ip: clientIpFrom(headers) }
    );
    res.end(JSON.stringify(result));
    return;
  }
  if (url.pathname === '/rows') {
    // Report, then delete, the rows of one scenario — one id at a time.
    const rows = await owner.publicLead.findMany({ where: { email: { startsWith: url.searchParams.get('prefix')! } }, select: { id: true, ipHash: true } });
    let deleted = 0;
    for (const r of rows) deleted += (await owner.publicLead.deleteMany({ where: { id: r.id } })).count;
    const left = await owner.publicLead.count({ where: { email: { startsWith: url.searchParams.get('prefix')! } } });
    res.end(JSON.stringify({ rows: rows.length, distinctIpHash: new Set(rows.filter((r) => r.ipHash).map((r) => r.ipHash)).size, nullIpHash: rows.filter((r) => !r.ipHash).length, deleted, left }));
    return;
  }
  res.statusCode = 404;
  res.end();
}).listen(port, '0.0.0.0', () => console.log(`harness :${port} TRUSTED_PROXY_HOPS=${process.env.TRUSTED_PROXY_HOPS ?? '(unset)'}`));
