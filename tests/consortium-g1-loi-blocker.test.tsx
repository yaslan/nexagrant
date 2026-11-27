// @vitest-environment jsdom
/**
 * NG-20 Ö2 — the letter-of-intent blocker on the consortium screen is rendered by no other test.
 *
 * The G1 rule is a code constant (`requireLetterOfIntentForCriticalSeats`, off by default), so the
 * e2e spec can only ever see the "information" branch. This renders the screen with the inputs the
 * gate would get when the rule is on, and asserts the blocker box and the blocking chip. The second
 * case is the same screen with the rule off: the same seat is information, not a blocker.
 */
import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, within } from '@testing-library/react';
import type { G1ConsortiumInputs } from '@/lib/gates/g1-consortium';

// The screen's strings come from the real English catalog, as in the other component tests here.
vi.mock('next-intl', async () => {
  const en = (await import('../messages/en.json')).default as unknown as Record<string, unknown>;
  // Dotted keys ("loi.missingBlocker") walk the nested catalog, as next-intl does.
  const lookup = (ns: string, key: string): string | undefined => {
    let node: unknown = en[ns];
    for (const part of key.split('.')) node = (node as Record<string, unknown> | undefined)?.[part];
    return typeof node === 'string' ? node : undefined;
  };
  const fill = (text: string, values?: Record<string, unknown>) =>
    values ? text.replace(/\{(\w+)\}/g, (m, k: string) => (k in values ? String(values[k]) : m)) : text;
  return {
    useTranslations: (ns: string) => (key: string, values?: Record<string, unknown>) => fill(lookup(ns, key) ?? key, values),
    useLocale: () => 'en',
    useFormatter: () => ({ number: (n: number) => String(n) }),
  };
});
vi.mock('@/lib/hooks/use-action-error-text', () => ({ useActionErrorText: () => () => null }));
vi.mock('@/app/[locale]/(app)/[workspace]/pipeline/[id]/consortium/actions', () => ({
  addSeat: vi.fn(),
  findCandidates: vi.fn(),
  assignSeat: vi.fn(),
  confirmSeat: vi.fn(),
  getConflicts: vi.fn(),
}));

import ConsortiumManager, { type ConsortiumSeat } from '@/app/[locale]/(app)/[workspace]/pipeline/[id]/consortium/manager';

afterEach(cleanup);

// One critical seat "x" whose member has sent no letter of intent.
const seats: ConsortiumSeat[] = [
  { id: 's-x', tenantId: 't-1', opportunityId: 'o-1', roleKey: 'x', required: true, organizationId: 'org-1', status: 'CONFIRMED' },
];

function g1(letterOfIntentRequired: boolean): G1ConsortiumInputs {
  return {
    criticalSeatsCount: 1,
    unfilledCriticalRoles: [],
    criticalRolesWithoutBackup: [],
    criticalRolesWithoutLoi: ['x'],
    letterOfIntentRequired,
    seats: [],
  };
}

function renderScreen(letterOfIntentRequired: boolean) {
  return render(
    <ConsortiumManager
      opportunityId="o-1"
      seats={seats}
      candidates={[]}
      orgMap={{}}
      g1={g1(letterOfIntentRequired)}
      budgetShares={[]}
    />,
  );
}

describe('consortium screen — letter-of-intent gap (NG-20 Ö2)', () => {
  it('rule on: the gap is a G1 blocker box, and the seat chip says it blocks', () => {
    const { queryByTestId, getByTestId } = renderScreen(true);

    expect(getByTestId('consortium-g1-loi-blocker')).toBeTruthy();
    expect(queryByTestId('consortium-g1-loi-info')).toBeNull();

    const row = within(getByTestId('m8-builder-seat-x'));
    expect(row.getByTestId('seat-loi-missing').getAttribute('data-blocking')).toBe('true');
    expect(row.getByTestId('seat-loi-missing').textContent).toBe('No letter: blocks G1');
  });

  it('rule off: the same gap is information, not a blocker', () => {
    const { queryByTestId, getByTestId } = renderScreen(false);

    expect(queryByTestId('consortium-g1-loi-blocker')).toBeNull();
    expect(getByTestId('consortium-g1-loi-info')).toBeTruthy();

    const row = within(getByTestId('m8-builder-seat-x'));
    expect(row.getByTestId('seat-loi-missing').getAttribute('data-blocking')).toBe('false');
  });
});
