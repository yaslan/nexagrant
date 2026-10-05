import { readFileSync } from 'fs';
import { join } from 'path';
import { describe, expect, it } from 'vitest';
import {
  DemoLoginInProductionError,
  PLATFORM_ADMIN_DEMO_EMAIL,
  assertDemoLoginAllowed,
  configuredOAuthProviders,
  isDemoLoginEnabled,
  isPlatformAdminDemoEmail,
} from './demo-login';

describe('demo sign-in flag (TASK-MULSCEK4JHK8X)', () => {
  it('is off unless the flag says exactly true', () => {
    expect(isDemoLoginEnabled({ NODE_ENV: 'development' })).toBe(false);
    expect(isDemoLoginEnabled({ NODE_ENV: 'development', DEMO_LOGIN_ENABLED: 'false' })).toBe(false);
    expect(isDemoLoginEnabled({ NODE_ENV: 'development', DEMO_LOGIN_ENABLED: 'true' })).toBe(true);
    expect(isDemoLoginEnabled({ NODE_ENV: 'test', DEMO_LOGIN_ENABLED: 'true' })).toBe(true);
  });

  it('stays off in production even with the flag on', () => {
    expect(isDemoLoginEnabled({ NODE_ENV: 'production', DEMO_LOGIN_ENABLED: 'true' })).toBe(false);
  });

  it('refuses to start a production server with the flag on', () => {
    expect(() => assertDemoLoginAllowed({ NODE_ENV: 'production', DEMO_LOGIN_ENABLED: 'true' })).toThrow(
      DemoLoginInProductionError
    );
    expect(() => assertDemoLoginAllowed({ NODE_ENV: 'production' })).not.toThrow();
    expect(() => assertDemoLoginAllowed({ NODE_ENV: 'development', DEMO_LOGIN_ENABLED: 'true' })).not.toThrow();
  });

  // TASK-MULU7GVFBTRXX Ö-1 — a production build started with NODE_ENV=test (or
  // development) used to honour the flag: the lock read only the runtime value.
  it('stays off in a production build whatever NODE_ENV the process is started with', () => {
    for (const NODE_ENV of ['test', 'development', 'production', undefined]) {
      expect(isDemoLoginEnabled({ NODE_ENV, DEMO_LOGIN_ENABLED: 'true' }, true)).toBe(false);
      expect(isPlatformAdminDemoEmail(PLATFORM_ADMIN_DEMO_EMAIL, { NODE_ENV, DEMO_LOGIN_ENABLED: 'true' }, true)).toBe(
        false
      );
    }
    expect(isDemoLoginEnabled({ NODE_ENV: 'test', DEMO_LOGIN_ENABLED: 'true' }, false)).toBe(true);
  });

  it('refuses to start a production build with the flag on, whatever NODE_ENV says', () => {
    for (const NODE_ENV of ['test', 'development', 'production', undefined]) {
      expect(() => assertDemoLoginAllowed({ NODE_ENV, DEMO_LOGIN_ENABLED: 'true' }, true)).toThrow(
        DemoLoginInProductionError
      );
      expect(() => assertDemoLoginAllowed({ NODE_ENV, DEMO_LOGIN_ENABLED: 'false' }, true)).not.toThrow();
      expect(() => assertDemoLoginAllowed({ NODE_ENV }, true)).not.toThrow();
    }
  });

  it('the build-time lock is a direct process.env.NODE_ENV read, which Next inlines at build', () => {
    // Read through the parsed `env` object it would be a runtime value again.
    const source = readFileSync(join(__dirname, 'demo-login.ts'), 'utf8');
    expect(source).toMatch(/const BUILT_FOR_PRODUCTION = process\.env\.NODE_ENV === 'production';/);
  });

  it('the admin address grants platform admin only while demo sign-in is on', () => {
    const on = { NODE_ENV: 'development', DEMO_LOGIN_ENABLED: 'true' };
    const off = { NODE_ENV: 'development' };
    expect(isPlatformAdminDemoEmail(PLATFORM_ADMIN_DEMO_EMAIL, on)).toBe(true);
    expect(isPlatformAdminDemoEmail(` ${PLATFORM_ADMIN_DEMO_EMAIL.toUpperCase()} `, on)).toBe(true);
    expect(isPlatformAdminDemoEmail(PLATFORM_ADMIN_DEMO_EMAIL, off)).toBe(false);
    expect(isPlatformAdminDemoEmail(PLATFORM_ADMIN_DEMO_EMAIL, { ...on, NODE_ENV: 'production' })).toBe(false);
    expect(isPlatformAdminDemoEmail('someone@example.org', on)).toBe(false);
    expect(isPlatformAdminDemoEmail(undefined, on)).toBe(false);
  });

  it('lists an OAuth provider only when both id and secret are set', () => {
    expect(configuredOAuthProviders({})).toEqual({ google: false });
    expect(configuredOAuthProviders({ AUTH_GOOGLE_ID: 'id', AUTH_GOOGLE_SECRET: ' ' })).toEqual({
      google: false,
    });
    // ADR-0006 (owner decision 29.09): Microsoft Entra was removed — its old
    // keys, if still in an environment, list nothing.
    expect(
      configuredOAuthProviders({
        GOOGLE_CLIENT_ID: 'id',
        GOOGLE_CLIENT_SECRET: 's',
        AUTH_MICROSOFT_ENTRA_ID_ID: 'id',
        AUTH_MICROSOFT_ENTRA_ID_SECRET: 's',
      })
    ).toEqual({ google: true });
  });
});
