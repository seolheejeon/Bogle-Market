"use client";

import { useCart } from "@/lib/cart-context";
import { flyToCart, showAddedToast } from "@/lib/cart-feedback";

// max는 재고 한도(stock/옵션재고 중 가장 작은 값)가 정해진 경우에만 전달됨 —
// undefined면 재고 제한 없음. closed는 이벤트 자체가 STRICT_DEADLINE 정책으로
// 마감된 경우(lib/order-policy.ts) — 재고와 별개로 이 상품을 담을 수 없다는
// 뜻. optionValueIds는 이 조합이 장바구니의 어느 줄에 해당하는지 구분하는
// 키 — 안 주면(옵션 없는 상품) 빈 배열과 동일하게 취급된다. minQty(기본 1)는
// 처음 담을 때 시작 수량이자, 그 밑으로는 감소 버튼으로 못 내려가는 하한선 —
// 완전히 빼려면(0으로) 이 컨트롤이 아니라 별도 삭제 동작을 써야 한다(CartView).
// photo가 있으면 홈/카테고리/이벤트 상세의 그리드 빠른 담기에서도 상품
// 상세와 같은 토스트 + fly-to-cart 피드백을 보여준다(0에서 처음 담을 때만 —
// 이미 담긴 걸 +/-로 조정할 때는 매번 뜨면 시끄러워서 안 보여줌).
export function QtyControl({
  productId,
  optionValueIds,
  max,
  minQty = 1,
  closed,
  photo,
}: {
  productId: string;
  optionValueIds?: string[];
  max?: number;
  minQty?: number;
  closed?: boolean;
  photo?: string;
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
          changeQty(productId, minQty, optionValueIds);
          showAddedToast();
          if (photo) flyToCart(e.currentTarget, photo);
        }}
      >
        +
      </button>
    );
  }
  const atMin = qty <= minQty;
  return (
    <div className="flex items-center gap-1.5">
      <button
        className="h-[26px] w-[26px] rounded-full border border-border bg-bg-card text-sm text-text disabled:opacity-40"
        disabled={atMin}
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
        onClick={(e) => {
          e.stopPropagation();
          e.preventDefault();
          // 남은 수량을 미리 보여주지 않고, 한도를 넘기려는 시도가 있을 때만
          // 그 자리에서 안내한다 — "재고가 몇 개 안 남았다"는 인상을 계속
          // 노출하지 않기 위함(사용자 요청).
          if (max !== undefined && qty >= max) {
            showAddedToast(`최대 ${max}개까지만 구매할 수 있어요.`);
            return;
          }
          changeQty(productId, 1, optionValueIds);
        }}
      >
        +
      </button>
    </div>
  );
}
