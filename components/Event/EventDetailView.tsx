"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { getEvent } from "@/lib/data";
import type { MarketEvent } from "@/types";
import { formatDeadlineLabel, formatEventDateChip, formatPrice } from "@/lib/format";
import { EventTypeBadge } from "@/components/Badge";
import { QtyControl } from "@/components/QtyControl";
import { ProductPhoto } from "@/components/ProductPhoto";

export function EventDetailView({ eventId }: { eventId: string }) {
  const router = useRouter();
  const [event, setEvent] = useState<MarketEvent | null | undefined>(undefined);

  useEffect(() => {
    // 노출 꺼둔 상품은 이벤트 상세의 상품 목록에서도 숨긴다.
    getEvent(eventId).then((e) => setEvent(e ? { ...e, products: e.products.filter((p) => p.visible !== false) } : e));
  }, [eventId]);

  if (event === undefined) return <p className="p-4 text-sm text-text-muted">불러오는 중...</p>;
  if (event === null) return <p className="p-4 text-sm text-text-muted">이벤트를 찾을 수 없어요.</p>;

  return (
    <div>
      <div className="flex items-center gap-2 border-b border-border px-4 py-3">
        <button onClick={() => router.back()} className="p-1 text-xl text-text">
          ‹
        </button>
      </div>
      <div className="p-4">
        <div className="mb-2 flex items-center gap-1.5">
          <EventTypeBadge type={event.type} flash={event.isFlash} />
        </div>
        <p className="text-[17px] font-extrabold">{event.title}</p>
        <p className="mt-1 text-[13px] text-text-muted">
          {formatDeadlineLabel(event.deadlineAt)} · 배송예정 {formatEventDateChip(event.deliveryAt)}
        </p>
        <div className="mt-3 rounded-[10px] p-3 text-[12.5px] leading-relaxed whitespace-pre-line" style={{ background: "#fff8e6", color: "#8a6a12" }}>
          {event.notice}
        </div>

        <div className="mt-4">
          {event.products.map((product) => (
            <div key={product.id} className="flex items-center gap-3 border-b border-border py-3 last:border-none">
              <Link href={`/product/${product.id}`} className="block h-[52px] w-[52px] shrink-0">
                <ProductPhoto
                  photo={product.photos?.[0] ?? product.emoji}
                  className="flex h-full w-full items-center justify-center rounded-[10px] bg-accent-soft text-2xl"
                />
              </Link>
              <div className="min-w-0 flex-1">
                <Link href={`/product/${product.id}`} className="mb-0.5 block truncate text-[13.5px] font-semibold">
                  {product.name}
                </Link>
                <p className="text-[13.5px] font-bold">{formatPrice(product.price)}</p>
              </div>
              <QtyControl productId={product.id} max={product.stock} />
            </div>
          ))}
        </div>

        <div className="mt-4 flex gap-2">
          <Link href="/cart" className="flex-1 rounded-[10px] border border-border py-3 text-center text-[13.5px] font-semibold">
            장바구니 보기
          </Link>
          <Link href="/checkout" className="flex-[2] rounded-[10px] bg-accent py-3 text-center text-[13.5px] font-bold text-white">
            바로 주문하기
          </Link>
        </div>
      </div>
    </div>
  );
}
