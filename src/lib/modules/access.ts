import { cache } from 'react';

import { auth } from '@/lib/auth';
import { getEntitlements } from '@/lib/billing';
import { withTenant } from '@/lib/db';
import { tenantScopeOf, TenantScopeError, type TenantScope } from '@/lib/tenant';
import type { ModuleDenyReason, SessionViewer } from '@/lib/modules/state-machine';
import { getAllManifests } from '@/lib/modules/registry';
import { decideModuleAccess, type ModuleAccessResult } from '@/lib/modules/tenant-access';
import type { ModuleId, ModuleStatus } from '@/lib/modules/types';
import { MODULE_UNAVAILABLE_DIGEST } from '@/lib/module-unavailable';

export type { ModuleAccessResult } from '@/lib/modules/tenant-access';

/**
 * The module gate — the one place that turns a `ModuleState` row into an answer.
 *
 * This file existed before but nothing called it, so a module moved to `DEV` or
 * `OFF` in `/admin/modules` stayed fully usable by everyone
 * (docs/agent-results/TASK-MTQV9DOEBLYES-blockzincir-pm.md §4). Pages now go through
 * `moduleGate()` in ./guard.tsx and server actions through `assertModuleAccess()`
 * below; the status semantics themselves live in `canAccessStatus()` in
 * ./state-machine.ts, per CLAUDE.md §3 ("dependency and cascade logic only in the
 * state machine; the UI calls it, never copies it").
 *
 * TASK-MTQZ8MVAU3J7I — the gate then read *only* `ModuleState`, so CLAUDE.md §4
 * ("a module may be `on` and still be outside the plan") was unenforced: the demo
 * tenant sat on `pro`, whose catalogue grant is M1/M2/M3/M4/M5/M8, while its
 * `ModuleState` row for M10 said `ON`, and every M10 page and action opened. A row
 * left behind by a downgrade, or written straight into the database, was a free
 * upgrade. The plan half of the decision is now checked here, in the same call, so
 * no caller can hold one gate and miss the other.
 */

/** Thrown by `assertModuleAccess`, so a caller can tell a gate refusal from a crash. */
export class ModuleAccessError extends Error {
  readonly code = MODULE_UNAVAILABLE_DIGEST;
  /** Kept by Next.js across the action boundary: src/lib/module-unavailable.ts. */
  readonly digest = MODULE_UNAVAILABLE_DIGEST;

  constructor(
    readonly moduleId: ModuleId,
    readonly status: ModuleStatus,
    readonly reason: ModuleDenyReason,
  ) {
    super(`Module ${moduleId} is not available (${status}/${reason}).`);
    this.name = 'ModuleAccessError';
  }
}

/** The session's viewer: role and staff flag only, never the API-key `isMachine`. */
function sessionViewerOf(scope: TenantScope): SessionViewer {
  return { role: scope.role, isPlatformAdmin: scope.isPlatformAdmin };
}

/**
 * TASK-MVBEM10PJYU0E (FO-12, Ö-2) — what one request reads, read once.
 *
 * A module page used to pay for its gate twice: the app shell's
 * `listAccessibleModules` read `ModuleState` and the entitlement, then the page's
 * `moduleGate` read both again, and each of the three `auth()` calls re-ran the jwt
 * callback's membership lookup. React `cache()` keeps one answer per request:
 * the store lives in the render that asked and is dropped with it, so nothing
 * here outlives the request or reaches another session. Outside a server render
 * (a test, a script) `cache()` memoises nothing and every call reads afresh.
 *
 * Only the *facts* are cached, keyed by tenant id; the decision is still made per
 * call by `decideModuleAccess`, with the viewer from the session.
 */
export const requestSession = cache(() => auth());

interface TenantModuleFacts {
  statusById: ReadonlyMap<string, ModuleStatus>;
  allowedModules: readonly string[];
}

const tenantModuleFacts = cache(
  (tenantId: string): Promise<TenantModuleFacts> =>
    withTenant(tenantId, async (tx) => {
      const [states, entitlements] = await Promise.all([
        tx.moduleState.findMany({
          where: { tenantId },
          select: { moduleId: true, status: true },
        }),
        getEntitlements(tenantId, tx),
      ]);
      return {
        statusById: new Map<string, ModuleStatus>(
          states.map((row: { moduleId: string; status: string }) => [row.moduleId, row.status as ModuleStatus]),
        ),
        allowedModules: entitlements.allowedModules,
      };
    }),
);

/**
 * Decide whether the session's viewer may use `moduleId`, on two facts:
 *
 *   1. **Entitlement** — does the tenant's plan (plus its active add-ons) include
 *      the module at all? Read through `getEntitlements`, which computes from
 *      `PLAN_GRANTS` in the billing catalogue rather than from the `Plan` row, so
 *      a stale or hand-edited row cannot hand out a module.
 *   2. **Status** — has the tenant switched it on, and is this viewer in the
 *      audience that `ModuleState` opens it to (`canAccessStatus`)?
 *
 * Entitlement is checked first because it produces the truthful answer: a tenant
 * that never bought the module must be told to upgrade, not that "your workspace
 * administrator turned it off", which invites them to go and turn on something
 * they do not own. The order only matters for the wording — both refusals deny.
 *
 * A missing `ModuleState` row means the tenant was never granted the module, which
 * is `OFF` — the same default the Prisma column carries.
 *
 * The plan gate binds platform admins too. Their bypass in `canAccessStatus` is
 * about *status* (`DEV` is staff-only work in progress); entitlement is a fact
 * about what the tenant bought, and staff standing inside a tenant workspace do
 * not change it. Opening a module for a tenant below its plan is done by selling
 * it — an `AddOn` row, which `getEntitlements` already honours — not by a session.
 */
export async function checkModuleAccess(moduleId: ModuleId): Promise<ModuleAccessResult> {
  const scope = tenantScopeOf(await requestSession());

  if (!scope) {
    return { allowed: false, status: 'OFF', reason: 'NO_TENANT' };
  }

  const facts = await tenantModuleFacts(scope.tenantId);
  return decideModuleAccess(moduleId, facts.statusById.get(moduleId) ?? 'OFF', facts.allowedModules, sessionViewerOf(scope));
}

/**
 * Every module the session's viewer may open, for the app shell's `ModuleProvider`
 * (sidebar entries, opportunity tabs, cross-links). Same answer as calling
 * `checkModuleAccess` once per module, from the same per-request read.
 *
 * Navigation only: a hidden link is not a closed door, so every page behind these
 * entries still runs `moduleGate` and every action `assertModuleAccess`.
 */
export async function listAccessibleModules(): Promise<ModuleId[]> {
  return (await listModuleNav()).activeModules;
}

/**
 * What the app shell's navigation shows, read off the same per-module decision
 * as `checkModuleAccess`:
 *
 *   - `activeModules` — open for this viewer (the `listAccessibleModules` answer);
 *   - `previewStatus` — the open ones that are not `ON` yet (`PILOT`, `DEV`), so
 *     the sidebar can say the module is a preview rather than finished;
 *   - `upgradeModules` — refused only because the plan does not include them
 *     (`PLAN_UPGRADE_REQUIRED`), shown locked so a paid module can be found
 *     before it is bought. A module switched off, out of the viewer's audience or
 *     "Yakında" is not listed: nothing the viewer can do opens it.
 */
export interface ModuleNavState {
  activeModules: ModuleId[];
  previewStatus: Partial<Record<ModuleId, 'PILOT' | 'DEV'>>;
  upgradeModules: ModuleId[];
}

export async function listModuleNav(): Promise<ModuleNavState> {
  const nav: ModuleNavState = { activeModules: [], previewStatus: {}, upgradeModules: [] };
  const scope = tenantScopeOf(await requestSession());
  if (!scope) return nav;

  const facts = await tenantModuleFacts(scope.tenantId);
  const viewer = sessionViewerOf(scope);

  for (const { id } of getAllManifests()) {
    const access = decideModuleAccess(id, facts.statusById.get(id) ?? 'OFF', facts.allowedModules, viewer);
    if (access.allowed) {
      nav.activeModules.push(id);
      if (access.status === 'PILOT' || access.status === 'DEV') nav.previewStatus[id] = access.status;
    } else if (access.reason === 'PLAN_UPGRADE_REQUIRED') {
      nav.upgradeModules.push(id);
    }
  }
  return nav;
}

/**
 * For server actions. Throws before any side effect runs.
 *
 * Call it as the *first* statement of the action, above the LLM call: hiding a button
 * in the client is not a gate, and `generateText()` writes an `AiUsageLog` row and
 * debits `CreditLedger` (src/lib/llm.ts) the moment it is reached, so a closed
 * module that was checked afterwards would still have cost the tenant credits.
 *
 * No session is not a module refusal (TASK-MV15MNI79MSWO): it leaves as the same
 * `TenantScopeError` that `requireTenantAction` would have thrown a line later,
 * so the browser says "sign in again" rather than "the module is switched off".
 */
export async function assertModuleAccess(moduleId: ModuleId): Promise<void> {
  const access = await checkModuleAccess(moduleId);
  if (access.reason === 'NO_TENANT') throw new TenantScopeError();
  if (!access.allowed) {
    throw new ModuleAccessError(moduleId, access.status, access.reason ?? 'MODULE_OFF');
  }
}
