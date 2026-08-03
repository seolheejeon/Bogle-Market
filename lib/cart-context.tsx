"use client";

import { createContext, useContext, useEffect, useState, useCallback } from "react";
import { listEvents } from "@/lib/data";

// 같은 상품이라도 옵션 조합(색상/사이즈 등)이 다르면 별개의 장바구니 줄로
// 다뤄야 해서, productId 하나에 수량 하나였던 예전 flat map 대신 (상품,
// 옵션조합) 쌍마다 하나씩인 라인 배열로 관리한다. optionValueIds는 항상
// 정렬된 상태로 저장해 같은 조합이 항상 같은 키로 매칭되게 한다.
export interface CartLine {
  productId: string;
  optionValueIds: string[];
  qty: number;
}

function lineKey(productId: string, optionValueIds: string[] = []): string {
  return `${productId}::${[...optionValueIds].sort().join(",")}`;
}

interface CartContextValue {
  lines: CartLine[];
  count: number;
  getQty: (productId: string, optionValueIds?: string[]) => number;
  setQty: (productId: string, qty: number, optionValueIds?: string[]) => void;
  changeQty: (productId: string, delta: number, optionValueIds?: string[]) => void;
  clear: () => void;
}

const CartContext = createContext<CartContextValue | null>(null);
const STORAGE_KEY = "bogle_cart";

// 예전 형식(Record<productId, qty>)으로 저장된 장바구니를 옵션 없는 라인
// 배열로 옮겨준다 — 형식을 바꿨다고 기존 사용자의 장바구니가 그냥 비어
// 보이면 안 되기 때문.
function parseStoredCart(raw: string): CartLine[] {
  const parsed = JSON.parse(raw);
  if (Array.isArray(parsed)) return parsed;
  return Object.entries(parsed as Record<string, number>).map(([productId, qty]) => ({ productId, optionValueIds: [], qty }));
}

export function CartProvider({ children }: { children: React.ReactNode }) {
  const [lines, setLines] = useState<CartLine[]>([]);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(STORAGE_KEY);
      if (raw) setLines(parseStoredCart(raw));
    } catch {
      // ignore corrupted cart
    }
    setHydrated(true);
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(lines));
  }, [lines, hydrated]);

  // 삭제되거나 노출을 꺼둔 상품이 장바구니에 남아있으면 헤더 배지/합계가
  // 실제로 살 수 없는 수량까지 세게 된다 — 하이드레이션 직후 한 번, 지금
  // 살아있는(존재하고 visible인) 상품 목록과 대조해서 더 이상 유효하지 않은
  // 줄을 조용히 지운다. 세션 내내 다시 확인하진 않는다(이벤트 목록에 폴링을
  // 두는 다른 화면이 없는 것과 동일한 수준의 신선도로 충분).
  useEffect(() => {
    if (!hydrated) return;
    listEvents()
      .then((events) => {
        const validIds = new Set<string>();
        for (const e of events) for (const p of e.products) if (p.visible !== false) validIds.add(p.id);
        setLines((prev) => {
          const next = prev.filter((l) => validIds.has(l.productId));
          return next.length === prev.length ? prev : next;
        });
      })
      .catch(() => {
        // 목록을 못 불러왔다고 장바구니를 건드리면 더 나쁘다 — 조용히 무시.
      });
  }, [hydrated]);

  const getQty = useCallback(
    (productId: string, optionValueIds: string[] = []) => {
      const key = lineKey(productId, optionValueIds);
      return lines.find((l) => lineKey(l.productId, l.optionValueIds) === key)?.qty ?? 0;
    },
    [lines],
  );

  const setQty = useCallback((productId: string, qty: number, optionValueIds: string[] = []) => {
    const key = lineKey(productId, optionValueIds);
    setLines((prev) => {
      const next = prev.filter((l) => lineKey(l.productId, l.optionValueIds) !== key);
      if (qty > 0) next.push({ productId, optionValueIds, qty });
      return next;
    });
  }, []);

  const changeQty = useCallback((productId: string, delta: number, optionValueIds: string[] = []) => {
    const key = lineKey(productId, optionValueIds);
    setLines((prev) => {
      const existing = prev.find((l) => lineKey(l.productId, l.optionValueIds) === key);
      const qty = Math.max(0, (existing?.qty ?? 0) + delta);
      const next = prev.filter((l) => lineKey(l.productId, l.optionValueIds) !== key);
      if (qty > 0) next.push({ productId, optionValueIds, qty });
      return next;
    });
  }, []);

  const clear = useCallback(() => setLines([]), []);

  const count = lines.reduce((sum, l) => sum + l.qty, 0);

  return <CartContext.Provider value={{ lines, count, getQty, setQty, changeQty, clear }}>{children}</CartContext.Provider>;
}

export function useCart() {
  const ctx = useContext(CartContext);
  if (!ctx) throw new Error("useCart must be used within CartProvider");
  return ctx;
}
