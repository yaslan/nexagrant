'use client';

import React, { createContext, useContext, useState, useEffect } from 'react';

export interface CartItem {
  id: string;
  type: 'plan' | 'lifetime' | 'credits' | 'addon';
  name: string;
  subtitle?: string;
  price: number;
  originalPrice?: number;
  billingCycle?: 'monthly' | 'yearly' | 'one-time';
  quantity: number;
  promoCode?: string;
  discountPercent?: number;
  details?: string[];
}

export interface DiscountTier {
  id: number;
  labelTr: string;
  labelEn: string;
  discount: number;
  code: string;
  statusTr?: string;
  statusEn?: string;
}

interface CartContextType {
  cartItems: CartItem[];
  isOpen: boolean;
  activeCoupon: string;
  discountPercent: number;
  openCart: () => void;
  closeCart: () => void;
  toggleCart: () => void;
  addToCart: (item: CartItem) => void;
  removeFromCart: (id: string) => void;
  clearCart: () => void;
  applyCoupon: (code: string, discount: number) => void;
  getCartTotal: () => { subtotal: number; discountAmount: number; total: number };
}

const CartContext = createContext<CartContextType | undefined>(undefined);

const CART_STORAGE_KEY = 'fonbridge_cart_items_v1';
const COUPON_STORAGE_KEY = 'fonbridge_cart_coupon_v1';

export function CartProvider({ children }: { children: React.ReactNode }) {
  const [cartItems, setCartItems] = useState<CartItem[]>([]);
  const [isOpen, setIsOpen] = useState(false);
  const [activeCoupon, setActiveCoupon] = useState<string>('ILK5');
  const [discountPercent, setDiscountPercent] = useState<number>(70);
  const [isHydrated, setIsHydrated] = useState(false);

  // Restore cart state from localStorage on mount
  useEffect(() => {
    try {
      const storedItems = localStorage.getItem(CART_STORAGE_KEY);
      if (storedItems) {
        setCartItems(JSON.parse(storedItems));
      }
      const storedCoupon = localStorage.getItem(COUPON_STORAGE_KEY);
      if (storedCoupon) {
        const parsed = JSON.parse(storedCoupon);
        setActiveCoupon(parsed.code || 'ILK5');
        setDiscountPercent(parsed.discount ?? 70);
      }
    } catch {
      // Ignore localStorage errors
    } finally {
      setIsHydrated(true);
    }
  }, []);

  // Sync to localStorage
  useEffect(() => {
    if (!isHydrated) return;
    try {
      localStorage.setItem(CART_STORAGE_KEY, JSON.stringify(cartItems));
      localStorage.setItem(COUPON_STORAGE_KEY, JSON.stringify({ code: activeCoupon, discount: discountPercent }));
    } catch {
      // Ignore
    }
  }, [cartItems, activeCoupon, discountPercent, isHydrated]);

  const openCart = () => setIsOpen(true);
  const closeCart = () => setIsOpen(false);
  const toggleCart = () => setIsOpen((prev) => !prev);

  const addToCart = (newItem: CartItem) => {
    setCartItems((prevItems) => {
      // If adding a main subscription plan or lifetime, replace any existing main plan in cart
      if (newItem.type === 'plan' || newItem.type === 'lifetime') {
        const nonPlanItems = prevItems.filter((i) => i.type !== 'plan' && i.type !== 'lifetime');
        return [...nonPlanItems, { ...newItem, promoCode: activeCoupon, discountPercent }];
      }
      // If adding credits or add-ons, update quantity if already present or append
      const existingIndex = prevItems.findIndex((i) => i.id === newItem.id);
      if (existingIndex > -1) {
        const updated = [...prevItems];
        updated[existingIndex].quantity += newItem.quantity || 1;
        return updated;
      }
      return [...prevItems, { ...newItem, promoCode: activeCoupon, discountPercent }];
    });
    setIsOpen(true);
  };

  const removeFromCart = (id: string) => {
    setCartItems((prev) => prev.filter((item) => item.id !== id));
  };

  const clearCart = () => {
    setCartItems([]);
  };

  const applyCoupon = (code: string, discount: number) => {
    setActiveCoupon(code);
    setDiscountPercent(discount);
    // Update promo details on items
    setCartItems((prev) =>
      prev.map((item) => ({
        ...item,
        promoCode: code,
        discountPercent: discount,
      }))
    );
  };

  const getCartTotal = () => {
    let subtotal = 0;
    let discountAmount = 0;

    cartItems.forEach((item) => {
      const itemSubtotal = item.originalPrice ? item.originalPrice * item.quantity : item.price * item.quantity;
      subtotal += itemSubtotal;

      // Apply discount tier percentage if applicable
      const itemDiscountRate = item.type === 'lifetime' ? 50 : (item.discountPercent ?? discountPercent);
      const itemDiscount = (itemSubtotal * itemDiscountRate) / 100;
      discountAmount += itemDiscount;
    });

    const total = Math.max(0, subtotal - discountAmount);
    return { subtotal, discountAmount, total };
  };

  return (
    <CartContext.Provider
      value={{
        cartItems,
        isOpen,
        activeCoupon,
        discountPercent,
        openCart,
        closeCart,
        toggleCart,
        addToCart,
        removeFromCart,
        clearCart,
        applyCoupon,
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
