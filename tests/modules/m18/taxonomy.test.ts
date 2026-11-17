import { describe, expect, it } from 'vitest';

import { TR_PROVINCES } from '@/lib/readiness/provinces';
import {
  HIBELEAD_ORG_TYPES,
  PLATE_CODE_COUNT,
  isHibeLeadOrgType,
  mapOrgType,
  normalisePlateCode,
  plateForProvince,
  provinceForPlate,
} from '@/modules/m18/server/taxonomy';

describe('M18 taxonomy — HibeLead org types', () => {
  it('has the 18 recovered codes, each mapped to an OrgType', () => {
    expect(HIBELEAD_ORG_TYPES).toHaveLength(18);
    expect(new Set(HIBELEAD_ORG_TYPES).size).toBe(18);
    const allowed = ['SME', 'LARGE', 'UNIVERSITY', 'RESEARCH', 'PUBLIC', 'NGO', 'CONSULTANCY', 'CLUSTER', 'MUNICIPALITY'];
    for (const code of HIBELEAD_ORG_TYPES) {
      const mapped = mapOrgType(code);
      expect(mapped?.subType).toBe(code);
      expect(allowed).toContain(mapped?.orgType);
    }
  });

  it.each([
    ['municipality', 'MUNICIPALITY'],
    ['metropolitan_municipality', 'MUNICIPALITY'],
    ['chamber', 'PUBLIC'],
    ['cooperative', 'NGO'],
    ['osb', 'CLUSTER'],
    ['technopark', 'CLUSTER'],
    ['university', 'UNIVERSITY'],
    ['sme', 'SME'],
    ['large_company', 'LARGE'],
  ])('%s → %s', (code, orgType) => {
    expect(mapOrgType(code)?.orgType).toBe(orgType);
  });

  it('tolerates case and whitespace, refuses unknown or empty codes', () => {
    expect(mapOrgType('  SME ')).toEqual({ orgType: 'SME', subType: 'sme' });
    expect(mapOrgType('startup')).toBeNull();
    expect(mapOrgType('')).toBeNull();
    expect(mapOrgType(null)).toBeNull();
    expect(mapOrgType(undefined)).toBeNull();
    expect(isHibeLeadOrgType('ngo_other')).toBe(true);
    expect(isHibeLeadOrgType('NGO_OTHER')).toBe(false);
  });
});

describe('M18 taxonomy — plate codes', () => {
  it('plates 01–81 are a bijection onto TR_PROVINCES', () => {
    expect(PLATE_CODE_COUNT).toBe(81);
    const provinces = Array.from({ length: 81 }, (_, i) => provinceForPlate(i + 1));
    expect(new Set(provinces).size).toBe(81);
    expect([...provinces].sort()).toEqual([...TR_PROVINCES].sort());
  });

  it.each([
    ['01', 'Adana'],
    ['06', 'Ankara'],
    ['33', 'Mersin'],
    ['34', 'İstanbul'],
    ['35', 'İzmir'],
    ['46', 'Kahramanmaraş'],
    ['63', 'Şanlıurfa'],
    ['76', 'Iğdır'],
    ['81', 'Düzce'],
  ])('plate %s is %s, and back', (plate, province) => {
    expect(provinceForPlate(plate)).toBe(province);
    expect(plateForProvince(province)).toBe(plate);
  });

  it('normalises plate input', () => {
    expect(normalisePlateCode('6')).toBe('06');
    expect(normalisePlateCode(' 06 ')).toBe('06');
    expect(normalisePlateCode(34)).toBe('34');
    for (const bad of ['0', '00', '82', '100', 'TR51', '', null, undefined]) {
      expect(normalisePlateCode(bad)).toBeNull();
    }
    expect(provinceForPlate('99')).toBeNull();
  });

  it('finds the plate by province name with Turkish casing', () => {
    expect(plateForProvince('istanbul')).toBe('34');
    expect(plateForProvince(' IĞDIR ')).toBe('76');
    expect(plateForProvince('Atlantis')).toBeNull();
  });
});
