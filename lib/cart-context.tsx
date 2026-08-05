"use client";

import { createContext, useContext, useEffect, useRef, useState, useCallback } from "react";
import { listEvents } from "@/lib/data";
import { useAuth } from "@/lib/auth-context";

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

// 장바구니는 로그인 상태(비회원 vs 각 계정)별로 따로 저장한다 — 예전엔 키가
// 하나뿐이라 A로 로그인해서 담은 걸 로그아웃하거나 B로 로그인해도 그대로
// 보이는 버그가 있었다. 비회원 장바구니는 GUEST_KEY 하나를 공유하고, 로그인
// 계정은 profile.id별로 따로 둔다.
const GUEST_KEY = "bogle_cart_guest";
function accountKey(profileId: string): string {
  return `bogle_cart_${profileId}`;
}

// 이 키 스킴이 생기기 전 모든 사용자가 공유하던 옛 저장 위치 — 배포 직후
// 첫 하이드레이션에서 한 번만 읽어서 지금 로그인 상태(비회원이면 비회원
// 장바구니로, 로그인 상태였다면 그 계정 장바구니로)에 흡수시키고 지운다.
const LEGACY_KEY = "bogle_cart";

// 예전 형식(Record<productId, qty>)으로 저장된 장바구니를 옵션 없는 라인
// 배열로 옮겨준다 — 형식을 바꿨다고 기존 사용자의 장바구니가 그냥 비어
// 보이면 안 되기 때문.
function parseStoredCart(raw: string): CartLine[] {
  const parsed = JSON.parse(raw);
  if (Array.isArray(parsed)) return parsed;
  return Object.entries(parsed as Record<string, number>).map(([productId, qty]) => ({ productId, optionValueIds: [], qty }));
}

function loadCart(key: string): CartLine[] {
  try {
    const raw = window.localStorage.getItem(key);
    return raw ? parseStoredCart(raw) : [];
  } catch {
    return [];
  }
}

function saveCart(key: string, lines: CartLine[]) {
  try {
    window.localStorage.setItem(key, JSON.stringify(lines));
  } catch {
    // 저장 실패(용량 초과 등)해도 화면 상태는 그대로 유지 — 다음 변경 때 다시 시도됨.
  }
}

// 예전 공용 키를 한 번만 읽고 지운다 — 첫 하이드레이션에서 지금 신원의
// 저장소가 비어있을 때만 이 값을 대신 채워 넣는 용도로 쓴다.
function takeLegacyCart(): CartLine[] {
  try {
    const raw = window.localStorage.getItem(LEGACY_KEY);
    if (!raw) return [];
    window.localStorage.removeItem(LEGACY_KEY);
    return parseStoredCart(raw);
  } catch {
    return [];
  }
}

// 비회원으로 담아둔 장바구니를 로그인/회원가입 직후 그 계정의 기존 장바구니
// 위에 얹어준다(수량은 합산) — "비회원으로 담고 로그인하면 그대로 남아있어야
// 한다"는 기대에 맞춘 것. 로그인해서 다른 계정으로 전환하는 경우는 병합하지
// 않고 그 계정 고유의 저장된 장바구니로 그냥 바꿔치기한다.
function mergeLines(base: CartLine[], addition: CartLine[]): CartLine[] {
  const merged = base.map((l) => ({ ...l }));
  for (const a of addition) {
    const key = lineKey(a.productId, a.optionValueIds);
    const existing = merged.find((l) => lineKey(l.productId, l.optionValueIds) === key);
    if (existing) existing.qty += a.qty;
    else merged.push({ ...a });
  }
  return merged;
}

export function CartProvider({ children }: { children: React.ReactNode }) {
  const { profile, loading: authLoading } = useAuth();
  const [lines, setLines] = useState<CartLine[]>([]);
  const [hydrated, setHydrated] = useState(false);
  // 지금 lines/localStorage가 어느 신원(비회원 또는 어느 계정)의 것인지 —
  // 리렌더를 유발할 필요는 없어서 ref로 둔다.
  const activeKeyRef = useRef<string | null>(null);

  useEffect(() => {
    if (authLoading) return; // 로그인 여부가 확정되기 전에는 어느 키를 쓸지 알 수 없어 대기.
    const newKey = profile ? accountKey(profile.id) : GUEST_KEY;

    if (activeKeyRef.current === null) {
      // 첫 하이드레이션 — 지금 신원의 저장소를 읽고, 비어있으면 옛 공용 키를
      // 한 번만 흡수한다.
      const existing = loadCart(newKey);
      let initial = existing;
      if (existing.length === 0) {
        const legacy = takeLegacyCart();
        if (legacy.length > 0) {
          initial = legacy;
          saveCart(newKey, initial);
        }
      }
      setLines(initial);
      activeKeyRef.current = newKey;
      setHydrated(true);
      return;
    }

    if (newKey === activeKeyRef.current) return; // 신원 변화 없음(같은 계정으로 재확인 등).

    const wasGuest = activeKeyRef.current === GUEST_KEY;
    if (wasGuest && newKey !== GUEST_KEY) {
      // 비회원 → 로그인/회원가입: 비회원 장바구니를 그 계정 장바구니에 합친다.
      setLines((prevGuestLines) => {
        const targetLines = loadCart(newKey);
        const merged = mergeLines(targetLines, prevGuestLines);
        saveCart(newKey, merged);
        saveCart(GUEST_KEY, []);
        return merged;
      });
    } else {
      // 로그인 → 로그아웃, 또는 계정 전환: 병합 없이 그 신원의 장바구니로 교체.
      setLines(loadCart(newKey));
    }
    activeKeyRef.current = newKey;
  }, [profile, authLoading]);

  useEffect(() => {
    if (!hydrated || !activeKeyRef.current) return;
    saveCart(activeKeyRef.current, lines);
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
