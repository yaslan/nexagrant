import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, test } from 'vitest';
import { TR_PROVINCES } from '@/lib/readiness/provinces';
import { normaliseRouteProvince } from './province-route';

/** NG-167 — the province dictionary of the routing map, in code and in the database. */
describe('normaliseRouteProvince', () => {
  test('exact TR_PROVINCES spelling only', () => {
    expect(normaliseRouteProvince('Samsun')).toBe('Samsun');
    expect(normaliseRouteProvince('İstanbul')).toBe('İstanbul');
    for (const bad of ['samsun', 'Istanbul', ' Samsun', '55', '', null, undefined, 55, ['Samsun']]) {
      expect(normaliseRouteProvince(bad)).toBeNull();
    }
  });
});

describe('add-province-lead-route.sql', () => {
  const sql = readFileSync(resolve(process.cwd(), 'prisma/migrations/add-province-lead-route.sql'), 'utf8');

  test('its CHECK lists exactly the 81 names of TR_PROVINCES', () => {
    const check = sql.slice(sql.indexOf('"province" IN ('), sql.indexOf('-- One ACTIVE tenant per province'));
    const names = [...check.matchAll(/'([^']+)'/g)].map((m) => m[1]);
    expect(names).toEqual([...TR_PROVINCES]);
  });

  test('one ACTIVE tenant per province is held by a partial unique index', () => {
    expect(sql).toMatch(/CREATE UNIQUE INDEX IF NOT EXISTS "ProvinceLeadRoute_province_active_key"\s+ON "ProvinceLeadRoute" \("province"\) WHERE "active"/);
  });
});
