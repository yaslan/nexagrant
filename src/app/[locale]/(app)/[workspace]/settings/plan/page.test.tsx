import { beforeEach, describe, expect, it, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import type { ReactElement } from 'react';
import { SESSION_REQUIRED_DIGEST } from '@/lib/session-required';

/**
 * NG-290 — when the billing state cannot be read, the server log names the cause
 * (class and Prisma code, never the message) instead of a bare "unknown", while the
 * screen still draws the same `ng-trial-error` block and leaks nothing. Logging can
 * never break the page: a thrown value whose getters throw still draws the block.
 */

const { getNgBillingStateAction, getNgCatalogView } = vi.hoisted(() => ({
  getNgBillingStateAction: vi.fn(),
  getNgCatalogView: vi.fn(),
}));

vi.mock('next-intl/server', () => ({
  getTranslations: async () => Object.assign((key: string) => key, { has: () => false }),
}));
vi.mock('@/lib/page-role', () => ({ requireTenantPageRole: async () => undefined }));
vi.mock('@/lib/billing/nexagrant/access', () => ({ NG_PLAN_VIEW_ACTION: 'ng.plan.view' }));
vi.mock('@/lib/billing/nexagrant/actions', () => ({ getNgBillingStateAction }));
vi.mock('@/lib/billing/nexagrant/catalog-view', () => ({ getNgCatalogView }));
vi.mock('./PlanCatalog', () => ({ PlanCatalog: () => <div data-testid="ng-plan-catalog" /> }));
vi.mock('./TrialPanel', () => ({ TrialPanel: () => <div data-testid="ng-trial" /> }));
vi.mock('./PlanLoadError', () => ({
  PlanLoadError: ({ kind, testId }: { kind: string; testId: string }) => <div data-testid={testId} data-kind={kind} />,
}));

/** Stand-in for Prisma's error class: same name and `code`. */
class PrismaClientKnownRequestError extends Error {
  constructor(message: string, readonly code: string) {
    super(message);
    this.name = 'PrismaClientKnownRequestError';
  }
}

let warn: ReturnType<typeof vi.spyOn>;

async function render(): Promise<string> {
  const { default: Page } = await import('./page');
  const el = await Page({ params: Promise.resolve({ workspace: 'w', locale: 'tr' }) });
  return renderToStaticMarkup(el as ReactElement);
}

beforeEach(() => {
  getNgBillingStateAction.mockReset();
  getNgCatalogView.mockReset();
  getNgCatalogView.mockResolvedValue({ plans: [] });
  vi.restoreAllMocks();
  warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
});

describe('settings/plan page — billing state load failure (NG-290)', () => {
  it('logs the class and Prisma code of the thrown error, no tenant data, and draws ng-trial-error', async () => {
    getNgBillingStateAction.mockRejectedValue(
      new PrismaClientKnownRequestError(
        'Transaction API error: Transaction already closed for tenant "Acme Ltd" owner jane@acme.example',
        'P2028',
      ),
    );
    const html = await render();

    expect(warn).toHaveBeenCalledTimes(1);
    const line = String(warn.mock.calls[0]?.[0]);
    expect(line).toBe('[NgPlanSettings] billing state unavailable: unknown (PrismaClientKnownRequestError P2028)');
    for (const word of ['Acme', 'jane', 'Transaction', 'closed']) expect(line, word).not.toContain(word);

    // Screen unchanged: the same error block, the coarse kind, no raw text.
    expect(html).toContain('data-testid="ng-trial-error"');
    expect(html).toContain('data-kind="unknown"');
    expect(html).not.toContain('P2028');
    expect(html).not.toContain('Transaction');
  });

  const getterBomb = (prop: string): object => {
    const err = new Error('bomb');
    Object.defineProperty(err, prop, {
      get() {
        throw new Error(`${prop} getter`);
      },
    });
    return err;
  };
  const hostile: [string, () => unknown][] = [
    ...['name', 'message', 'constructor', 'code', 'digest'].map((p): [string, () => unknown] => [`${p} getter throws`, () => getterBomb(p)]),
    ['Proxy throws on every get', () => new Proxy({}, { get() { throw new Error('trap'); } })],
  ];

  it.each(hostile)('a thrown value whose reads throw (%s) still draws ng-trial-error, not a 500', async (_label, make) => {
    getNgBillingStateAction.mockRejectedValue(make());
    const html = await render();
    expect(html).toContain('data-testid="ng-trial-error"');
    expect(html).toContain('data-kind="unknown"');
    expect(warn).toHaveBeenCalledTimes(1);
    expect(String(warn.mock.calls[0]?.[0])).toMatch(/^\[NgPlanSettings\] billing state unavailable: unknown \([A-Za-z0-9_$]+\)$/);
  });

  it('a console.warn that throws does not break the page either', async () => {
    warn.mockImplementation(() => {
      throw new Error('log sink down');
    });
    getNgBillingStateAction.mockRejectedValue(new PrismaClientKnownRequestError('x', 'P2028'));
    const html = await render();
    expect(html).toContain('data-testid="ng-trial-error"');
  });

  it('a missing session writes no log line and shows the sign-in prompt', async () => {
    getNgBillingStateAction.mockRejectedValue(Object.assign(new Error('no session'), { digest: SESSION_REQUIRED_DIGEST }));
    const html = await render();
    expect(warn).not.toHaveBeenCalled();
    expect(html).toContain('data-testid="ng-plan-session-required"');
  });

  it('the normal path draws ng-trial and logs nothing', async () => {
    getNgBillingStateAction.mockResolvedValue({ planId: 'p', tier: 'pro', trial: { kind: 'none' } });
    const html = await render();
    expect(warn).not.toHaveBeenCalled();
    expect(html).toContain('data-testid="ng-trial"');
    expect(html).not.toContain('ng-trial-error');
  });
});
