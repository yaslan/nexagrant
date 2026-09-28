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
    expect(configuredOAuthProviders({})).toEqual({ google: false, microsoft: false });
    expect(configuredOAuthProviders({ AUTH_GOOGLE_ID: 'id', AUTH_GOOGLE_SECRET: ' ' })).toEqual({
      google: false,
      microsoft: false,
    });
    expect(
      configuredOAuthProviders({
        GOOGLE_CLIENT_ID: 'id',
        GOOGLE_CLIENT_SECRET: 's',
        AUTH_MICROSOFT_ENTRA_ID_ID: 'id',
        AUTH_MICROSOFT_ENTRA_ID_SECRET: 's',
      })
    ).toEqual({ google: true, microsoft: true });
  });
});
