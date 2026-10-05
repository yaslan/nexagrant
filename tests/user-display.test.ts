import { describe, it, expect } from 'vitest';
import { displayUserName, emailLocalPart } from '../src/lib/user-display';

/**
 * The app frame used to invent an identity for a nameless session
 * (`email.includes('ayse') ? 'Prof. Dr. Ayşe Kaya' : 'Dr. Mehmet Yılmaz'`). These cases
 * pin the honest order so the fabrication cannot come back.
 */
describe('displayUserName', () => {
  const UNNAMED = 'İsimsiz kullanıcı';

  it('uses the real name when the session carries one', () => {
    expect(displayUserName('Zeynep Aydın', 'z@x.test', UNNAMED)).toBe('Zeynep Aydın');
  });

  it('falls back to the e-mail local part, never to another person', () => {
    expect(displayUserName(null, 'ayse.nameless@e2e.test', UNNAMED)).toBe('ayse.nameless');
    expect(displayUserName(undefined, 'someone@x.test', UNNAMED)).toBe('someone');
  });

  it('does not treat an "ayse" e-mail as a known person', () => {
    const shown = displayUserName(null, 'ayse@x.test', UNNAMED);
    expect(shown).toBe('ayse');
    expect(shown).not.toContain('Kaya');
  });

  it('falls back to the translated label when nothing is known', () => {
    expect(displayUserName(null, null, UNNAMED)).toBe(UNNAMED);
    expect(displayUserName('   ', '', UNNAMED)).toBe(UNNAMED);
  });
});

describe('emailLocalPart', () => {
  it('returns the part before the @', () => {
    expect(emailLocalPart('a.b@c.test')).toBe('a.b');
  });

  it('returns null for anything that is not an addressable e-mail', () => {
    expect(emailLocalPart(null)).toBeNull();
    expect(emailLocalPart('')).toBeNull();
    expect(emailLocalPart('@no-local.test')).toBeNull();
    expect(emailLocalPart('no-at-sign')).toBeNull();
  });
});
