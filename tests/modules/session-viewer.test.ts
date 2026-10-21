import { describe, test, expect } from 'vitest';
import { canAccessStatus, type ModuleViewer, type SessionViewer } from '@/lib/modules/state-machine';

/**
 * TASK-MVDV63H2OCK0 (FO-80 review §2) — `isMachine` opens `PILOT` to an API key,
 * so a session path that set it would open a pilot module to every member. The
 * session viewer type forbids it at compile time. The `@ts-expect-error` lines are
 * the test: `pnpm typecheck` fails ("Unused '@ts-expect-error' directive") the day
 * `SessionViewer` accepts `isMachine` again. The runtime checks below only pin
 * what the two viewers mean.
 */

const session: SessionViewer = { role: 'TENANT_MEMBER', isPlatformAdmin: false };

// @ts-expect-error — a session viewer cannot claim to be a machine
const spread: SessionViewer = { ...session, isMachine: true };

// @ts-expect-error — not even `false`: the flag does not exist on a session
const explicitFalse: SessionViewer = { role: 'TENANT_MEMBER', isPlatformAdmin: false, isMachine: false };

describe('SessionViewer', () => {
  test('a session viewer is still a ModuleViewer, so the gate accepts it', () => {
    const asViewer: ModuleViewer = session;
    expect(canAccessStatus('PILOT', asViewer)).toEqual({ allowed: false, reason: 'PILOT_MANAGERS_ONLY' });
  });

  test('the machine flag is what opens PILOT, which is why a session must not carry it', () => {
    expect(canAccessStatus('PILOT', { ...session, isMachine: true }).allowed).toBe(true);
    expect([spread, explicitFalse]).toHaveLength(2);
  });
});
