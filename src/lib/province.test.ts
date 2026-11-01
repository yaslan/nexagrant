import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, test } from 'vitest';
import { provinceAppliesTo, toTenantProvince } from './province';
import { TR_PROVINCES } from './readiness/provinces';

/** TASK-MULV3JXS1AW5X — Tenant.province uses the scorecard's dictionary, in code and in the database. */

describe('toTenantProvince', () => {
  test('a name from TR_PROVINCES is kept as spelled', () => {
    expect(toTenantProvince('Samsun')).toBe('Samsun');
    expect(toTenantProvince('İstanbul')).toBe('İstanbul');
  });

  test('anything else is null, not an error', () => {
    expect(toTenantProvince('samsun')).toBeNull();
    expect(toTenantProvince('Istanbul')).toBeNull();
    expect(toTenantProvince('55')).toBeNull();
    expect(toTenantProvince('')).toBeNull();
    expect(toTenantProvince(null)).toBeNull();
    expect(toTenantProvince(55)).toBeNull();
    expect(toTenantProvince(['Samsun'])).toBeNull();
  });

  test('only for an organisation in Türkiye', () => {
    expect(provinceAppliesTo('TR')).toBe(true);
    expect(provinceAppliesTo('DE')).toBe(false);
    expect(toTenantProvince('Samsun', 'DE')).toBeNull();
    expect(toTenantProvince('Samsun', null)).toBeNull();
  });
});

describe('add-tenant-province.sql', () => {
  test('its CHECK lists exactly the 81 names of TR_PROVINCES', () => {
    const sql = readFileSync(resolve(process.cwd(), 'prisma/migrations/add-tenant-province.sql'), 'utf8');
    const check = sql.slice(sql.indexOf('"province" IN ('), sql.indexOf('COMMENT ON COLUMN'));
    const names = [...check.matchAll(/'([^']+)'/g)].map((m) => m[1]);
    expect(names).toEqual([...TR_PROVINCES]);
    expect(names).toHaveLength(81);
  });
});
