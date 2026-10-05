/**
 * FB KAMU B11 (TASK-MULRSG6T55LO0) — the public-sector packages as catalogue
 * facts. Pure: no database. The assignment and the limits it enforces are
 * tested against the real database in public-sector-assignment.test.ts.
 */
import { describe, it, expect } from 'vitest';
import {
  CATALOG,
  PLAN_GRANTS,
  PUBLIC_SECTOR_PLANS,
  grantsFor,
  isContractPlan,
  plansGrantingModule,
  publicSectorPlan,
} from './catalog';
import { publicSectorPlanRow, serviceLines } from './public-sector-plans';
import { hasFreeSeat } from './seat-limit';

describe('public-sector packages — owner-approved terms (ILKADIM-PILOT.md §6.2)', () => {
  it('defines exactly the three packages, yearly, in TRY kuruş', () => {
    expect(PUBLIC_SECTOR_PLANS.map((p) => [p.planId, p.name, p.yearlyListMinor, p.currency])).toEqual([
      ['public-starter', 'Belediye Başlangıç', 9_000_000, 'TRY'],
      ['public-team', 'Belediye Ekip', 24_000_000, 'TRY'],
      ['public-institution', 'Belediye Kurum', 48_000_000, 'TRY'],
    ]);
    for (const plan of PUBLIC_SECTOR_PLANS) {
      expect(Number.isSafeInteger(plan.yearlyListMinor), `${plan.planId} amount must be an integer`).toBe(true);
      const row = publicSectorPlanRow(plan);
      expect(row.monthlyCents).toBe(0);
      expect(row.yearlyCents).toBe(plan.yearlyListMinor);
      expect(row.currency).toBe('TRY');
    }
  });

  it('sells 2 / 6 / 15 seats', () => {
    expect(grantsFor('public-starter')?.seats).toBe(2);
    expect(grantsFor('public-team')?.seats).toBe(6);
    expect(grantsFor('public-institution')?.seats).toBe(15);
  });

  it('opens exactly what Başlangıç / Ekip / İşletme (basic / pro / ultra) open', () => {
    const pairs = [
      ['public-starter', 'basic'],
      ['public-team', 'pro'],
      ['public-institution', 'ultra'],
    ] as const;
    for (const [publicId, baseId] of pairs) {
      const pub = grantsFor(publicId)!;
      const base = grantsFor(baseId)!;
      expect([...pub.moduleIds].sort()).toEqual([...base.moduleIds].sort());
      expect(pub.workspaces).toBe(base.workspaces);
      expect(pub.aiCreditsMonthly).toBe(base.aiCreditsMonthly);
    }
    // Module on/off, spelled out for the package the pilot will use.
    const team = grantsFor('public-team')!.moduleIds;
    for (const on of ['M1', 'M2', 'M3', 'M4', 'M5', 'M6', 'M8']) expect(team).toContain(on);
    for (const off of ['M7', 'M9', 'M10', 'M11']) expect(team).not.toContain(off);
    expect(grantsFor('public-starter')!.moduleIds).not.toContain('M1');
    expect(grantsFor('public-institution')!.moduleIds).toContain('M7');
  });

  it('is never sold at checkout and never widens module gating', () => {
    for (const plan of PUBLIC_SECTOR_PLANS) {
      expect(isContractPlan(plan.planId)).toBe(true);
      expect(grantsFor(plan.planId)?.purchasable).toBe(false);
      expect(CATALOG.find((e) => e.sku.includes(plan.planId))).toBeUndefined();
    }
    // Manifest `planTiers` are unchanged by the new packages.
    expect(plansGrantingModule('M7')).toEqual(['ultra']);
    expect(plansGrantingModule('M3')).toEqual(['basic', 'pro', 'ultra']);
    expect(isContractPlan('pro')).toBe(false);
    expect(isContractPlan('free')).toBe(false);
    expect(PLAN_GRANTS.filter((g) => g.purchasable).map((g) => g.planId)).toEqual(['basic', 'pro', 'ultra']);
  });

  it('records the service days and report cadence as plan metadata', () => {
    const tr = (id: string) => serviceLines(publicSectorPlan(id)!).map((l) => l.textTr);
    expect(tr('public-starter')).toEqual(['2 koltuk', '1 onboarding günü', 'Yıllık sözleşme, KDV hariç']);
    expect(tr('public-team')).toEqual([
      '6 koltuk',
      '2 onboarding günü',
      'Çeyreklik kullanım raporu',
      'Yıllık sözleşme, KDV hariç',
    ]);
    expect(tr('public-institution')).toEqual([
      '15 koltuk',
      '4 eğitim günü',
      'Aylık kullanım raporu',
      'Yıllık sözleşme, KDV hariç',
    ]);
  });
});

describe('seat limit — pure decision', () => {
  it('counts members and pending invitations against the limit', () => {
    expect(hasFreeSeat({ limit: 6, members: 5, pendingInvitations: 0 })).toBe(true);
    expect(hasFreeSeat({ limit: 6, members: 5, pendingInvitations: 1 })).toBe(false);
    expect(hasFreeSeat({ limit: 6, members: 6, pendingInvitations: 0 })).toBe(false);
    expect(hasFreeSeat({ limit: 2, members: 7, pendingInvitations: 0 })).toBe(false);
  });
});
