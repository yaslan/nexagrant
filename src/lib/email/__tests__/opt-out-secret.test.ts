import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

import { OPT_OUT_SECRET_UNSET, optOutSecretFallbackWarning } from '../opt-out-secret';

/**
 * NG-104 Ö-2 / Ö-3 — an unset EMAIL_OPTOUT_SECRET silently signs opt-out links
 * with AUTH_SECRET. Production gets one startup warning; the warning never
 * carries the key value.
 */

const SESSION_VALUE = 'session-secret-at-least-thirty-two-characters';

describe('optOutSecretFallbackWarning', () => {
  it('warns in production when EMAIL_OPTOUT_SECRET is unset', () => {
    const warning = optOutSecretFallbackWarning({ NODE_ENV: 'production', AUTH_SECRET: SESSION_VALUE });
    expect(warning).toMatch(/EMAIL_OPTOUT_SECRET/);
    expect(warning).toMatch(/AUTH_SECRET/);
  });

  it('treats a blank EMAIL_OPTOUT_SECRET as unset', () => {
    expect(optOutSecretFallbackWarning({ NODE_ENV: 'production', EMAIL_OPTOUT_SECRET: '   ' })).not.toBeNull();
  });

  it('is silent in production when EMAIL_OPTOUT_SECRET is set', () => {
    expect(
      optOutSecretFallbackWarning({ NODE_ENV: 'production', EMAIL_OPTOUT_SECRET: 'a-separate-opt-out-secret-of-32-chars' })
    ).toBeNull();
  });

  it('is silent outside production', () => {
    expect(optOutSecretFallbackWarning({ NODE_ENV: 'development' })).toBeNull();
    expect(optOutSecretFallbackWarning({ NODE_ENV: 'test' })).toBeNull();
  });

  it('never puts the session key value in the warning', () => {
    const warning = optOutSecretFallbackWarning({ NODE_ENV: 'production', AUTH_SECRET: SESSION_VALUE }) ?? '';
    expect(warning).not.toContain(SESSION_VALUE);
  });
});

describe('invitation reason for an unset opt-out key (Ö-3)', () => {
  it('is opt_out_secret_unset', () => {
    expect(OPT_OUT_SECRET_UNSET).toBe('opt_out_secret_unset');
  });

  it('is the reason the invitations route throws, not the old auth_secret_unset', () => {
    const source = readFileSync(resolve(__dirname, '../../../app/api/invitations/route.ts'), 'utf8');
    expect(source).toContain('OPT_OUT_SECRET_UNSET');
    expect(source).not.toContain("'auth_secret_unset'");
  });
});
