import { afterEach, describe, expect, test, vi } from 'vitest';
import { Inngest } from 'inngest';
import { assertInngestDevModeAllowed, InngestDevModeInProductionError } from '../src/lib/env';

// TASK-MUM6CYJFKW69I B-1: INNGEST_DEV=1 in a production server turned /api/inngest
// into an unsigned "run any job" endpoint.
describe('assertInngestDevModeAllowed', () => {
  test('refuses a production build with dev mode on, whatever NODE_ENV says', () => {
    for (const INNGEST_DEV of ['1', 'true', 'TRUE', ' 1 ', 'http://localhost:8288']) {
      for (const NODE_ENV of ['production', 'test', 'development']) {
        expect(() => assertInngestDevModeAllowed({ INNGEST_DEV, NODE_ENV }, true)).toThrow(
          InngestDevModeInProductionError
        );
      }
    }
  });

  test('refuses NODE_ENV=production even on an unbuilt run', () => {
    expect(() => assertInngestDevModeAllowed({ INNGEST_DEV: '1', NODE_ENV: 'production' }, false)).toThrow(
      InngestDevModeInProductionError
    );
  });

  test('allows production with dev mode off', () => {
    for (const INNGEST_DEV of [undefined, '', '0', 'false', 'FALSE']) {
      expect(() => assertInngestDevModeAllowed({ INNGEST_DEV, NODE_ENV: 'production' }, true)).not.toThrow();
    }
  });

  test('allows dev mode outside production', () => {
    expect(() => assertInngestDevModeAllowed({ INNGEST_DEV: '1', NODE_ENV: 'development' }, false)).not.toThrow();
    expect(() => assertInngestDevModeAllowed({ INNGEST_DEV: '1', NODE_ENV: 'test' }, false)).not.toThrow();
  });
});

// src/lib/inngest/client.ts relies on the SDK letting `isDev: false` win over the
// INNGEST_DEV variable. Pin that, so an SDK upgrade that changes the order fails here.
describe('Inngest SDK mode precedence', () => {
  afterEach(() => vi.unstubAllEnvs());

  test('isDev: false keeps cloud mode although INNGEST_DEV=1', () => {
    vi.stubEnv('INNGEST_DEV', '1');
    expect(new Inngest({ id: 't', isDev: false }).mode).toBe('cloud');
  });

  test('isDev: undefined follows INNGEST_DEV (local dev keeps working)', () => {
    vi.stubEnv('INNGEST_DEV', '1');
    expect(new Inngest({ id: 't', isDev: undefined }).mode).toBe('dev');
  });
});
