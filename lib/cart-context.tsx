"use client";

import { createContext, useContext, useEffect, useState, useCallback } from "react";

type CartMap = Record<string, number>;

interface CartContextValue {
  cart: CartMap;
  count: number;
  setQty: (productId: string, qty: number) => void;
  changeQty: (productId: string, delta: number) => void;
  clear: () => void;
}

const CartContext = createContext<CartContextValue | null>(null);
const STORAGE_KEY = "bogle_cart";

export function CartProvider({ children }: { children: React.ReactNode }) {
  const [cart, setCart] = useState<CartMap>({});
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(STORAGE_KEY);
      if (raw) setCart(JSON.parse(raw));
    } catch {
      // ignore corrupted cart
    }
    setHydrated(true);
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(cart));
  }, [cart, hydrated]);

  const setQty = useCallback((productId: string, qty: number) => {
    setCart((prev) => {
      const next = { ...prev };
      if (qty <= 0) delete next[productId];
      else next[productId] = qty;
      return next;
    });
  }, []);

  const changeQty = useCallback((productId: string, delta: number) => {
    setCart((prev) => {
      const next = { ...prev };
      const qty = Math.max(0, (prev[productId] || 0) + delta);
      if (qty <= 0) delete next[productId];
      else next[productId] = qty;
      return next;
    });
  }, []);

  const clear = useCallback(() => setCart({}), []);

  const count = Object.values(cart).reduce((sum, q) => sum + q, 0);

  return <CartContext.Provider value={{ cart, count, setQty, changeQty, clear }}>{children}</CartContext.Provider>;
}

export function useCart() {
  const ctx = useContext(CartContext);
  if (!ctx) throw new Error("useCart must be used within CartProvider");
  return ctx;
}
