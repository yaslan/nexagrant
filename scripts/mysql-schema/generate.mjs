#!/usr/bin/env node
// FO-375 — MySQL/MariaDB schema build.
//
// prisma/schema.prisma (PostgreSQL) stays the single source of truth and is NOT modified.
// This script derives three committed artifacts from it, with no database connection:
//
//   prisma/mysql/schema.prisma   Prisma schema for the MariaDB client (rewrites below)
//   prisma/mysql/init.sql        DDL from `prisma migrate diff --from-empty`, adapted for MariaDB
//   prisma/mysql/init.down.sql   drops every table init.sql creates (reverse order)
//
//   node scripts/mysql-schema/generate.mjs           # rewrite the three files
//   node scripts/mysql-schema/generate.mjs --check   # exit 1 if any committed file is stale
//
// Rewrites of the schema (decided in the FO-375 lead decision, 03.11):
//   * datasource postgresql + `extensions = [vector]`  → mysql, no extensions
//   * `String[]` / `Int[]` scalar lists               → `Json`; validated at the app edge with Zod.
//                                                       `@default([])` → `@default("[]")`
//   * `@db.Text`                                       → `@db.LongText`
//   * `Unsupported("vector(N)")`                       → `Json` placeholder (vector index is Faz 4)
//   * generator output → node_modules/.prisma/client-mysql, so the PostgreSQL client is untouched
// Rewrites of the DDL:
//   * `COLLATE utf8mb4_unicode_ci` → `COLLATE utf8mb4_bin` (default; case-insensitive search
//     columns are set separately, see FO-375 step 4)

import { readFileSync, writeFileSync, mkdirSync, readdirSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
export const SOURCE_PATH = resolve(ROOT, 'prisma/schema.prisma');
export const MYSQL_SCHEMA_PATH = resolve(ROOT, 'prisma/mysql/schema.prisma');
export const INIT_SQL_PATH = resolve(ROOT, 'prisma/mysql/init.sql');
export const DOWN_SQL_PATH = resolve(ROOT, 'prisma/mysql/init.down.sql');
export const DECISIONS_PATH = resolve(ROOT, 'prisma/mysql/string-decisions.json');
/** Pinned (FO-375): taban tablolarda `mode:'insensitive'` alanları _ci. Görünümlerdeki 16 kopya bunu miras alır. */
export const EXPECTED_CI_BASE = 41;

const LIST_FIELD = /^(\s*\w+\s+)(String|Int)\[\]((?:\s|$).*)$/;

/** Pure: PostgreSQL schema text → MariaDB schema text. Throws if a PG-only construct survives. */
export function toMysqlSchema(source, decisions = []) {
  const stats = { listFields: 0, longText: 0, vectorFields: 0, stringDecided: 0, stringPending: 0 };
  const out = [];
  let inDatasource = false;
  let inGenerator = false;
  let currentModel = null;
  const decided = new Map(decisions.filter((d) => d.status === 'DECIDED').map((d) => [`${d.model}.${d.field}`, d]));
  // OPEN: kept as the Prisma default (VARCHAR(191) on mysql) with no @db line; the length is not proven
  // and the column is a Faz 2 input (FO-375 rev. 7). Counted apart from PENDING so it stays visible.
  const open = new Set(decisions.filter((d) => d.status === 'OPEN').map((d) => `${d.model}.${d.field}`));
  const applied = new Set();

  for (const line of source.split('\n')) {
    const modelStart = /^model (\w+) \{/.exec(line);
    if (modelStart) currentModel = modelStart[1];
    if (/^\}/.test(line)) currentModel = null;
    if (/^datasource db \{/.test(line)) {
      inDatasource = true;
      out.push(line, '  provider = "mysql"');
      continue;
    }
    if (inDatasource) {
      if (line.startsWith('}')) {
        inDatasource = false;
        out.push(line);
      }
      continue; // drops the original provider + extensions lines
    }
    if (/^generator client \{/.test(line)) inGenerator = true;
    if (inGenerator) {
      if (line.startsWith('}')) inGenerator = false;
      if (/^\s*previewFeatures\s*=/.test(line)) {
        out.push('  previewFeatures = ["driverAdapters"]');
        continue;
      }
      out.push(line);
      if (/^\s*provider\s*=/.test(line)) {
        out.push('  output          = "../../node_modules/.prisma/client-mysql"');
      }
      continue;
    }

    let next = line;
    const listMatch = LIST_FIELD.exec(next);
    if (listMatch) {
      stats.listFields += 1;
      next = `${listMatch[1]}Json${listMatch[3]}`.replace('@default([])', '@default("[]")');
    }
    if (/Unsupported\("vector\(\d+\)"\)/.test(next)) {
      stats.vectorFields += 1;
      next = next.replace(/Unsupported\("vector\(\d+\)"\)/, 'Json');
    }
    if (/@db\.Text\b/.test(next)) {
      stats.longText += 1;
      next = next.replace(/@db\.Text\b/, '@db.LongText');
    }
    const str = /^\s+(\w+)\s+String\??(\s|$)/.exec(next);
    if (str && currentModel && !/@db\./.test(next)) {
      const key = `${currentModel}.${str[1]}`;
      const d = decided.get(key);
      if (d) {
        next = next.replace(/^(\s+\w+\s+String\??)/, `$1 @db.${d.type}`);
        applied.add(key);
        stats.stringDecided += 1;
      } else if (open.has(key)) {
        stats.stringOpen = (stats.stringOpen ?? 0) + 1;
      } else {
        stats.stringPending += 1;
      }
    }
    out.push(next);
  }

  const unapplied = [...decided.keys()].filter((k) => !applied.has(k));
  if (unapplied.length > 0) {
    throw new Error(`string decision(s) match no String field in the source: ${unapplied.join(', ')}`);
  }

  const text = out.join('\n');
  const leftovers = [];
  if (/postgresql/i.test(text)) leftovers.push('postgresql reference');
  if (/Unsupported\(/.test(text)) leftovers.push('Unsupported(...)');
  if (/\b(String|Int)\[\]/.test(text)) leftovers.push('scalar list (String[]/Int[])');
  if (/@db\.(Uuid|Jsonb|Inet|Citext)\b/.test(text)) leftovers.push('PostgreSQL-only @db type');
  if (leftovers.length > 0) {
    throw new Error(`mysql schema: unhandled PostgreSQL construct(s): ${leftovers.join(', ')}`);
  }
  return { text, stats };
}

/**
 * Field names that a `mode: 'insensitive'` search touches, read from the application source.
 * Pure: takes the source texts. Matches `<field>: { contains: ..., mode: 'insensitive' }` on one line.
 */
export function insensitiveFieldNames(sourceTexts) {
  const names = new Set();
  const re = /(\w+):\s*\{\s*contains:[^}]*mode:\s*'insensitive'/g;
  for (const text of sourceTexts) {
    for (const m of text.matchAll(re)) names.add(m[1]);
  }
  return names;
}

/**
 * Pure: MariaDB schema text → Set of "Table.column" that get utf8mb4_unicode_ci.
 * A column qualifies when its field name is in `fieldNames`, it is a String scalar, and it is
 * NEITHER unique NOR a primary key: a case-insensitive unique index would reject `A@x` after
 * `a@x` where PostgreSQL accepts both, which is a behaviour change, not a search fix.
 */
export function ciColumns(mysqlSchemaText, fieldNames) {
  const result = new Set();
  const models = mysqlSchemaText.split(/^model /m).slice(1);
  for (const block of models) {
    const name = /^(\w+)\s*\{/.exec(block)?.[1];
    if (!name) continue;
    const mapped = /@@map\("([^"]+)"\)/.exec(block)?.[1] ?? name;
    const uniqueFields = new Set();
    for (const u of block.matchAll(/@@(?:unique|id)\(\[([^\]]+)\]/g)) {
      for (const f of u[1].split(',')) uniqueFields.add(f.trim());
    }
    const fieldLines = block.split('\n').slice(1);
    for (const line of fieldLines) {
      const f = /^\s+(\w+)\s+String\??(?:\s|$)/.exec(line);
      if (!f) continue;
      const field = f[1];
      if (/@unique\b|@id\b/.test(line) || uniqueFields.has(field)) continue;
      if (!fieldNames.has(field)) continue;
      const col = /@map\("([^"]+)"\)/.exec(line)?.[1] ?? field;
      result.add(`${mapped}.${col}`);
    }
  }
  return result;
}

/** Pure: raw `prisma migrate diff --script` stdout → MariaDB DDL (banner stripped). */
export function toInitSql(diffStdout, ciSet = new Set()) {
  const start = diffStdout.search(/^-- /m);
  if (start < 0) throw new Error('migrate diff produced no DDL');
  // Table default: binary. Search columns get their own collation below.
  const lines = diffStdout.slice(start).replace(/COLLATE utf8mb4_unicode_ci/g, 'COLLATE utf8mb4_bin').split('\n');
  let table = null;
  const applied = new Set();
  const out = lines.map((line) => {
    const create = /^CREATE TABLE `([^`]+)`/.exec(line);
    if (create) table = create[1];
    else if (/^\)/.test(line)) table = null;
    if (table === null) return line;
    const col = /^(\s+`(\w+)`\s+)(VARCHAR\(\d+\)|CHAR\(\d+\)|LONGTEXT|TEXT)(?=\s)/.exec(line);
    if (!col || !ciSet.has(`${table}.${col[2]}`)) return line;
    applied.add(`${table}.${col[2]}`);
    return line.replace(col[3], `${col[3]} COLLATE utf8mb4_unicode_ci`);
  });
  const missing = [...ciSet].filter((k) => !applied.has(k));
  if (missing.length > 0) throw new Error(`collation target column(s) not in DDL: ${missing.join(', ')}`);
  const body = out.join('\n');
  return body.endsWith('\n') ? body : `${body}\n`;
}

/** Pure: DDL → down script that drops each created table, last created first. */
export function toDownSql(initSql) {
  const tables = [...initSql.matchAll(/^CREATE TABLE `([^`]+)`/gm)].map((m) => m[1]);
  const lines = [
    '-- FO-375 down script: drops every table created by init.sql (reverse order).',
    '-- Local/scratch use only. Dropping tables destroys data.',
    'SET FOREIGN_KEY_CHECKS = 0;',
    ...tables.reverse().map((t) => `DROP TABLE IF EXISTS \`${t}\`;`),
    'SET FOREIGN_KEY_CHECKS = 1;',
    '',
  ];
  return lines.join('\n');
}

// ---------------------------------------------------------------------------
// Views (FO-375 lead decision, A-TEK): the table schema is the single source. From it we derive
//   prisma/mysql/view-schema.prisma  second Prisma client: every reachable model is mapped to `v_<table>`
//   prisma/mysql/views.sql           fabrika_current_tenant() + one view per reachable model
//   prisma/mysql/views.down.sql      drops those views and the function
// Classes (91 models; revision 7, FO-375 lead decision, measured per model in the report):
//   tenant   (54) tenantId present      → v_<table> filters on fabrika_current_tenant()
//   platform (16) read on a tenant's request path, or written from one → ALGORITHM=TEMPTABLE view,
//                                         no filter. Writes never go through the view: they use the
//                                         system scope (src/lib/system-scope.ts, Faz 2).
//   system   (21) admin or job/ingest path only → NO view. Reachable only through the table client.
//                                         Its fields that point at a system model are dropped from the
//                                         view schema, so the view client cannot reach it via relations.
// Rule (lead, istisnasız): "herkese açık veri = sistem tablosu" is NOT an exception. A table read on a
// tenant request path is a platform view, whatever its data.
// No GRANT exists (A-TEK): the tenant filter in the view is the isolation mechanism.

export const PLATFORM_VIEW_MODELS = [
  // rev. 6 (catalogue / plan data)
  'Plan', 'PlanVersion', 'PlanFeature', 'InterregRubric', 'InterregRubricCriterion',
  // rev. 7: EU public data read on request paths (api/v1/partners, api/cordis, calls pages)
  'CordisProject', 'CordisOrganization', 'CordisParticipation', 'CordisProjectTopic',
  'CordisPartnerProfile', 'CordisCoParticipation', 'Topic', 'PartnerSearchAnnouncement',
  // rev. 7: tenant-less rows touched on request paths (login, profile, invitations, alerts)
  'Tenant', 'User', 'SystemAlert',
];
/**
 * FO-381 B2: tenant models whose tenantId is nullable and means "shared, visible to every tenant"
 * (rls.sql:27-40 `tenant_or_shared`). Their views also show NULL rows. The check option stays, so
 * a tenant may write a NULL row exactly as the PostgreSQL WITH CHECK allows. AuditEvent is NOT here:
 * its NULL rows belong to no tenant and stay hidden (rls.sql, AuditEvent comment).
 */
export const SHARED_TENANT_MODELS = ['Document', 'Chunk', 'ConceptTemplate'];
export const EXPECTED_TENANT_MODELS = 54;
export const EXPECTED_PLATFORM_MODELS = 16;
export const EXPECTED_VIEW_COUNT = EXPECTED_TENANT_MODELS + EXPECTED_PLATFORM_MODELS; // 70
export const EXPECTED_MODELS = 91;
export const VIEW_CLIENT_OUTPUT = '../../node_modules/.prisma/client-mysql-view';
export const VIEW_SCHEMA_PATH = resolve(ROOT, 'prisma/mysql/view-schema.prisma');
export const VIEWS_SQL_PATH = resolve(ROOT, 'prisma/mysql/views.sql');
export const VIEWS_DOWN_SQL_PATH = resolve(ROOT, 'prisma/mysql/views.down.sql');

/** Splits schema text into top-level blocks (header, model, enum), keeping each block's text. */
function splitBlocks(text) {
  return text.split(/^(?=model |enum )/m);
}

/** Pure: MariaDB schema text → Map<ModelName, { mapped, kind }>. Throws if the classification drifts. */
export function classifyModels(mysqlSchemaText) {
  const result = new Map();
  for (const block of splitBlocks(mysqlSchemaText)) {
    const name = /^model (\w+) \{/.exec(block)?.[1];
    if (!name) continue;
    const mapped = /@@map\("([^"]+)"\)/.exec(block)?.[1] ?? name;
    const tenant = /^\s+tenantId\s+String/m.test(block);
    const kind = tenant ? 'tenant' : PLATFORM_VIEW_MODELS.includes(name) ? 'platform' : 'system';
    result.set(name, { mapped, kind });
  }
  const count = (k) => [...result.values()].filter((v) => v.kind === k).length;
  if (result.size !== EXPECTED_MODELS) throw new Error(`model count ${result.size}, expected ${EXPECTED_MODELS}`);
  if (count('tenant') !== EXPECTED_TENANT_MODELS) {
    throw new Error(`tenant model count ${count('tenant')}, expected ${EXPECTED_TENANT_MODELS}: classification drifted`);
  }
  const missing = PLATFORM_VIEW_MODELS.filter((n) => result.get(n)?.kind !== 'platform');
  if (missing.length > 0) throw new Error(`platform view model(s) missing or tenant-scoped: ${missing.join(', ')}`);
  if (count('platform') !== EXPECTED_PLATFORM_MODELS) {
    throw new Error(`platform model count ${count('platform')}, expected ${EXPECTED_PLATFORM_MODELS}: classification drifted`);
  }
  return result;
}

/**
 * Pure: committed views.sql text + the classification → list of errors (empty = pass).
 * The explicit expected-view-list gate (FO-375 rev. 7): every platform model must have exactly one
 * `ALGORITHM=TEMPTABLE` view, every tenant model exactly one filtered view, and nothing else.
 * A platform view deleted from the file fails here even if someone also regenerates the hash.
 */
export function checkViewList(viewsSqlText, mysqlSchemaText) {
  const models = classifyModels(mysqlSchemaText);
  const errors = [];
  const created = [...viewsSqlText.matchAll(/^CREATE OR REPLACE (ALGORITHM=TEMPTABLE )?VIEW `v_(\w+)`/gm)];
  const temptable = new Set(created.filter((m) => m[1]).map((m) => m[2]));
  const filtered = new Set(created.filter((m) => !m[1]).map((m) => m[2]));
  for (const [name, { mapped, kind }] of models) {
    if (kind === 'system') {
      if (temptable.has(mapped) || filtered.has(mapped)) errors.push(`system model ${name} must not have a view`);
    } else if (kind === 'platform') {
      if (!temptable.has(mapped)) errors.push(`platform view v_${mapped} (${name}) missing or not ALGORITHM=TEMPTABLE`);
    } else if (!filtered.has(mapped)) {
      errors.push(`tenant view v_${mapped} (${name}) missing or without the tenant filter`);
    }
  }
  const total = created.length;
  if (total !== EXPECTED_VIEW_COUNT) errors.push(`view count ${total}, expected ${EXPECTED_VIEW_COUNT}`);
  return errors;
}

/** Pure: MariaDB schema text → view-client Prisma schema text (models mapped to v_<table>). */
export function toViewSchema(mysqlSchemaText) {
  const models = classifyModels(mysqlSchemaText);
  const system = new Set([...models].filter(([, v]) => v.kind === 'system').map(([k]) => k));
  const out = splitBlocks(mysqlSchemaText).map((block) => {
    // The header chunk also holds the file's leading comments, so match the generator block inside it.
    if (/generator client \{/.test(block)) {
      return block.replace(/(generator client \{[\s\S]*?)output\s*=\s*"[^"]+"/, `$1output          = "${VIEW_CLIENT_OUTPUT}"`);
    }
    const m = /^model (\w+) \{/.exec(block);
    if (!m) return block;
    if (system.has(m[1])) return '';
    const info = models.get(m[1]);
    const kept = block.split('\n').filter((line) => {
      const field = /^  (\w+)\s+(\w+)(\[\]|\?)?(\s|$)/.exec(line);
      return !(field && system.has(field[2]));
    });
    const lines2 = [...kept];
    const mapLine = `  @@map("v_${info.mapped}")`;
    const mapAt = lines2.findIndex((l) => /^  @@map\(/.test(l));
    if (mapAt >= 0) lines2[mapAt] = mapLine;
    else {
      // The model's own closing brace: the first line that is exactly "}" after the header.
      const close = lines2.findIndex((l, i) => i > 0 && l === '}');
      if (close < 0) throw new Error(`model ${m[1]}: no closing brace`);
      lines2.splice(close, 0, mapLine);
    }
    return lines2.join('\n');
  });
  const text = out.join('');
  const mapped = (text.match(/^  @@map\("v_/gm) ?? []).length;
  if (mapped !== models.size - system.size) {
    throw new Error(`view mapping count ${mapped}, expected ${models.size - system.size}`);
  }
  return text;
}

/**
 * Pure: MariaDB schema text → list of "Model.field" where a LONGTEXT column is part of a key.
 * InnoDB cannot index LONGTEXT without a prefix, so such a column in @id, @unique, @@id,
 * @@unique, @@index or a relation's fields:[] / references:[] is a hard failure at migrate time.
 * Caught here so the generator and --check refuse it before the DB sees it (FO-375 round 6).
 */
export function longTextInKeys(mysqlSchemaText) {
  const models = new Map(); // name -> { longText:Set, keyed:Set }
  let current = null;
  for (const line of mysqlSchemaText.split('\n')) {
    const m = line.match(/^model (\w+) \{/);
    if (m) { current = m[1]; models.set(current, { longText: new Set(), keyed: new Set(), fields: new Map() }); continue; }
    if (/^\}/.test(line)) { current = null; continue; }
    if (!current) continue;
    const model = models.get(current);
    const f = line.match(/^\s+(\w+)\s+(\w+)\??(\s|$)/);
    if (f && !/^@@/.test(line.trim())) {
      model.fields.set(f[1], f[2]);
      if (/@db\.LongText\b/.test(line)) model.longText.add(f[1]);
      if (/@(id|unique)\b/.test(line)) model.keyed.add(f[1]);
      const rel = line.match(/@relation\([^)]*\)/);
      if (rel) {
        const fromList = (k) => { const r = rel[0].match(new RegExp(k + ':\\s*\\[([^\\]]*)\\]')); return r ? r[1].split(',').map((x) => x.trim()).filter(Boolean) : []; };
        for (const c of fromList('fields')) model.keyed.add(c);
        model.refs = [...(model.refs ?? []), { target: f[2], cols: fromList('references') }];
      }
    }
    const at = line.match(/^\s*@@(id|unique|index)\(\[([^\]]*)\]/);
    if (at) for (const c of at[2].split(',')) model.keyed.add(c.trim().replace(/\(.*$/, '').trim());
  }
  for (const model of models.values()) for (const r of model.refs ?? []) {
    const t = models.get(r.target);
    if (t) for (const c of r.cols) t.keyed.add(c);
  }
  const bad = [];
  for (const [name, model] of models) for (const c of model.longText) if (model.keyed.has(c)) bad.push(name + '.' + c);
  return bad;
}

/** Pure: MariaDB schema text → views.sql (function first, then views in name order). */
export function toViewsSql(mysqlSchemaText) {
  const models = classifyModels(mysqlSchemaText);
  const byName = [...models.entries()].sort((a, b) => a[1].mapped.localeCompare(b[1].mapped));
  const lines = [
    '-- FO-375 generated from prisma/mysql/schema.prisma. Do not edit by hand (mysql:check).',
    '-- Tenant scope comes from the session variable @app_tenant_id. Unset → NULL → no tenant rows.',
    '-- Tenant views carry WITH CASCADED CHECK OPTION: an INSERT/UPDATE whose tenantId is not the session tenant is rejected.',
    "CREATE OR REPLACE FUNCTION `fabrika_current_tenant`() RETURNS VARCHAR(191) READS SQL DATA NOT DETERMINISTIC RETURN NULLIF(@app_tenant_id, '');",
  ];
  for (const [, { mapped, kind }] of byName) {
    if (kind === 'system') continue;
    if (kind === 'tenant') {
      const shared = SHARED_TENANT_MODELS.includes(mapped) ? ' OR `tenantId` IS NULL' : '';
      lines.push(`CREATE OR REPLACE VIEW \`v_${mapped}\` AS SELECT * FROM \`${mapped}\` WHERE \`tenantId\` = fabrika_current_tenant()${shared} WITH CASCADED CHECK OPTION;`);
    } else {
      lines.push(`CREATE OR REPLACE ALGORITHM=TEMPTABLE VIEW \`v_${mapped}\` AS SELECT * FROM \`${mapped}\`;`);
    }
  }
  return lines.join('\n') + '\n';
}

/** Pure: views.sql text → down script (views first, then the function). */
export function toViewsDownSql(mysqlSchemaText) {
  const models = classifyModels(mysqlSchemaText);
  const views = [...models.values()].filter((v) => v.kind !== 'system').map((v) => `v_${v.mapped}`).sort();
  return [
    '-- FO-375 down script for views.sql: drops every view, then the tenant function.',
    ...views.map((v) => `DROP VIEW IF EXISTS \`${v}\`;`),
    'DROP FUNCTION IF EXISTS `fabrika_current_tenant`;',
    '',
  ].join('\n');
}

// ---------------------------------------------------------------------------
// FO-381 B3: PostgreSQL CHECK / trigger / function inventory (prisma/mysql/db-objects.json).
export const DB_OBJECTS_PATH = resolve(ROOT, 'prisma/mysql/db-objects.json');
export const DB_OBJECT_DECISIONS = ['taşı', 'uygulamaya al', 'bırak'];

/** Pure: [{path, text}] → Map "kind:name" → { kind, name }. Schema prefixes (public., fabrika_private.) are dropped. */
export function pgDbObjects(sources) {
  const found = new Map();
  const add = (kind, name) => found.set(`${kind}:${name}`, { kind, name });
  for (const { text } of sources) {
    for (const m of text.matchAll(/CONSTRAINT\s+"?(\w+)"?\s+CHECK\s*\(/gi)) add('check', m[1]);
    for (const m of text.matchAll(/CREATE\s+(?:OR\s+REPLACE\s+)?FUNCTION\s+(?:\w+\.)?(\w+)/gi)) add('function', m[1]);
    for (const m of text.matchAll(/CREATE\s+TRIGGER\s+"?(\w+)"?/gi)) add('trigger', m[1]);
  }
  return found;
}

/** Pure: found objects vs. inventory → error lines (empty = the inventory is complete and current). */
export function checkDbObjects(found, inventory) {
  const errors = [];
  const listed = new Map();
  for (const o of inventory.objects ?? []) {
    const key = `${o.kind}:${o.name}`;
    if (listed.has(key)) errors.push(`${key}: duplicate inventory entry`);
    listed.set(key, o);
    if (!DB_OBJECT_DECISIONS.includes(o.decision)) {
      errors.push(`${key}: decision "${o.decision}" is not one of ${DB_OBJECT_DECISIONS.join(' | ')}`);
    }
    if (typeof o.reason !== 'string' || o.reason.trim().length < 10) errors.push(`${key}: reason missing`);
  }
  for (const key of found.keys()) {
    if (!listed.has(key)) errors.push(`${key} exists in PostgreSQL sources but has no entry in prisma/mysql/db-objects.json (no entry)`);
  }
  for (const key of listed.keys()) {
    if (!found.has(key)) errors.push(`${key} is in db-objects.json but no PostgreSQL source defines it (stale entry)`);
  }
  return errors;
}

/** Up migrations and RLS scripts only: down and rollback scripts re-create objects and must not count twice. */
export function readPgSources() {
  const dir = resolve(ROOT, 'prisma/migrations');
  const files = readdirSync(dir)
    .filter((f) => f.endsWith('.sql') && !/\.down\.sql$|rollback/.test(f))
    .map((f) => resolve(dir, f));
  files.push(resolve(ROOT, 'prisma/rls.sql'), resolve(ROOT, 'prisma/rls-app-role.sql'));
  return files.map((p) => ({ path: p, text: readFileSync(p, 'utf8') }));
}

function migrateDiffScript() {
  try {
    return execFileSync(
      'npx',
      ['prisma', 'migrate', 'diff', '--from-empty', '--to-schema', MYSQL_SCHEMA_PATH, '--script'],
      { cwd: ROOT, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] },
    );
  } catch (err) {
    // Prisma prints the reason on stderr; show it instead of the Node stack.
    const reason = String(err.stderr ?? err.message).split('\n').filter((l) => /error|P1012|P1/.test(l)).slice(0, 5);
    throw new Error(`prisma migrate diff failed:\n${reason.join('\n')}`);
  }
}

/** Reads every .ts/.tsx under src/ (the app code that issues insensitive searches). */
function appSourceTexts() {
  const texts = [];
  const walk = (dir) => {
    for (const ent of readdirSync(dir, { withFileTypes: true })) {
      const p = resolve(dir, ent.name);
      if (ent.isDirectory()) walk(p);
      else if (/\.tsx?$/.test(ent.name)) texts.push(readFileSync(p, 'utf8'));
    }
  };
  walk(resolve(ROOT, 'src'));
  return texts;
}

function main() {
  const check = process.argv.includes('--check');
  const strictStrings = process.argv.includes('--strict-strings');
  const decisions = JSON.parse(readFileSync(DECISIONS_PATH, 'utf8')).decisions;
  const { text, stats } = toMysqlSchema(readFileSync(SOURCE_PATH, 'utf8'), decisions);
  const fieldNames = insensitiveFieldNames(appSourceTexts());
  const ci = ciColumns(text, fieldNames);
  stats.ciColumns = ci.size;
  if (ci.size !== EXPECTED_CI_BASE) {
    throw new Error(`_ci column count is ${ci.size}, pinned at ${EXPECTED_CI_BASE}; change EXPECTED_CI_BASE only with a reviewed decision`);
  }
  if (strictStrings && stats.stringPending > 0) {
    throw new Error(`${stats.stringPending} String field(s) still PENDING in prisma/mysql/string-decisions.json (strict mode)`);
  }
  const keyed = longTextInKeys(text);
  if (keyed.length > 0) {
    throw new Error(`LONGTEXT column(s) used as a key or index (MariaDB refuses these): ${keyed.join(', ')}`);
  }
  const viewSchema = toViewSchema(text);
  const viewsSql = toViewsSql(text);
  const viewsDown = toViewsDownSql(text);
  stats.views = (viewsSql.match(/^CREATE OR REPLACE (ALGORITHM=TEMPTABLE )?VIEW/gm) ?? []).length;
  stats.platformViews = (viewsSql.match(/ALGORITHM=TEMPTABLE/g) ?? []).length;

  if (check) {
    const stale = [];
    const committed = (p) => {
      try {
        return readFileSync(p, 'utf8');
      } catch {
        return null;
      }
    };
    const committedSchema = committed(MYSQL_SCHEMA_PATH) ?? '';
    const committedKeyed = longTextInKeys(committedSchema);
    if (committedKeyed.length > 0) {
      console.error(`LONGTEXT column(s) used as a key or index in committed prisma/mysql/schema.prisma: ${committedKeyed.join(', ')}`);
      process.exit(1);
    }
    const viewListErrors = checkViewList(committed(VIEWS_SQL_PATH) ?? '', committedSchema);
    if (viewListErrors.length > 0) {
      console.error(`expected view list violated in prisma/mysql/views.sql:\n  ${viewListErrors.join('\n  ')}`);
      process.exit(1);
    }
    const objectErrors = checkDbObjects(
      pgDbObjects(readPgSources()),
      JSON.parse(committed(DB_OBJECTS_PATH) ?? '{"objects":[]}'),
    );
    if (objectErrors.length > 0) {
      console.error(`PostgreSQL objects not accounted for in prisma/mysql/db-objects.json:\n  ${objectErrors.join('\n  ')}`);
      process.exit(1);
    }
    if (committedSchema !== text) stale.push('prisma/mysql/schema.prisma');
    const init = toInitSql(migrateDiffScript(), ci);
    if (committed(INIT_SQL_PATH) !== init) stale.push('prisma/mysql/init.sql');
    if (committed(DOWN_SQL_PATH) !== toDownSql(init)) stale.push('prisma/mysql/init.down.sql');
    if (committed(VIEW_SCHEMA_PATH) !== viewSchema) stale.push('prisma/mysql/view-schema.prisma');
    if (committed(VIEWS_SQL_PATH) !== viewsSql) stale.push('prisma/mysql/views.sql');
    if (committed(VIEWS_DOWN_SQL_PATH) !== viewsDown) stale.push('prisma/mysql/views.down.sql');
    if (stale.length > 0) {
      console.error(`stale or hand-edited: ${stale.join(', ')}. Run: node scripts/mysql-schema/generate.mjs`);
      process.exit(1);
    }
    validateSchemas([MYSQL_SCHEMA_PATH, VIEW_SCHEMA_PATH]);
    console.log(`mysql artifacts up to date (${JSON.stringify(stats)})`);
    return;
  }

  mkdirSync(dirname(MYSQL_SCHEMA_PATH), { recursive: true });
  writeFileSync(MYSQL_SCHEMA_PATH, text);
  const init = toInitSql(migrateDiffScript(), ci);
  writeFileSync(INIT_SQL_PATH, init);
  writeFileSync(DOWN_SQL_PATH, toDownSql(init));
  writeFileSync(VIEW_SCHEMA_PATH, viewSchema);
  writeFileSync(VIEWS_SQL_PATH, viewsSql);
  writeFileSync(VIEWS_DOWN_SQL_PATH, viewsDown);
  validateSchemas([MYSQL_SCHEMA_PATH, VIEW_SCHEMA_PATH]);
  // Two clients: table (system-scope + migrations) and view (tenant/platform reads).
  for (const schema of [MYSQL_SCHEMA_PATH, VIEW_SCHEMA_PATH]) {
    execFileSync('npx', ['prisma', 'generate', '--schema', schema], { cwd: ROOT, stdio: 'pipe' });
  }
  console.log(`wrote prisma/mysql/{schema,init,view-schema,views,...}; clients generated (${JSON.stringify(stats)})`);
}

/** Runs `prisma validate` on each schema (no DB needed). Throws on the first invalid one. */
function validateSchemas(paths) {
  for (const p of paths) {
    try {
      execFileSync('npx', ['prisma', 'validate', '--schema', p], { cwd: ROOT, stdio: 'pipe' });
    } catch (err) {
      const reason = String(err.stderr ?? err.message).split('\n').filter((l) => /error|Error/.test(l)).slice(0, 5);
      throw new Error(`prisma validate failed for ${p}:\n${reason.join('\n')}`);
    }
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  try {
    main();
  } catch (err) {
    console.error(`mysql schema build failed: ${err.message}`);
    process.exit(1);
  }
}
