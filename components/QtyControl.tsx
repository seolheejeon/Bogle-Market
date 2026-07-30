"use client";

import { useCart } from "@/lib/cart-context";

// max는 재고 한도(stock)가 정해진 상품에만 전달됨 — undefined면 재고 제한 없음.
// closed는 이벤트 자체가 STRICT_DEADLINE 정책으로 마감된 경우(lib/order-policy.ts) —
// 재고와 별개로 이 상품을 담을 수 없다는 뜻.
export function QtyControl({ productId, max, closed }: { productId: string; max?: number; closed?: boolean }) {
  const { cart, changeQty } = useCart();
  const qty = cart[productId] || 0;

  if (closed) {
    return <span className="shrink-0 rounded-full bg-bg-sunken px-2.5 py-1 text-[11px] font-bold text-text-muted">마감</span>;
  }
  if (max === 0) {
    return <span className="shrink-0 rounded-full bg-bg-sunken px-2.5 py-1 text-[11px] font-bold text-text-muted">품절</span>;
  }

  if (qty <= 0) {
    return (
      <button
        className="h-[30px] w-[30px] shrink-0 rounded-full bg-accent text-lg font-bold text-white"
        onClick={(e) => {
          e.stopPropagation();
          e.preventDefault();
          changeQty(productId, 1);
        }}
      >
        +
      </button>
    );
  }
  const atMax = max !== undefined && qty >= max;
  return (
    <div className="flex items-center gap-1.5">
      <button
        className="h-[26px] w-[26px] rounded-full border border-border bg-bg-card text-sm text-text"
        onClick={(e) => {
          e.stopPropagation();
          e.preventDefault();
          changeQty(productId, -1);
        }}
      >
        −
      </button>
      <span className="min-w-3.5 text-center text-sm font-bold">{qty}</span>
      <button
        className="h-[26px] w-[26px] rounded-full border border-border bg-bg-card text-sm text-text disabled:opacity-40"
        disabled={atMax}
        onClick={(e) => {
          e.stopPropagation();
          e.preventDefault();
          changeQty(productId, 1);
        }}
      >
        +
      </button>
    </div>
  );
}
