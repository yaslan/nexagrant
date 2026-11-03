// FO-375 — unit tests for the MariaDB schema build (scripts/mysql-schema/generate.mjs).
// Pure transforms only; the DB and `prisma migrate diff` are exercised by the isolated run.
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import {
  SOURCE_PATH,
  ciColumns,
  insensitiveFieldNames,
  toDownSql,
  toInitSql,
  toMysqlSchema,
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
    expect(stats).toEqual({ listFields: 18, longText: 15, vectorFields: 3 });
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
