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

const LIST_FIELD = /^(\s*\w+\s+)(String|Int)\[\]((?:\s|$).*)$/;

/** Pure: PostgreSQL schema text → MariaDB schema text. Throws if a PG-only construct survives. */
export function toMysqlSchema(source) {
  const stats = { listFields: 0, longText: 0, vectorFields: 0 };
  const out = [];
  let inDatasource = false;
  let inGenerator = false;

  for (const line of source.split('\n')) {
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
    out.push(next);
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
  const { text, stats } = toMysqlSchema(readFileSync(SOURCE_PATH, 'utf8'));
  const fieldNames = insensitiveFieldNames(appSourceTexts());
  const ci = ciColumns(text, fieldNames);
  stats.ciColumns = ci.size;

  if (check) {
    const stale = [];
    const committed = (p) => {
      try {
        return readFileSync(p, 'utf8');
      } catch {
        return null;
      }
    };
    if (committed(MYSQL_SCHEMA_PATH) !== text) stale.push('prisma/mysql/schema.prisma');
    const init = toInitSql(migrateDiffScript(), ci);
    if (committed(INIT_SQL_PATH) !== init) stale.push('prisma/mysql/init.sql');
    if (committed(DOWN_SQL_PATH) !== toDownSql(init)) stale.push('prisma/mysql/init.down.sql');
    if (stale.length > 0) {
      console.error(`stale or hand-edited: ${stale.join(', ')}. Run: node scripts/mysql-schema/generate.mjs`);
      process.exit(1);
    }
    console.log(`mysql artifacts up to date (${JSON.stringify(stats)})`);
    return;
  }

  mkdirSync(dirname(MYSQL_SCHEMA_PATH), { recursive: true });
  writeFileSync(MYSQL_SCHEMA_PATH, text);
  const init = toInitSql(migrateDiffScript(), ci);
  writeFileSync(INIT_SQL_PATH, init);
  writeFileSync(DOWN_SQL_PATH, toDownSql(init));
  console.log(`wrote prisma/mysql/{schema.prisma,init.sql,init.down.sql} (${JSON.stringify(stats)})`);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  try {
    main();
  } catch (err) {
    console.error(`mysql schema build failed: ${err.message}`);
    process.exit(1);
  }
}
