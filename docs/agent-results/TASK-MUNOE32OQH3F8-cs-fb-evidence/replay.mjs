// cs-fb İNCELEME-61: replay the captured form POST through REAL nginx 1.30.5 (docs/SMTP-SUNUCU.md §10.1 directive),
// each request from a client container with a chosen IPv4/IPv6 address, with chosen client-sent X-Forwarded-For lines.
// Usage: node replay.mjs <scenario> <n> <ipTemplate {i}> <xffTemplate|- {i}> [xffTemplate2] [--same-email]
import 'dotenv/config';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import pg from 'pg';
const [scenRaw, nStr, ipT, xffT, xffT2, flag] = process.argv.slice(2);
const n = Number(nStr); const scen = scenRaw.toLowerCase();
const cap = JSON.parse(readFileSync('.i61/cap.json', 'utf8'));
const RUN = Date.now().toString(36);
mkdirSync('.i61/req', { recursive: true });
const out = [];
for (let i = 0; i < n; i++) {
  const email = flag === '--same-email' ? `csfb-i61-${scen}-x-${RUN}@example.test` : `csfb-i61-${scen}-${i}-${RUN}@example.test`;
  writeFileSync(`.i61/req/body-${RUN}-${i}`, cap.body.replace('csfb-cap-i61@example.test', email));
  const hs = Object.entries(cap.headers).filter(([k]) => !['content-length', 'host', 'x-forwarded-for', 'origin', 'referer'].includes(k)).map(([k, v]) => `${k}: ${v}`);
  if (xffT && xffT !== '-') hs.push(xffT === 'EMPTY' ? 'X-Forwarded-For;' : `X-Forwarded-For: ${xffT.replaceAll('{i}', i)}`);
  if (xffT2) hs.push(`X-Forwarded-For: ${xffT2.replaceAll('{i}', i)}`);
  const ip = ipT.replaceAll('{i}', (i + 1).toString(16));
  const v6 = ip.includes(':');
  const target = process.env.DIRECT ? 'http://host.docker.internal:3961' : v6 ? 'http://[fd61:61:61:61::10]' : 'http://172.61.0.10';
  writeFileSync(`.i61/req/headers-${RUN}-${i}`, hs.concat([`origin: ${target}`]).join('\n') + '\n');
  const r = spawnSync('docker', ['run', '--rm', '--add-host', 'host.docker.internal:host-gateway', '--network', 'csfb-i61-net', v6 ? '--ip6' : '--ip', ip, '-v', `${process.cwd()}/.i61/req:/r:ro`, '--entrypoint', 'curl', 'nginx:1.30.5',
    '-s', '-g', '-H', `@/r/headers-${RUN}-${i}`, '--data-binary', `@/r/body-${RUN}-${i}`, `${target}${cap.path}`], { encoding: 'utf8' });
  out.push(/rate_limited/.test(r.stdout) ? 'rate_limited' : /"ok":true/.test(r.stdout) ? 'ok' : `other(${r.stdout.split("\n").slice(2).join(" ").slice(0, 160)})`);
}
const db = new pg.Client({ connectionString: process.env.DATABASE_URL }); await db.connect();
const rows = (await db.query(`SELECT id, "ipHash" FROM "PublicLead" WHERE email LIKE $1`, [`csfb-i61-${scen}-%-${RUN}@example.test`])).rows;
const hashes = new Set(rows.map((x) => x.ipHash ?? 'NULL'));
console.log(`${scen}: ${out.join(',')}\n   stored rows=${rows.length} distinct ipHash=${[...hashes].filter((h) => h !== 'NULL').length} null ipHash=${rows.filter((x) => !x.ipHash).length}`);
let del = 0;
for (const x of rows) { const d = await db.query('DELETE FROM "PublicLead" WHERE id=$1', [x.id]); del += d.rowCount; }
const left = (await db.query(`SELECT count(*)::int n FROM "PublicLead" WHERE email LIKE $1`, [`%-${RUN}@example.test`])).rows[0].n;
console.log(`   cleanup: ${del}/${rows.length} deleted one id at a time · left=${left}`);
await db.end();
