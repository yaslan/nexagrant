/**
 * PROBE 2 — TASK-MTSYCMWFL22CA
 * The refutation probe. Runs the real shared-corpus ingest caller
 * (`syncCordisBigData`) against the live DB as `fabrika_app` and prints, side
 * by side, what the flow REPORTED and what was actually STORED.
 *
 * Run it twice: once at HEAD (control) and once with the Chunk INSERT in
 * src/lib/rag.ts deliberately broken (mutation). A flow that reports success
 * over zero stored rows is the defect this card names.
 */
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import pg from 'pg';

function dotenv(): Record<string, string> {
  const p = resolve(process.cwd(), '.env');
  if (!existsSync(p)) return {};
  const out: Record<string, string> = {};
  for (const line of readFileSync(p, 'utf8').split('\n')) {
    const t = line.trim();
    if (!t || t.startsWith('#')) continue;
    const eq = t.indexOf('=');
    if (eq === -1) continue;
    out[t.slice(0, eq)] = t.slice(eq + 1).replace(/^["']|["']$/g, '');
  }
  return out;
}

const env = dotenv();
const appUrl = env.DATABASE_URL_RLS_TEST;
if (!appUrl) throw new Error('DATABASE_URL_RLS_TEST yok');
process.env.DATABASE_URL = appUrl;
process.env.OPENAI_API_KEY = '';

const LABEL = process.argv[2] ?? 'run';
const PID = `PROBE-MTSYCMWFL22CA-${LABEL}`;

async function main() {
  const raw = new pg.Client({ connectionString: appUrl });
  await raw.connect();
  const { syncCordisBigData } = await import('@/lib/cordis-sync');

  console.log(`=== ${LABEL} : syncCordisBigData with 1 record (shared corpus) ===`);
  const result = await syncCordisBigData([
    {
      projectId: PID,
      title: `${PID} — solid-state battery thermal management`,
      acronym: 'PROBEACR',
      objectiveText: 'Probe objective text for the shared corpus ingest measurement.',
      ecContributionEUR: 1234567,
      coordinatorName: 'Probe Institute',
      coordinatorCountry: 'TR',
      topicCode: 'PROBE-TOPIC-01',
    },
  ]);
  console.log('REPORTED:', JSON.stringify(result, null, 2));

  const docs = await raw.query(
    `select id, "tenantId", kind, title from "Document" where title like $1`,
    [`%${PID}%`]
  );
  const chunks = await raw.query(
    `select count(*)::int as n from "Chunk" c join "Document" d on d.id = c."documentId"
      where d.title like $1`,
    [`%${PID}%`]
  );
  console.log('STORED Document rows :', docs.rowCount);
  console.table(docs.rows);
  console.log('STORED Chunk rows    :', chunks.rows[0].n);

  // Alerts are matched on this run's own project id inside `meta`, not counted
  // as a table-wide delta: this is a shared development database and other
  // agents' jobs write alerts concurrently. `recordAlert` also dedups against
  // any unresolved alert with the same identity and has no time bound, so a
  // "created since T" filter reports zero for an alert that was genuinely
  // raised — that artefact cost this probe one false negative earlier today.
  const alerts = await raw.query(
    `select level, source, left(message, 70) as message from "SystemAlert"
      where meta::text like $1 order by "createdAt"`,
    [`%${PID}%`]
  );
  const newAlerts = alerts.rowCount ?? 0;
  console.log('SystemAlert rows naming this run\'s record :', newAlerts);
  console.table(alerts.rows);

  console.log('--- VERDICT ---');
  console.log(
    `reported synced=${result.syncedProjectsCount} skipped=${result.skippedCount} success=${result.success} | actually stored documents=${docs.rowCount} chunks=${chunks.rows[0].n} | new alerts=${newAlerts}`
  );

  // cleanup — every probe row this run created
  await raw.query(
    `delete from "Chunk" where "documentId" in (select id from "Document" where title like $1)`,
    [`%${PID}%`]
  );
  await raw.query(`delete from "Document" where title like $1`, [`%${PID}%`]);
  await raw.query(`delete from "CordisProject" where id = $1`, [PID]);
  const alertCleanup = await raw.query(
    `delete from "SystemAlert" where message like $1 or (meta::text like $1)`,
    ['%PROBE-MTSYCMWFL22CA%']
  );
  console.log('cleanup: probe alerts deleted', alertCleanup.rowCount);
  console.log('cleanup done');
  await raw.end();
}

main().then(
  () => process.exit(0),
  (e) => {
    console.error('PROBE FAILED:', e);
    process.exit(1);
  }
);
