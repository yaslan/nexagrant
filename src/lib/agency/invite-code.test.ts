import { describe, expect, it } from 'vitest';
import {
  INVITE_CODE_ALPHABET,
  INVITE_CODE_LENGTH,
  generateInviteCode,
  hashInviteCode,
  inviteCodeHint,
  normalizeInviteCode,
} from './invite-code';

describe('invite code', () => {
  it('generates 12 characters from the unambiguous alphabet, grouped by four', () => {
    for (let i = 0; i < 200; i++) {
      const code = generateInviteCode();
      expect(code).toMatch(/^[A-Z2-9]{4}-[A-Z2-9]{4}-[A-Z2-9]{4}$/);
      const raw = code.replace(/-/g, '');
      expect(raw).toHaveLength(INVITE_CODE_LENGTH);
      for (const ch of raw) expect(INVITE_CODE_ALPHABET).toContain(ch);
    }
  });

  it('leaves out the characters people confuse', () => {
    for (const ch of '01OILU') expect(INVITE_CODE_ALPHABET).not.toContain(ch);
  });

  it('does not repeat itself across many draws', () => {
    const seen = new Set(Array.from({ length: 5000 }, generateInviteCode));
    expect(seen.size).toBe(5000);
  });

  it('forgives case, spaces and dashes, and nothing else', () => {
    expect(normalizeInviteCode(' abcd-efgh 2345 ')).toBe('ABCDEFGH2345');
    expect(normalizeInviteCode('ABCD-EFGH-234')).toBeNull(); // short
    expect(normalizeInviteCode('ABCD-EFGH-2340')).toBeNull(); // 0 is not in the alphabet
    expect(normalizeInviteCode('ABCD-EFGH-23456')).toBeNull(); // long
    expect(normalizeInviteCode(undefined)).toBeNull();
    expect(normalizeInviteCode(12)).toBeNull();
  });

  it('hashes the canonical form, so every spelling of one code hashes alike', () => {
    const a = normalizeInviteCode('abcd-efgh-2345')!;
    const b = normalizeInviteCode('ABCDEFGH2345')!;
    expect(hashInviteCode(a)).toBe(hashInviteCode(b));
    expect(hashInviteCode(a)).toMatch(/^[0-9a-f]{64}$/);
    expect(inviteCodeHint(a)).toBe('2345');
  });
});
