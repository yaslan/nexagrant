/**
 * TASK-MUNZKR3PEV8EI (İNCELEME-75 follow-up) — what a failed plan-editor action
 * hands the browser.
 *
 * It used to be `{ ok: false, code: <e.code>, detail: <e.message> }`: the
 * message went on screen, and a Prisma `P2002` became the translation key
 * `adminPlans.errors.P2002`, which does not exist. Now it is exactly
 * `{ ok: false, code }` with `code` from PLAN_FAILURE_CODES, and every code has
 * a sentence in both languages. The source guard trusts `planFailure` by name
 * (tests/api/response-status-scan.ts), so this file is what holds it to that.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import tr from '../../../../../../messages/tr.json';
import en from '../../../../../../messages/en.json';

const h = vi.hoisted(() => {
  const state = { thrown: null as unknown, admin: vi.fn() };
  /** A repository call that throws whatever the test put in `thrown`. */
  const fail = () =>
    vi.fn(async () => {
      throw state.thrown;
    });
  return Object.assign(state, { fail });
});

vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));
vi.mock('@/lib/tenant', () => ({ requirePlatformAdmin: h.admin }));

vi.mock('@/lib/billing/plan-repository', async (importActual) => ({
  ...(await importActual<typeof import('@/lib/billing/plan-repository')>()),
  createDraftVersion: h.fail(),
  updateDraftVersion: h.fail(),
  publishVersion: h.fail(),
  discardDraftVersion: h.fail(),
  computePublishImpact: h.fail(),
  archivePlan: h.fail(),
  deletePlan: h.fail(),
  setPlanVisibility: h.fail(),
  assignPlanToTenant: h.fail(),
  unassignPlanFromTenant: h.fail(),
}));
vi.mock('@/lib/billing/pilot', async (importActual) => ({
  ...(await importActual<typeof import('@/lib/billing/pilot')>()),
  grantPilot: h.fail(),
}));

import { logger } from '@/lib/logger';
import {
  PublishedVersionImmutableError,
  ImpactNotAcknowledgedError,
  ModuleNotGrantedError,
  PlanInUseError,
  LiveProviderSubscriptionError,
  NoPublishedVersionError,
} from '@/lib/billing/plan-repository';
import { ContractSubscriptionError } from '@/lib/billing/pilot';
import * as actions from './actions';
import { PLAN_FAILURE_CODES } from './failure-codes';

/** Every exported action, called with arguments that reach its repository call. */
const CALLS: Record<string, () => Promise<unknown>> = {
  createDraftAction: () => actions.createDraftAction('plan-1'),
  saveDraftAction: () => actions.saveDraftAction('v-1', {} as never, []),
  discardDraftAction: () => actions.discardDraftAction('v-1'),
  previewImpactAction: () => actions.previewImpactAction('v-1'),
  publishVersionAction: () => actions.publishVersionAction('v-1', 0),
  setVisibilityAction: () => actions.setVisibilityAction('plan-1', 'public'),
  archivePlanAction: () => actions.archivePlanAction('plan-1'),
  deletePlanAction: () => actions.deletePlanAction('plan-1'),
  assignPlanAction: () => actions.assignPlanAction('plan-1', 't-1', ''),
  unassignPlanAction: () => actions.unassignPlanAction('plan-1', 't-1'),
  grantPilotAction: () => actions.grantPilotAction('t-1', false),
};

/** What Prisma throws for a unique violation: a code that is no key, a message with the schema in it. */
function prismaError() {
  return Object.assign(new Error('Unique constraint failed on the fields: (`stripe_price_secret_col`)'), {
    name: 'PrismaClientKnownRequestError',
    code: 'P2002',
    meta: { target: ['stripe_price_secret_col'] },
  });
}

class PlatformAdminRequired extends Error {
  readonly code = 'PLATFORM_ADMIN_REQUIRED';
}

beforeEach(() => {
  vi.restoreAllMocks();
  h.admin.mockReset().mockResolvedValue({ userId: 'admin-1' });
  vi.spyOn(logger, 'error').mockImplementation(() => {});
  vi.spyOn(logger, 'warn').mockImplementation(() => {});
});

describe('admin plan actions — failure shape', () => {
  it('covers every exported action', () => {
    const exported = Object.entries(actions)
      .filter(([, v]) => typeof v === 'function')
      .map(([k]) => k);
    expect(Object.keys(CALLS).sort()).toEqual(exported.sort());
  });

  it.each(Object.keys(CALLS))('%s: a database error answers UNKNOWN, the text goes to the log', async (name) => {
    const e = prismaError();
    h.thrown = e;
    const res = await CALLS[name]!();
    expect(res).toStrictEqual({ ok: false, code: 'UNKNOWN' });
    expect(JSON.stringify(res)).not.toMatch(/P2002|secret_col|constraint/);
    expect(logger.error).toHaveBeenCalledWith(expect.stringContaining('[admin/plans]'), e);
  });

  it.each(Object.keys(CALLS))('%s: a non-admin gets PLATFORM_ADMIN_REQUIRED and nothing else', async (name) => {
    h.admin.mockRejectedValue(new PlatformAdminRequired('Unauthorized: platform admin required.'));
    const res = await CALLS[name]!();
    expect(res).toStrictEqual({ ok: false, code: 'PLATFORM_ADMIN_REQUIRED' });
    expect(logger.error).not.toHaveBeenCalled();
  });

  it('each domain refusal answers its own listed code, without its message', async () => {
    const refusals = [
      new PublishedVersionImmutableError('v-secret'),
      new ImpactNotAcknowledgedError(3, 1),
      new ModuleNotGrantedError('m-secret'),
      new PlanInUseError('plan-secret', 2),
      new LiveProviderSubscriptionError('t-secret', 'stripe'),
      new NoPublishedVersionError('plan-secret'),
      new ContractSubscriptionError('t-secret'),
    ];
    for (const e of refusals) {
      h.thrown = e;
      const res = await actions.assignPlanAction('plan-1', 't-1', '');
      expect(res, e.name).toStrictEqual({ ok: false, code: e.code });
      expect(PLAN_FAILURE_CODES).toContain(e.code);
    }
    expect(logger.error).not.toHaveBeenCalled();
  });

  it('a thrown string or a bare object with a foreign code is UNKNOWN', async () => {
    for (const e of ['boom', { code: 'ECONNREFUSED' }, { code: 42 }, null]) {
      h.thrown = e;
      expect(await actions.deletePlanAction('plan-1')).toStrictEqual({ ok: false, code: 'UNKNOWN' });
    }
  });
});

describe('admin plan failure codes — translations', () => {
  const errors = (m: unknown) =>
    (m as { adminPlans: { errors: Record<string, string> } }).adminPlans.errors;

  it.each([
    ['tr', tr],
    ['en', en],
  ])('%s: every code has a sentence, and no sentence takes a detail', (_, messages) => {
    for (const code of PLAN_FAILURE_CODES) {
      expect(errors(messages)[code], code).toEqual(expect.any(String));
      expect(errors(messages)[code], code).not.toMatch(/\{/);
    }
  });
});
