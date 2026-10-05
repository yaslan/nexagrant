// @vitest-environment jsdom
import React from 'react';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';

import trMessages from '../messages/tr.json';
import { CartProvider } from '@/components/cart/CartContext';
import { CartDrawer } from '@/components/cart/CartDrawer';
import { NO_DISCOUNT_TIER } from '@/lib/billing/catalog';

/**
 * TASK-MTUI9F5YBHTDC, the customer's half of it.
 *
 * Closing the checkout route's session gate gives the drawer a new answer to
 * handle: a signed-out visitor who fills a cart on the public pricing page and
 * presses "Stripe ile ödemeye geç" now gets 401. The drawer's default path for
 * a non-ok response is `setErrorMessage(data.error)`, which would print the
 * server's bare word **"Unauthorized"** into a Turkish panel and leave the
 * visitor with a red box and no way forward — a security fix turned into a lost
 * sale.
 *
 * So the 401 is not an error state here, it is a step in the flow: the click
 * goes to the login page with a `callbackUrl` back to the page the visitor was
 * on. The cart survives because `CartProvider` keeps it in localStorage, which
 * is what makes "sign in, come back, pay" a round trip rather than a restart.
 */

const { pushMock } = vi.hoisted(() => ({ pushMock: vi.fn() }));
vi.mock('next/navigation', () => ({ useRouter: () => ({ push: pushMock }) }));

const CART_STORAGE_KEY = 'fonbridge_cart_items_v2';

/**
 * jsdom runs here without a Storage implementation (`typeof localStorage` is
 * `undefined`), so a real in-memory one is installed — the same approach
 * `tests/notifications-read-store.test.tsx` takes — and `CartProvider` goes
 * through the code path it uses in a browser rather than a mocked one.
 */
function installLocalStorage(): void {
  const entries = new Map<string, string>();
  const storage: Storage = {
    get length() {
      return entries.size;
    },
    clear: () => entries.clear(),
    getItem: (key: string) => entries.get(key) ?? null,
    key: (index: number) => Array.from(entries.keys())[index] ?? null,
    removeItem: (key: string) => {
      entries.delete(key);
    },
    setItem: (key: string, value: string) => {
      entries.set(key, String(value));
    },
  };
  Object.defineProperty(globalThis, 'localStorage', {
    value: storage,
    configurable: true,
    writable: true,
  });
}

/** One plan in the cart, in the shape `CartProvider` stores. */
const STORED_CART = [
  { sku: 'plan-pro', name: 'Pro', quantity: 1, billingCycle: 'monthly', type: 'plan' },
];

/** What `/api/billing/quote` answers for that cart — the server's figures, as always. */
const QUOTE = {
  currency: 'USD',
  subtotalMinor: 8_700,
  discountMinor: 0,
  totalMinor: 8_700,
  unavailable: [],
  lines: [
    {
      sku: 'plan-pro',
      name: 'Pro',
      kind: 'plan',
      billingCycle: 'monthly',
      quantity: 1,
      currency: 'USD',
      amountMinor: 8_700,
      listAmountMinor: 8_700,
      totalMinor: 8_700,
      percentOff: 0,
      campaignCode: 'NONE',
    },
  ],
};

const checkoutCalls: string[] = [];

beforeEach(() => {
  pushMock.mockReset();
  checkoutCalls.length = 0;
  installLocalStorage();
  localStorage.setItem(CART_STORAGE_KEY, JSON.stringify(STORED_CART));

  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes('/api/billing/quote')) {
        return new Response(JSON.stringify(QUOTE), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        });
      }
      if (url.includes('/api/billing/checkout')) {
        checkoutCalls.push(url);
        // Exactly what `requireTenantApi` now returns to a signed-out caller.
        return new Response(
          JSON.stringify({
            error: 'Unauthorized',
            message: 'Oturumunuz bir çalışma alanına bağlı değil. Lütfen tekrar giriş yapın.',
            code: 'TENANT_SCOPE_REQUIRED',
          }),
          { status: 401, headers: { 'Content-Type': 'application/json' } }
        );
      }
      throw new Error(`unexpected fetch: ${url}`);
    })
  );
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  localStorage.clear();
});

function renderDrawer() {
  return render(
    <NextIntlClientProvider locale="tr" messages={trMessages} timeZone="Europe/Istanbul">
      <CartProvider activeTier={NO_DISCOUNT_TIER}>
        <CartDrawer locale="tr" />
      </CartProvider>
    </NextIntlClientProvider>
  );
}

describe('the cart drawer, when checkout answers 401', () => {
  test('sends the visitor to the login page and keeps the cart', async () => {
    renderDrawer();

    // The stored cart arrives one frame after hydration; the floating trigger
    // only exists once it has.
    fireEvent.click(await screen.findByRole('button', { name: 'Sepeti aç' }));
    fireEvent.click(await screen.findByRole('button', { name: /ödemeye geç/i }));

    await waitFor(() => expect(pushMock).toHaveBeenCalledTimes(1));
    const target = pushMock.mock.calls[0]?.[0] as string;
    // `/tr/giris` is `getPublicRoute('login', 'tr')`, and the visitor comes back
    // to the page they were on rather than to a generic home.
    expect(target).toMatch(/^\/tr\/giris\?callbackUrl=/);
    expect(target).toContain(encodeURIComponent(window.location.pathname));

    // The dead end that would otherwise have been shown is not shown.
    expect(screen.queryByText(/Unauthorized/i)).toBeNull();
    expect(screen.queryByText(/Ödeme oturumu başlatılamadı/i)).toBeNull();

    // And the cart is still there to be paid for after signing in.
    expect(JSON.parse(localStorage.getItem(CART_STORAGE_KEY) ?? '[]')).toHaveLength(1);
    // Not vacuous: the drawer really did try to check out.
    expect(checkoutCalls).toHaveLength(1);
  });
});
