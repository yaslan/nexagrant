'use client';

import React, { createContext, useContext, useState, useEffect } from 'react';
import {
  priceLine,
  UnknownSkuError,
  UnsupportedCycleError,
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
 * that had already ended. Amounts are now derived on every render from
 * `priceLine()` — the same function the checkout route prices with — under the
 * tier the server hands down, so what the drawer shows and what the server
 * charges cannot drift apart.
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

/** A cart line with its catalogue price attached, ready to render. */
export interface PricedCartItem extends CartItem {
  priced: PricedLine;
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

  const getCartTotal = (): CartTotals => {
    const lines: PricedCartItem[] = [];
    for (const item of cartItems) {
      try {
        lines.push({
          ...item,
          priced: priceLine(
            { sku: item.sku, billingCycle: item.billingCycle, quantity: item.quantity },
            activeTier
          ),
        });
      } catch (error) {
        // A sku the catalogue does not know cannot be shown with a price and
        // would be refused by checkout anyway (400). Skipping it keeps the
        // drawer total equal to what the server will charge.
        if (error instanceof UnknownSkuError || error instanceof UnsupportedCycleError) continue;
        throw error;
      }
    }

    const subtotalMinor = lines.reduce(
      (sum, line) => sum + line.priced.listAmountMinor * line.priced.quantity,
      0
    );
    const totalMinor = lines.reduce((sum, line) => sum + line.priced.totalMinor, 0);

    return {
      subtotalMinor,
      discountMinor: subtotalMinor - totalMinor,
      totalMinor,
      currency: lines[0]?.priced.currency ?? 'USD',
      lines,
    };
  };

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
