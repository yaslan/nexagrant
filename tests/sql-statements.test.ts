import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, test } from 'vitest';
import { sqlStatements } from './helpers/sql-statements';

/**
 * TASK-MUOFZJTDQBYF5 (R-2): stale-relationship-reminder.live applies the m4
 * migrations one statement at a time, as psql does in production. A split in
 * the wrong place would send half a DO block; one missed split would bring the
 * single long transaction (and the deadlock) back.
 */
const migration = (name: string) => readFileSync(resolve(__dirname, '../prisma/migrations', name), 'utf8');

describe('sqlStatements', () => {
  test('m4-stale-digest-user-claim.sql: ADD COLUMN, CREATE INDEX and the whole DO block, each on its own', () => {
    const parts = sqlStatements(migration('m4-stale-digest-user-claim.sql'));
    expect(parts).toHaveLength(3);
    expect(parts[0]).toMatch(/^ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "staleDigestOn" DATE;$/m);
    expect(parts[1]).toMatch(/CREATE INDEX IF NOT EXISTS "Membership_userId_idx"/);
    expect(parts[2]).toMatch(/^DO \$\$/m);
    expect(parts[2]).toMatch(/END\s*\$\$;$/);
    expect(parts[2]).toContain('NO FORCE ROW LEVEL SECURITY;');
    expect(parts[2]).toContain('ALTER TABLE "Membership" FORCE ROW LEVEL SECURITY;');
  });

  test('m4-stale-reminder-idempotency.sql: two ADD COLUMNs and two backfills', () => {
    const parts = sqlStatements(migration('m4-stale-reminder-idempotency.sql'));
    expect(parts.map((p) => p.replace(/^(--[^\n]*\n|\s)*/, '').split(/\s+/).slice(0, 2).join(' '))).toEqual([
      'ALTER TABLE',
      'ALTER TABLE',
      'UPDATE "Relationship"',
      'UPDATE "Membership"',
    ]);
  });

  test('does not split inside strings, quoted identifiers, comments or dollar-quoted bodies', () => {
    const sql = [
      "SELECT 'a;b', 'it''s; fine';",
      'SELECT "odd;name" FROM t;',
      '-- a comment; not a statement',
      '/* block; comment */ SELECT 1;',
      "DO $fn$ BEGIN PERFORM 1; RAISE NOTICE 'x;y'; END $fn$;",
      'DO $$ BEGIN PERFORM 2; END $$;',
      'SELECT $1::int',
    ].join('\n');
    expect(sqlStatements(sql)).toEqual([
      "SELECT 'a;b', 'it''s; fine';",
      'SELECT "odd;name" FROM t;',
      '-- a comment; not a statement\n/* block; comment */ SELECT 1;',
      "DO $fn$ BEGIN PERFORM 1; RAISE NOTICE 'x;y'; END $fn$;",
      'DO $$ BEGIN PERFORM 2; END $$;',
      'SELECT $1::int',
    ]);
  });

  test('a file of comments only yields nothing', () => {
    expect(sqlStatements('-- header\n/* note */\n\n')).toEqual([]);
  });
});
