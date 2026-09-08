'use client';

import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import {
  type BillingCycle,
  type DiscountTier,
  type PricedLine,
} from '@/lib/billing/catalog';

/**
 * What the cart stores: *which* catalogue line, never how much it costs.
 *
 * The cart used to carry `price`, `originalPrice` and `discountPercent` as
 * floats and post them to checkout, which is how the browser got to name its
 * own price. It also meant a cart left in localStorage kept quoting a campaign
 * that had already ended.
 *
 * It then derived the amounts in the browser from the static catalogue, which
 * held for as long as the catalogue was the price. Since TASK-MTSHVKTSGC8A4 a
 * plan's price is the published `PlanVersion` the studio wrote, and which plans
 * a viewer may buy at all depends on their tenant — neither of which the
 * browser can know. So the amounts now come from `POST /api/billing/quote`,
 * which prices exactly as `POST /api/billing/checkout` charges.
 */
export interface CartItem {
  /** Catalogue sku (`plan-pro`, `lifetime-ultra`). The only price authority. */
  sku: string;
  type: 'plan' | 'lifetime' | 'credits' | 'addon';
  name: string;
  subtitle?: string;
  billingCycle: BillingCycle;
  quantity: number;
}

/**
 * A cart line with the server's price attached, ready to render.
 *
 * `priced` is null while the quote has not arrived or could not be obtained.
 * The row still lists — the customer must be able to see and remove what is in
 * their cart — but it carries no figure, because the only figure available in
 * that state would be one the browser invented.
 */
export interface PricedCartItem extends CartItem {
  priced: PricedLine | null;
}

export interface CartTotals {
  /** Undiscounted total, in minor units. */
  subtotalMinor: number;
  /** What the campaign takes off, in minor units. */
  discountMinor: number;
  /** What checkout will charge, in minor units. */
  totalMinor: number;
  currency: string;
  lines: PricedCartItem[];
  /**
   * False while the server has not answered yet, or could not. The drawer shows
   * no figure in that state: a total the browser made up is the defect, not the
   * fallback.
   */
  measured: boolean;
  /** Skus the server refused to price for this viewer, dropped from `lines`. */
  unavailable: string[];
}

interface CartContextType {
  cartItems: CartItem[];
  isOpen: boolean;
  /** The campaign the server is running. Read-only to every screen. */
  activeTier: DiscountTier;
  openCart: () => void;
  closeCart: () => void;
  toggleCart: () => void;
  addToCart: (item: CartItem) => void;
  removeFromCart: (sku: string) => void;
  clearCart: () => void;
  getCartTotal: () => CartTotals;
}

const CartContext = createContext<CartContextType | undefined>(undefined);

/**
 * v2: v1 entries carried float prices and a client-chosen discount. Reading one
 * back under the new shape would render `NaN` and, worse, imply a price nobody
 * would honour — so the key changes and stale carts are simply dropped.
 */
const CART_STORAGE_KEY = 'fonbridge_cart_items_v2';

/** Drops anything that is not a `{sku, quantity}` line of the current shape. */
function readStoredItems(): CartItem[] {
  try {
    const stored = localStorage.getItem(CART_STORAGE_KEY);
    if (!stored) return [];
    const parsed: unknown = JSON.parse(stored);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (item): item is CartItem =>
        Boolean(item) &&
        typeof item === 'object' &&
        typeof (item as CartItem).sku === 'string' &&
        Number.isInteger((item as CartItem).quantity)
    );
  } catch {
    return [];
  }
}

export function CartProvider({
  children,
  activeTier,
}: {
  children: React.ReactNode;
  /** Comes from `getActiveTier()` in the server layout — never chosen here. */
  activeTier: DiscountTier;
}) {
  const [cartItems, setCartItems] = useState<CartItem[]>(readStoredItems);
  const [isOpen, setIsOpen] = useState(false);

  useEffect(() => {
    try {
      localStorage.setItem(CART_STORAGE_KEY, JSON.stringify(cartItems));
    } catch {
      // A blocked or full localStorage must not break the cart itself.
    }
  }, [cartItems]);

  const openCart = () => setIsOpen(true);
  const closeCart = () => setIsOpen(false);
  const toggleCart = () => setIsOpen((prev) => !prev);

  const addToCart = (newItem: CartItem) => {
    setCartItems((prevItems) => {
      // A subscription plan or a lifetime licence replaces any other one.
      if (newItem.type === 'plan' || newItem.type === 'lifetime') {
        const others = prevItems.filter((i) => i.type !== 'plan' && i.type !== 'lifetime');
        return [...others, newItem];
      }
      const existingIndex = prevItems.findIndex((i) => i.sku === newItem.sku);
      if (existingIndex > -1) {
        return prevItems.map((item, index) =>
          index === existingIndex
            ? { ...item, quantity: item.quantity + (newItem.quantity || 1) }
            : item
        );
      }
      return [...prevItems, newItem];
    });
    setIsOpen(true);
  };

  const removeFromCart = (sku: string) => {
    setCartItems((prev) => prev.filter((item) => item.sku !== sku));
  };

  const clearCart = () => setCartItems([]);

  /**
   * The cart, as a stable string. Used to tell a quote that belongs to what is
   * in the cart right now from one that answered an older cart — a stale total
   * next to a "Pay" button is the same defect as an invented one.
   */
  const signature = JSON.stringify(
    cartItems.map((item) => [item.sku, item.quantity, item.billingCycle])
  );

  /**
   * What the server says this cart costs, and which cart it was asked about.
   *
   * `null` until the first answer arrives, and whenever one could not be
   * obtained. It is deliberately not seeded with a locally computed total: the
   * browser does not know the published plan version or this tenant's
   * visibility, so any figure it produced would be a guess sitting next to a
   * "Pay" button.
   */
  const [quote, setQuote] = useState<{ signature: string; totals: CartTotals } | null>(null);

  useEffect(() => {
    // An empty cart needs no server round trip; `getCartTotal` answers it
    // directly, so nothing is set here.
    if (cartItems.length === 0) return;

    // A cart edited again before the answer lands must not be overwritten by
    // the stale one.
    let current = true;
    const controller = new AbortController();
    const asked = signature;

    (async () => {
      try {
        const response = await fetch('/api/billing/quote', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          signal: controller.signal,
          body: JSON.stringify({
            items: cartItems.map((item) => ({
              sku: item.sku,
              quantity: item.quantity,
              billingCycle: item.billingCycle,
            })),
          }),
        });
        if (!response.ok) throw new Error(`quote responded ${response.status}`);
        const data = (await response.json()) as {
          lines?: PricedLine[];
          unavailable?: string[];
          subtotalMinor?: number;
          discountMinor?: number;
          totalMinor?: number;
          currency?: string;
        };
        if (!current) return;

        // Each priced line is matched back to the cart row it came from, so the
        // drawer keeps its own labels while every amount stays the server's.
        const lines: PricedCartItem[] = (data.lines ?? []).map((priced) => {
          const item = cartItems.find((candidate) => candidate.sku === priced.sku);
          return {
            sku: priced.sku,
            type: item?.type ?? 'plan',
            name: item?.name ?? priced.name,
            subtitle: item?.subtitle,
            billingCycle: priced.billingCycle,
            quantity: priced.quantity,
            priced,
          };
        });

        setQuote({
          signature: asked,
          totals: {
            subtotalMinor: data.subtotalMinor ?? 0,
            discountMinor: data.discountMinor ?? 0,
            totalMinor: data.totalMinor ?? 0,
            currency: data.currency ?? 'USD',
            lines,
            measured: true,
            unavailable: data.unavailable ?? [],
          },
        });
      } catch (error) {
        if (!current || (error instanceof DOMException && error.name === 'AbortError')) return;
        // Unmeasured, not zero: the drawer says it cannot price the cart rather
        // than showing a total nobody would honour.
        setQuote(null);
      }
    })();

    return () => {
      current = false;
      controller.abort();
    };
    // `signature` is what actually changes the request; `cartItems` is read
    // inside and changes identity on every render of the provider's parent.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [signature]);

  const getCartTotal = useCallback((): CartTotals => {
    if (cartItems.length === 0) {
      return {
        subtotalMinor: 0,
        discountMinor: 0,
        totalMinor: 0,
        currency: 'USD',
        lines: [],
        measured: true,
        unavailable: [],
      };
    }
    // A quote for a different cart is no quote at all.
    if (quote && quote.signature === signature) return quote.totals;
    return {
      subtotalMinor: 0,
      discountMinor: 0,
      totalMinor: 0,
      currency: 'USD',
      // The rows are the cart's own, so the drawer can still list and remove
      // what is in it while the prices are unknown.
      lines: cartItems.map((item) => ({ ...item, priced: null })),
      measured: false,
      unavailable: [],
    };
  }, [quote, cartItems, signature]);

  return (
    <CartContext.Provider
      value={{
        cartItems,
        isOpen,
        activeTier,
        openCart,
        closeCart,
        toggleCart,
        addToCart,
        removeFromCart,
        clearCart,
        getCartTotal,
      }}
    >
      {children}
    </CartContext.Provider>
  );
}

export function useCart() {
  const context = useContext(CartContext);
  if (!context) {
    throw new Error('useCart must be used within a CartProvider');
  }
  return context;
}
