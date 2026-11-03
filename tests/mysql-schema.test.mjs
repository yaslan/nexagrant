// FO-375 — unit tests for the MariaDB schema build (scripts/mysql-schema/generate.mjs).
// Pure transforms only; the DB and `prisma migrate diff` are exercised by the isolated run.
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import {
  DECISIONS_PATH,
  EXPECTED_CI_BASE,
  SOURCE_PATH,
  ciColumns,
  classifyModels,
  insensitiveFieldNames,
  longTextInKeys,
  toDownSql,
  toInitSql,
  toMysqlSchema,
  toViewSchema,
  toViewsDownSql,
  toViewsSql,
} from '../scripts/mysql-schema/generate.mjs';

const PG_HEADER = `generator client {
  provider        = "prisma-client-js"
  previewFeatures = ["postgresqlExtensions", "driverAdapters"]
}

datasource db {
  provider   = "postgresql"
  extensions = [vector]
}
`;

describe('toMysqlSchema', () => {
  it('switches the datasource to mysql and drops extensions', () => {
    const { text } = toMysqlSchema(PG_HEADER + '\nmodel A {\n  id String @id\n}\n');
    expect(text).toContain('datasource db {\n  provider = "mysql"\n}');
    expect(text).not.toContain('extensions');
    expect(text).not.toContain('postgresqlExtensions');
    expect(text).toContain('output          = "../../node_modules/.prisma/client-mysql"');
  });

  it('turns scalar lists into Json and keeps the empty default as a JSON string', () => {
    const src = PG_HEADER + '\nmodel A {\n  tags    String[]\n  ranges  Int[]    // [min,max]\n  modules String[] @default([])\n}\n';
    const { text, stats } = toMysqlSchema(src);
    expect(text).toContain('  tags    Json\n');
    expect(text).toContain('  ranges  Json    // [min,max]');
    expect(text).toContain('  modules Json @default("[]")');
    expect(stats.listFields).toBe(3);
  });

  it('maps Text to LongText and vector to a Json placeholder', () => {
    const src = PG_HEADER + '\nmodel A {\n  body String @db.Text\n  embedding Unsupported("vector(1536)")?\n}\n';
    const { text, stats } = toMysqlSchema(src);
    expect(text).toContain('@db.LongText');
    expect(text).toContain('embedding Json?');
    expect(stats).toMatchObject({ longText: 1, vectorFields: 1 });
  });

  it('fails loudly on a PostgreSQL-only @db type it does not know', () => {
    const src = PG_HEADER + '\nmodel A {\n  id String @id @db.Uuid\n}\n';
    expect(() => toMysqlSchema(src)).toThrow(/PostgreSQL-only @db type/);
  });

  it('matches the FO-375 decision counts on the real schema (18 lists, 15 Text, 3 vectors)', () => {
    const { stats } = toMysqlSchema(readFileSync(SOURCE_PATH, 'utf8'));
    expect(stats).toEqual({ listFields: 18, longText: 15, vectorFields: 3, stringDecided: 0, stringPending: 555 });
  });
});

describe('toInitSql', () => {
  it('strips the prisma banner and rewrites the default collation to utf8mb4_bin', () => {
    const raw = '◇ injected env (0)\nLoaded Prisma config\n-- CreateTable\nCREATE TABLE `T` (\n  `c` VARCHAR(191) NOT NULL\n) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;\n';
    const sql = toInitSql(raw);
    expect(sql.startsWith('-- CreateTable\n')).toBe(true);
    expect(sql).toContain('COLLATE utf8mb4_bin;');
    expect(sql).not.toContain('unicode_ci');
  });

  it('refuses output without DDL', () => {
    expect(() => toInitSql('Loaded Prisma config\n')).toThrow(/no DDL/);
  });
});

describe('insensitiveFieldNames', () => {
  it('collects the field of every one-line insensitive contains filter', () => {
    const src = [
      "where: { OR: [{ name: { contains: q, mode: 'insensitive' } }, { title: { contains: x, mode: 'insensitive' } }] }",
      "{ email: { contains: q.toLowerCase(), mode: 'insensitive' } }",
      "{ status: { equals: 'ACTIVE' } }",
    ];
    expect([...insensitiveFieldNames(src)].sort()).toEqual(['email', 'name', 'title']);
  });
});

describe('ciColumns', () => {
  const MYSQL = [
    'model Partner {',
    '  id       String @id',
    '  name     String',
    '  nameNormalized String?',
    '  email    String @unique',
    '  code     String @map("partner_code")',
    '  other    String',
    '  @@map("partners")',
    '}',
    '',
    'model Pair {',
    '  a String',
    '  b String',
    '  @@unique([a, b])',
    '}',
    '',
  ].join('\n');

  it('picks searched String fields by field name, using the mapped table and column names', () => {
    const ci = ciColumns(MYSQL, new Set(['name', 'nameNormalized', 'code']));
    expect([...ci].sort()).toEqual(['partners.name', 'partners.nameNormalized', 'partners.partner_code']);
  });

  it('never makes a unique, primary-key or composite-unique column case-insensitive', () => {
    const ci = ciColumns(MYSQL, new Set(['id', 'email', 'a', 'b']));
    expect(ci.size).toBe(0);
  });
});

describe('toInitSql with search-column collation', () => {
  const RAW = '-- CreateTable\nCREATE TABLE `Partner` (\n    `id` VARCHAR(191) NOT NULL,\n    `name` VARCHAR(191) NOT NULL,\n    `bio` LONGTEXT NOT NULL,\n    PRIMARY KEY (`id`)\n) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;\n';

  it('sets column collation only on the listed columns and keeps the table default binary', () => {
    const sql = toInitSql(RAW, new Set(['Partner.name', 'Partner.bio']));
    expect(sql).toContain('`name` VARCHAR(191) COLLATE utf8mb4_unicode_ci NOT NULL,');
    expect(sql).toContain('`bio` LONGTEXT COLLATE utf8mb4_unicode_ci NOT NULL,');
    expect(sql).toContain('`id` VARCHAR(191) NOT NULL,');
    expect(sql).toContain('COLLATE utf8mb4_bin;');
  });

  it('fails loudly when a listed column does not exist in the DDL', () => {
    expect(() => toInitSql(RAW, new Set(['Partner.missing']))).toThrow(/not in DDL: Partner\.missing/);
  });
});

describe('toDownSql', () => {
  it('drops every created table in reverse order, with FK checks off around it', () => {
    const init = '-- CreateTable\nCREATE TABLE `A` (x INT);\n-- CreateTable\nCREATE TABLE `B` (y INT);\n';
    const down = toDownSql(init);
    const drops = [...down.matchAll(/DROP TABLE IF EXISTS `([^`]+)`/g)].map((m) => m[1]);
    expect(drops).toEqual(['B', 'A']);
    expect(down).toMatch(/^SET FOREIGN_KEY_CHECKS = 0;/m);
    expect(down).toMatch(/SET FOREIGN_KEY_CHECKS = 1;\n$/);
  });
});

// FO-375 views: classification, view schema and view SQL. The real schema is read from disk.
describe('view artifacts (real schema)', () => {
  const real = toMysqlSchema(readFileSync(SOURCE_PATH, 'utf8')).text;

  it('classifies 91 models into 54 tenant, 5 platform, 32 system', () => {
    const models = classifyModels(real);
    const kinds = [...models.values()].map((m) => m.kind);
    expect(models.size).toBe(91);
    expect(kinds.filter((k) => k === 'tenant')).toHaveLength(54);
    expect(kinds.filter((k) => k === 'platform')).toHaveLength(5);
    expect(kinds.filter((k) => k === 'system')).toHaveLength(32);
  });

  it('maps every view model in the view schema and keeps system models out of it', () => {
    const view = toViewSchema(real);
    expect(view.match(/^  @@map\("v_/gm)).toHaveLength(59);
    expect(view).toContain('output          = "../../node_modules/.prisma/client-mysql-view"');
    expect(view).toContain('@@map("v_Plan")');
  });

  it('builds tenant views with a cascaded check option and platform views as TEMPTABLE', () => {
    const sql = toViewsSql(real);
    expect(sql).toMatch(/CREATE OR REPLACE VIEW `v_Workspace` AS SELECT \* FROM `Workspace` WHERE `tenantId` = fabrika_current_tenant\(\) WITH CASCADED CHECK OPTION;/);
    expect(sql).toContain('CREATE OR REPLACE ALGORITHM=TEMPTABLE VIEW `v_Plan` AS SELECT * FROM `Plan`;');
    expect(sql.match(/^CREATE OR REPLACE VIEW .*WITH CASCADED CHECK OPTION;$/gm)).toHaveLength(54);
  });

  it('drops every view and the function in the down script', () => {
    const down = toViewsDownSql(real);
    expect(down).toContain('DROP FUNCTION IF EXISTS `fabrika_current_tenant`;');
    expect(down.match(/DROP VIEW IF EXISTS/g)).toHaveLength(59);
  });
});

describe('toViewSchema: system models are unreachable from the view client', () => {
  const real = toMysqlSchema(readFileSync(SOURCE_PATH, 'utf8')).text;
  it('has no field whose type is a system model', () => {
    const models = classifyModels(real);
    const system = new Set([...models].filter(([, v]) => v.kind === 'system').map(([k]) => k));
    const view = toViewSchema(real);
    const types = [...view.matchAll(/^  \w+\s+(\w+)/gm)].map((m) => m[1]);
    expect(types.filter((t) => system.has(t))).toEqual([]);
    expect(view).not.toMatch(/^model (SystemThing|Session|Account)\b/m);
  });
});

describe('String decisions (FO-375 lead rule: no bare String without a proven type)', () => {
  const table = JSON.parse(readFileSync(DECISIONS_PATH, 'utf8')).decisions;
  const decided = table.filter((d) => d.status === 'DECIDED');
  const pending = table.filter((d) => d.status === 'PENDING');

  it('has one entry per String field, each DECIDED with a type and evidence, or PENDING', () => {
    expect(table.length).toBe(555);
    expect(new Set(table.map((d) => `${d.model}.${d.field}`)).size).toBe(555);
    for (const d of decided) {
      expect(d.type).toMatch(/^(VarChar\(\d+\)|LongText)$/);
      expect(d.evidence.length).toBeGreaterThanOrEqual(20);
    }
    for (const d of pending) expect(d.type ?? null).toBeNull();
  });

  it('applies a decided type with @db and counts the undecided fields as pending', () => {
    const src = 'model Plan {\n  id String @id\n  name String\n}\n';
    const { text, stats } = toMysqlSchema(src, [
      { model: 'Plan', field: 'id', status: 'DECIDED', type: 'VarChar(64)', evidence: 'catalog key, seed-written only' },
    ]);
    expect(text).toContain('id String @db.VarChar(64)');
    expect(text).toContain('name String\n');
    expect(stats.stringDecided).toBe(1);
    expect(stats.stringPending).toBe(1);
  });

  it('fails loudly when a decision matches no String field in the source', () => {
    expect(() =>
      toMysqlSchema('model Plan {\n  id String @id\n}\n', [
        { model: 'Plan', field: 'gone', status: 'DECIDED', type: 'LongText', evidence: 'stale decision entry here' },
      ]),
    ).toThrow(/match no String field/);
  });

  it('the committed schema carries exactly the DECIDED types and leaves the PENDING ones as String', () => {
    const { text, stats } = toMysqlSchema(readFileSync(SOURCE_PATH, 'utf8'), table);
    expect(stats.stringDecided).toBe(decided.length);
    expect(stats.stringPending).toBe(pending.length);
    const committed = readFileSync(new URL('../prisma/mysql/schema.prisma', import.meta.url), 'utf8');
    expect(committed).toBe(text);
  });

  it('pins the base-table _ci count (41 columns; the 16 view copies are inherited, not generated)', () => {
    expect(EXPECTED_CI_BASE).toBe(41);
  });
});

describe('longTextInKeys (FO-375 round 6 gate)', () => {
  const schema = [
    'model Parent {',
    '  id   String @db.VarChar(128) @id',
    '  name String @db.LongText',
    '}',
    'model Child {',
    '  id       String @db.VarChar(128) @id',
    '  parentId String @db.VarChar(128)',
    '  note     String @db.LongText',
    '  code     String @db.VarChar(64)',
    '  @@index([parentId])',
    '  @@unique([id, code])',
    '  parent Parent @relation(fields: [parentId], references: [id])',
    '}',
  ].join('\n');

  it('passes when no LONGTEXT column is a key, index or relation column', () => {
    expect(longTextInKeys(schema)).toEqual([]);
  });

  it('flags a LONGTEXT column named in @@unique / @@index', () => {
    expect(longTextInKeys(schema.replace('@@unique([id, code])', '@@unique([id, note])'))).toEqual(['Child.note']);
    expect(longTextInKeys(schema.replace('@@index([parentId])', '@@index([note])'))).toEqual(['Child.note']);
  });

  it('flags a LONGTEXT relation column and the LONGTEXT referenced column', () => {
    const fk = schema.replace('parentId String @db.VarChar(128)', 'parentId String @db.LongText');
    expect(longTextInKeys(fk)).toContain('Child.parentId');
    const ref = schema.replace('id   String @db.VarChar(128) @id', 'id   String @db.LongText @id');
    expect(longTextInKeys(ref)).toContain('Parent.id');
  });
});
