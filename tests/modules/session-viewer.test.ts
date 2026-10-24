import { describe, test, expect } from 'vitest';
import { canAccessStatus, type MachineViewer, type ModuleViewer, type SessionViewer } from '@/lib/modules/state-machine';

/**
 * TASK-MVDV63H2OCK0 (FO-80 review §2) — `isMachine` opens `PILOT` to an API key,
 * so a session path that set it would open a pilot module to every member. The gate
 * takes `ModuleViewer` = `SessionViewer | MachineViewer`, and no session value can
 * carry `isMachine`. The `@ts-expect-error` line is the compile-time check: `pnpm
 * typecheck` fails ("Unused '@ts-expect-error' directive") the day a session viewer
 * accepts the flag again. The runtime tests pin what each viewer means.
 */

const session: SessionViewer = { role: 'TENANT_MEMBER', isPlatformAdmin: false };

describe('SessionViewer', () => {
  test('a session viewer is a ModuleViewer, and PILOT stays closed to a plain member', () => {
    const asViewer: ModuleViewer = session;
    expect(canAccessStatus('PILOT', asViewer)).toEqual({ allowed: false, reason: 'PILOT_MANAGERS_ONLY' });
  });

  test('a session cannot forge the machine flag into the gate (compile-time refusal)', () => {
    // @ts-expect-error — `isMachine: true` is refused: only the API-key viewer may open PILOT
    const forged: ModuleViewer = { ...session, isMachine: true };
    // The object is still built at runtime; the type is the guard, so only its shape is asserted.
    expect(forged.role).toBe('TENANT_MEMBER');
  });

  test('the machine viewer is the one that opens PILOT to a non-manager', () => {
    const machine: MachineViewer = { kind: 'machine', role: 'API_KEY', isPlatformAdmin: false, isMachine: true };
    expect(canAccessStatus('PILOT', machine)).toEqual({ allowed: true });
  });
});
