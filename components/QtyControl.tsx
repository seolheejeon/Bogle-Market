"use client";

import { useCart } from "@/lib/cart-context";

// max는 재고 한도(stock/옵션재고 중 가장 작은 값)가 정해진 경우에만 전달됨 —
// undefined면 재고 제한 없음. closed는 이벤트 자체가 STRICT_DEADLINE 정책으로
// 마감된 경우(lib/order-policy.ts) — 재고와 별개로 이 상품을 담을 수 없다는
// 뜻. optionValueIds는 이 조합이 장바구니의 어느 줄에 해당하는지 구분하는
// 키 — 안 주면(옵션 없는 상품) 빈 배열과 동일하게 취급된다.
export function QtyControl({
  productId,
  optionValueIds,
  max,
  closed,
}: {
  productId: string;
  optionValueIds?: string[];
  max?: number;
  closed?: boolean;
}) {
  const { getQty, changeQty } = useCart();
  const qty = getQty(productId, optionValueIds);

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
          changeQty(productId, 1, optionValueIds);
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
          changeQty(productId, -1, optionValueIds);
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
          changeQty(productId, 1, optionValueIds);
        }}
      >
        +
      </button>
    </div>
  );
}
