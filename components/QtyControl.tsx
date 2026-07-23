"use client";

import { useCart } from "@/lib/cart-context";

export function QtyControl({ productId }: { productId: string }) {
  const { cart, changeQty } = useCart();
  const qty = cart[productId] || 0;

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
        className="h-[26px] w-[26px] rounded-full border border-border bg-bg-card text-sm text-text"
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
