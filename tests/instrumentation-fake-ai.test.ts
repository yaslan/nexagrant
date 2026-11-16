import { afterEach, describe, expect, it, vi } from 'vitest';

/**
 * NG-209 — server start (src/instrumentation.ts) refuses any server but a development or test one
 * with the e2e fake provider switched on (`E2E_FAKE_AI=true`): it exits instead of serving AI
 * answers no model wrote. Default-deny (sec F1): an unset NODE_ENV is refused too.
 */

const mockEnv = vi.hoisted(() => ({ E2E_FAKE_AI: undefined as string | undefined, NODE_ENV: 'production' as string }));
const declared = vi.hoisted(() => ({ nodeEnv: 'production' as string | undefined }));
vi.mock('@/lib/env', () => ({
  env: mockEnv,
  get declaredNodeEnv() {
    return declared.nodeEnv;
  },
}));
vi.mock('@/lib/db', () => ({ withTenant: vi.fn() }));
vi.mock('../src/lib/auth-secret', () => ({ assertAuthSecretConfigured: () => {} }));
vi.mock('../src/lib/demo-login', () => ({ assertDemoLoginAllowed: () => {} }));
vi.mock('../src/lib/app-url-alert', () => ({ reportAppUrlProblem: async () => {} }));
vi.mock('../src/lib/email/opt-out-secret', () => ({ optOutSecretFallbackWarning: () => null }));

import { register } from '../src/instrumentation';

const runtime = process.env.NEXT_RUNTIME;
afterEach(() => {
  vi.restoreAllMocks();
  if (runtime === undefined) delete process.env.NEXT_RUNTIME;
  else process.env.NEXT_RUNTIME = runtime;
});

function startServer() {
  process.env.NEXT_RUNTIME = 'nodejs';
  const exit = vi.spyOn(process, 'exit').mockImplementation((() => undefined) as never);
  const error = vi.spyOn(console, 'error').mockImplementation(() => {});
  return { exit, error, done: register() };
}

describe('server start with E2E_FAKE_AI', () => {
  it('exits with NODE_ENV=production and the flag on', async () => {
    mockEnv.E2E_FAKE_AI = 'true';
    mockEnv.NODE_ENV = 'production';
    declared.nodeEnv = 'production';
    const { exit, error, done } = startServer();
    await done;
    expect(exit).toHaveBeenCalledWith(1);
    expect(String(error.mock.calls[0]?.[0])).toMatch(/E2E_FAKE_AI/);
  });

  it('starts with NODE_ENV=production and the flag off', async () => {
    mockEnv.E2E_FAKE_AI = undefined;
    mockEnv.NODE_ENV = 'production';
    declared.nodeEnv = 'production';
    const { exit, done } = startServer();
    await done;
    expect(exit).not.toHaveBeenCalled();
  });

  it('starts a development server with the flag on (the e2e web server)', async () => {
    mockEnv.E2E_FAKE_AI = 'true';
    mockEnv.NODE_ENV = 'development';
    declared.nodeEnv = 'development';
    const { exit, done } = startServer();
    await done;
    expect(exit).not.toHaveBeenCalled();
  });

  it('exits with the flag on and NODE_ENV unset (env.NODE_ENV would read the default "development")', async () => {
    mockEnv.E2E_FAKE_AI = 'true';
    mockEnv.NODE_ENV = 'development';
    declared.nodeEnv = undefined;
    const { exit, error, done } = startServer();
    await done;
    expect(exit).toHaveBeenCalledWith(1);
    expect(String(error.mock.calls[0]?.[0])).toMatch(/E2E_FAKE_AI.*NODE_ENV=\(unset\)/s);
  });
});
