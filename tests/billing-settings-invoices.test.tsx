// @vitest-environment jsdom
import React from 'react';
import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen, within } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';

import trMessages from '../messages/tr.json';
import { BillingClient } from '@/app/[locale]/(app)/[workspace]/settings/billing/BillingClient';
import { CartProvider } from '@/components/cart/CartContext';
import { NO_DISCOUNT_TIER } from '@/lib/billing/catalog';
import { lifetimeScarcity } from '@/lib/billing/lifetime-licence';
import type { InvoiceListRow } from '@/lib/billing/invoice-list';
import { storefrontCardsFixture } from './helpers/storefront-plans';

/**
 * The invoice history and the quota cards on /settings/billing.
 *
 * The panel used to ship two constants — `GIB202600000001` and `…014`, "Team
 * Plan", ₺32,220 — under a column headed "GİB fatura no", plus a legal name and
 * VKN 2840958172 nobody registered, and it fell back to `seats: 6,
 * workspaces: 5, aiCreditsMonthly: 1000` whenever the entitlement query failed.
 * These pin the replacement: nothing on this screen states a number the tenant's
 * own rows do not carry (TASK-MTRD91ZLKEQ3A, CLAUDE.md rule 7).
 */

const MEASURED_ENTITLEMENTS = {
  allowedModules: ['M1', 'M2'],
  seats: 6,
  usedSeats: 11,
  workspaces: 1,
  usedWorkspaces: 1,
  aiCreditsMonthly: 500,
  aiCreditsRemaining: 500,
};

const UNMEASURED_ENTITLEMENTS = {
  allowedModules: null,
  seats: null,
  usedSeats: null,
  workspaces: null,
  usedWorkspaces: null,
  aiCreditsMonthly: null,
  aiCreditsRemaining: null,
};

const INVOICE: InvoiceListRow = {
  id: 'inv_1',
  number: 'FB-2026-000001',
  issuedAt: '2026-09-01T09:00:00.000Z',
  currency: 'TRY',
  description: 'Pro Plan (Aylık)',
  amounts: {
    subtotalMinor: 895_000,
    vatMinor: 179_000,
    withholdingMinor: 0,
    payableVatMinor: 179_000,
    totalMinor: 1_074_000,
  },
  filedWithGib: false,
};

function renderPanel(
  props: Partial<React.ComponentProps<typeof BillingClient>> = {}
) {
  return render(
    <NextIntlClientProvider locale="tr" messages={trMessages} timeZone="Europe/Istanbul">
      <CartProvider activeTier={NO_DISCOUNT_TIER}>
        <BillingClient
          workspace="fabrika-beta"
          locale="tr"
          tenantId="tenant-1"
          tenantName="Fabrika Beta"
          currentPlanId="pro"
          activeTier={NO_DISCOUNT_TIER}
          lifetimeScarcity={lifetimeScarcity(null)}
          entitlements={MEASURED_ENTITLEMENTS}
          invoices={[]}
          invoicesMeasured
          buyerIdentity={null}
          plans={storefrontCardsFixture()}
          plansMeasured
          {...props}
        />
      </CartProvider>
    </NextIntlClientProvider>
  );
}

afterEach(cleanup);

describe('billing settings — invoice history', () => {
  it('shows an empty state, and none of the retired demo rows, when nothing was issued', () => {
    renderPanel();

    expect(screen.getByTestId('billing-invoices-empty')).toBeTruthy();
    expect(screen.queryByTestId('billing-invoices')).toBeNull();
    for (const fabricated of ['GIB202600000001', 'GIB202600000014', 'Team Plan', '32,220']) {
      expect(document.body.textContent).not.toContain(fabricated);
    }
  });

  it('never prints the invented buyer identity when no invoice carries one', () => {
    renderPanel();
    expect(document.body.textContent).not.toContain('2840958172');
    expect(document.body.textContent).not.toContain('Demo Ar-Ge');
  });

  it('lists a real invoice with its stored total and both export links', () => {
    renderPanel({ invoices: [INVOICE] });

    const table = within(screen.getByTestId('billing-invoices'));
    expect(table.getByText('FB-2026-000001')).toBeTruthy();
    expect(table.getByText('Pro Plan (Aylık)')).toBeTruthy();
    // ₺8,950.00 base + ₺1,790.00 VAT = ₺10,740.00, straight off the stored lines.
    expect(table.getByText('₺10.740,00')).toBeTruthy();

    const xml = screen.getByRole('link', { name: trMessages.billingPanels.settings.invoiceXml });
    expect(xml.getAttribute('href')).toBe(
      '/api/billing/invoices/FB-2026-000001/export?format=xml'
    );
    const pdf = screen.getByRole('link', { name: trMessages.billingPanels.settings.invoicePdf });
    expect(pdf.getAttribute('href')).toBe(
      '/api/billing/invoices/FB-2026-000001/export?format=pdf'
    );
  });

  it('marks a document as filed with GİB only when it carries an envelope id', () => {
    const { unmount } = renderPanel({ invoices: [INVOICE] });
    expect(screen.getByText(trMessages.billingPanels.settings.invoiceUnfiled)).toBeTruthy();
    unmount();

    renderPanel({ invoices: [{ ...INVOICE, filedWithGib: true }] });
    expect(screen.getByText(trMessages.billingPanels.settings.invoiceFiled)).toBeTruthy();
  });

  it('says the history could not be read rather than calling it empty', () => {
    renderPanel({ invoicesMeasured: false });
    expect(
      screen.getByText(trMessages.billingPanels.settings.invoiceUnreadable, { exact: false })
    ).toBeTruthy();
  });
});

describe('billing settings — quota cards', () => {
  it('shows the measured quota as measured', () => {
    renderPanel();
    expect(screen.getByText('500 / 500')).toBeTruthy();
    expect(screen.getByText('11')).toBeTruthy();
  });

  it('shows a dash, not an invented plan, when nothing could be measured', () => {
    renderPanel({ entitlements: UNMEASURED_ENTITLEMENTS });

    // The fallback that used to stand in for a failed query.
    expect(document.body.textContent).not.toContain('/ 1000');
    expect(document.body.textContent).not.toContain('0 / 1000');
    expect(screen.getByText('— / —')).toBeTruthy();
    expect(
      screen.getAllByText(trMessages.billingPanels.settings.notMeasuredHint).length
    ).toBeGreaterThan(0);
  });
});
