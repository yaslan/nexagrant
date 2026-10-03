import { describe, it, expect } from 'vitest';
import { displayRoleName } from './user-display';

describe('displayRoleName', () => {
  const unassignedLabel = 'Rol atanmamış';

  it('returns the role name when present', () => {
    expect(displayRoleName('TENANT_OWNER', unassignedLabel)).toBe('TENANT_OWNER');
    expect(displayRoleName('PIPELINE_MANAGER', unassignedLabel)).toBe('PIPELINE_MANAGER');
    expect(displayRoleName('MEMBER', unassignedLabel)).toBe('MEMBER');
  });

  it('returns unassigned label when role is null', () => {
    expect(displayRoleName(null, unassignedLabel)).toBe(unassignedLabel);
  });

  it('returns unassigned label when role is undefined', () => {
    expect(displayRoleName(undefined, unassignedLabel)).toBe(unassignedLabel);
  });

  it('returns unassigned label when role is empty string', () => {
    expect(displayRoleName('', unassignedLabel)).toBe(unassignedLabel);
  });

  it('returns unassigned label when role is whitespace only', () => {
    expect(displayRoleName('   ', unassignedLabel)).toBe(unassignedLabel);
  });

  it('trims whitespace from role names', () => {
    expect(displayRoleName('  TENANT_OWNER  ', unassignedLabel)).toBe('TENANT_OWNER');
  });
});
