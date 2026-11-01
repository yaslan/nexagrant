/**
 * PROBE 1 — TASK-MTSYCMWFL22CA
 * Does a shared-corpus (tenantId NULL) ingest actually store rows at HEAD,
 * measured through the NOBYPASSRLS `fabrika_app` role, against the live DB?
 *
 * Runs the REAL `ingestDocument` from src/lib/rag.ts. DATABASE_URL is pointed
 * at DATABASE_URL_RLS_TEST before anything imports @/lib/db, so the singleton
 * prisma client opens as fabrika_app.
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

const MARK = `PROBE-MTSYCMWFL22CA-${Date.now()}`;

async function main() {
  const raw = new pg.Client({ connectionString: appUrl });
  await raw.connect();

  const caps = await raw.query(
    `select current_user, rolsuper, rolbypassrls from pg_roles where rolname = current_user`
  );
  console.log('--- 1. connected role capabilities ---');
  console.table(caps.rows);

  const pol = await raw.query(
    `select tablename, policyname, cmd, qual, with_check
       from pg_policies where tablename in ('Document','Chunk') order by tablename`
  );
  console.log('--- 2. live policies on Document/Chunk ---');
  console.log(JSON.stringify(pol.rows, null, 2));

  // 3. run the real ingest path
  const { ingestDocument } = await import('@/lib/rag');
  console.log('--- 3. ingestDocument(shared corpus, tenantId=undefined) ---');
  let returned: string | undefined;
  let threw: unknown;
  try {
    returned = await ingestDocument(
      `${MARK} title`,
      `${MARK} body — bir paylasilan korpus belgesi.`,
      'CORDIS_PROJECT'
    );
  } catch (e) {
    threw = e;
  }
  console.log('returned docId :', returned);
  console.log('threw          :', threw ? String(threw) : '(no throw)');

  // 4. raw SELECT: is it really there?
  console.log('--- 4. raw SELECT as fabrika_app (app.tenant_id unset) ---');
  const docs = await raw.query(
    `select id, "tenantId", kind, title from "Document" where title like $1`,
    [`${MARK}%`]
  );
  console.log('Document rows:', docs.rowCount);
  console.table(docs.rows);
  const chunks = await raw.query(
    `select c.id, c."tenantId", c.ordinal, left(c.text, 40) as text_head,
            (c.embedding is not null) as has_embedding
       from "Chunk" c join "Document" d on d.id = c."documentId"
      where d.title like $1 order by c.ordinal`,
    [`${MARK}%`]
  );
  console.log('Chunk rows:', chunks.rowCount);
  console.table(chunks.rows);

  console.log('--- 5. does the returned id match a stored row? ---');
  const match = await raw.query(`select count(*)::int as n from "Document" where id = $1`, [
    returned ?? '',
  ]);
  console.log(`Document with id "${returned}" exists:`, match.rows[0].n === 1);

  // cleanup
  const del = await raw.query(
    `delete from "Chunk" where "documentId" in (select id from "Document" where title like $1)`,
    [`${MARK}%`]
  );
  const del2 = await raw.query(`delete from "Document" where title like $1`, [`${MARK}%`]);
  console.log('--- 6. cleanup: chunks deleted', del.rowCount, ', documents deleted', del2.rowCount);

  await raw.end();
}

main().then(
  () => process.exit(0),
  (e) => {
    console.error('PROBE FAILED:', e);
    process.exit(1);
  }
);
