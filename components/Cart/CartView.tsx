"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { listEvents } from "@/lib/data";
import type { MarketEvent } from "@/types";
import { formatPrice } from "@/lib/format";
import { useCart } from "@/lib/cart-context";
import { QtyControl } from "@/components/QtyControl";

export function CartView() {
  const { cart } = useCart();
  const [events, setEvents] = useState<MarketEvent[] | null>(null);

  useEffect(() => {
    listEvents().then(setEvents);
  }, []);

  const grouped = useMemo(() => {
    if (!events) return [];
    const byEvent = new Map<string, { event: MarketEvent; items: { product: MarketEvent["products"][number]; qty: number }[] }>();
    for (const event of events) {
      for (const product of event.products) {
        const qty = cart[product.id];
        if (!qty) continue;
        if (!byEvent.has(event.id)) byEvent.set(event.id, { event, items: [] });
        byEvent.get(event.id)!.items.push({ product, qty });
      }
    }
    return Array.from(byEvent.values());
  }, [events, cart]);

  const totalCount = Object.values(cart).reduce((sum, q) => sum + q, 0);
  const totalPrice = grouped.reduce((sum, g) => sum + g.items.reduce((s, i) => s + i.product.price * i.qty, 0), 0);

  if (events === null) return <p className="p-4 text-sm text-text-muted">불러오는 중...</p>;

  if (totalCount === 0) {
    return (
      <div className="p-4">
        <p className="mb-4 text-[15px] font-semibold">장바구니</p>
        <p className="py-16 text-center text-sm text-text-muted">장바구니가 비어있어요.</p>
        <Link href="/" className="block rounded-[10px] bg-accent py-3 text-center text-[13.5px] font-bold text-white">
          쇼핑 계속하기
        </Link>
      </div>
    );
  }

  return (
    <div>
      <div className="border-b border-border px-4 py-3">
        <strong className="text-[15px]">장바구니</strong>
      </div>
      <div className="p-4">
        {grouped.map(({ event, items }) => (
          <div key={event.id} className="mb-4">
            <p className="mb-2 text-xs font-bold text-accent-dark">{event.title}</p>
            {items.map(({ product, qty }) => (
              <div key={product.id} className="flex items-center gap-3 py-2">
                <div className="flex h-[52px] w-[52px] shrink-0 items-center justify-center rounded-[10px] bg-accent-soft text-2xl">{product.emoji}</div>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[13.5px] font-semibold">{product.name}</p>
                  <p className="text-[13.5px] font-bold">{formatPrice(product.price)}</p>
                </div>
                <QtyControl productId={product.id} />
              </div>
            ))}
          </div>
        ))}
      </div>
      <div className="sticky bottom-0 border-t border-border bg-bg-card px-4 py-3.5">
        <div className="mb-2.5 flex justify-between text-[13px]">
          <span className="text-text-muted">상품 {totalCount}개</span>
          <strong className="text-[17px]">{formatPrice(totalPrice)}</strong>
        </div>
        <Link href="/checkout" className="block w-full rounded-[10px] bg-accent py-3 text-center text-[13.5px] font-bold text-white">
          주문하기
        </Link>
      </div>
    </div>
  );
}
