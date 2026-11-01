/**
 * PROBE 3 — TASK-MTSYCMWFL22CA
 * The other half of the shared corpus: POST /api/admin/documents/upload →
 * `processPdfAndStore` (src/lib/ai/rag.ts). A PDF that carries no extractable
 * text (a scan, an image-only page) produces zero chunks. Does the route
 * report that as a success?
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

/** A valid single-page PDF with no text operators at all. */
function emptyPdf(): Buffer {
  const objs = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << >> >>',
  ];
  let pdf = '%PDF-1.4\n';
  const offsets: number[] = [];
  objs.forEach((body, i) => {
    offsets.push(Buffer.byteLength(pdf, 'latin1'));
    pdf += `${i + 1} 0 obj\n${body}\nendobj\n`;
  });
  const xref = Buffer.byteLength(pdf, 'latin1');
  pdf += `xref\n0 ${objs.length + 1}\n0000000000 65535 f \n`;
  for (const o of offsets) pdf += `${String(o).padStart(10, '0')} 00000 n \n`;
  pdf += `trailer\n<< /Size ${objs.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return Buffer.from(pdf, 'latin1');
}

const TITLE = `PROBE-MTSYCMWFL22CA-upload-${Date.now()}`;

async function main() {
  const raw = new pg.Client({ connectionString: appUrl });
  await raw.connect();

  const { processPdfAndStore } = await import('@/lib/ai/rag');

  console.log('=== processPdfAndStore(text-free PDF, tenantId=null) ===');
  let returned: unknown;
  let threw: unknown;
  try {
    returned = await processPdfAndStore(emptyPdf(), null, 'SHARED_PDF', TITLE);
  } catch (e) {
    threw = e;
  }
  console.log('returned :', JSON.stringify(returned));
  console.log('threw    :', threw ? String(threw) : '(no throw — the route would answer 200 {success:true})');

  const docs = await raw.query(`select id, "tenantId", kind, title from "Document" where title = $1`, [TITLE]);
  const chunks = await raw.query(
    `select count(*)::int as n from "Chunk" c join "Document" d on d.id = c."documentId" where d.title = $1`,
    [TITLE]
  );
  console.log('STORED Document rows :', docs.rowCount);
  console.table(docs.rows);
  console.log('STORED Chunk rows    :', chunks.rows[0].n, ' <- retrievable content');

  await raw.query(`delete from "Chunk" where "documentId" in (select id from "Document" where title = $1)`, [TITLE]);
  const d = await raw.query(`delete from "Document" where title = $1`, [TITLE]);
  console.log('cleanup: documents deleted', d.rowCount);
  await raw.end();
}

main().then(
  () => process.exit(0),
  (e) => {
    console.error('PROBE FAILED:', e);
    process.exit(1);
  }
);
