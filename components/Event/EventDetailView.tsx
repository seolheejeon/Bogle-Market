"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { getEvent } from "@/lib/data";
import type { MarketEvent } from "@/types";
import { formatDeadlineLabel, formatEventDateChip, formatPrice } from "@/lib/format";
import { isEventOrderable, isListingOrderable } from "@/lib/order-policy";
import { EventTypeBadge, EventBadgeTag } from "@/components/Badge";
import { QtyControl } from "@/components/QtyControl";
import { ProductPhoto } from "@/components/ProductPhoto";
import { hasRequiredOptions } from "@/lib/product-options";

export function EventDetailView({ eventId }: { eventId: string }) {
  const router = useRouter();
  const [event, setEvent] = useState<MarketEvent | null | undefined>(undefined);

  useEffect(() => {
    // 노출 꺼둔 상품은 이벤트 상세의 상품 목록에서도 숨긴다.
    getEvent(eventId).then((e) => setEvent(e ? { ...e, products: e.products.filter((p) => p.visible !== false) } : e));
  }, [eventId]);

  if (event === undefined) return <p className="p-4 text-sm text-text-muted">불러오는 중...</p>;
  if (event === null) return <p className="p-4 text-sm text-text-muted">이벤트를 찾을 수 없어요.</p>;

  const closed = !isEventOrderable(event);

  return (
    <div>
      <div className="flex items-center gap-2 border-b border-border px-4 py-3">
        <button onClick={() => router.back()} className="p-1 text-xl text-text">
          ‹
        </button>
      </div>
      <div className="p-4">
        <div className="mb-2 flex items-center gap-1.5">
          <EventTypeBadge type={event.type} />
        </div>
        <p className="text-[17px] font-extrabold">{event.title}</p>
        {/* 택배는 상시 판매라 마감/배송예정일이 회차 개념이 아니라 등록 시각으로
            자동 채워진 값일 뿐이라 고객에게 노출하지 않는다(카테고리 날짜탭과 동일한 예외). */}
        {event.type !== "PARCEL" && (
          <p className="mt-1 text-[13px] text-text-muted">
            {formatDeadlineLabel(event.deadlineAt)} · 배송예정 {formatEventDateChip(event.deliveryAt)}
          </p>
        )}
        <div className="mt-3 rounded-[10px] p-3 text-[12.5px] leading-relaxed whitespace-pre-line" style={{ background: "#fff8e6", color: "#8a6a12" }}>
          {event.notice}
        </div>
        {closed && (
          <div className="mt-3 rounded-[10px] bg-bg-sunken p-3 text-[12.5px] font-semibold text-text-muted">
            마감된 이벤트예요. 더 이상 주문할 수 없어요.
          </div>
        )}

        <div className="mt-4">
          {event.products.map((product) => {
            // 이벤트는 진행 중이어도 이 상품 하나만 관리자가 따로 마감시켰거나
            // (수동 product.closed) 예약 마감시간(orderDeadlineAt)이 지났을
            // 수 있다 — 셋 중 하나만 참이어도 이 줄은 마감 취급한다.
            const itemClosed = closed || !isListingOrderable(product);
            return (
            <div key={product.id} className="flex items-center gap-3 border-b border-border py-3 last:border-none">
              <Link href={`/product/${product.id}`} className="block h-[52px] w-[52px] shrink-0">
                <ProductPhoto
                  photo={product.photos?.[0] ?? product.emoji}
                  className="flex h-full w-full items-center justify-center rounded-[10px] bg-accent-soft text-2xl"
                />
              </Link>
              <div className="min-w-0 flex-1">
                <div className="mb-0.5 flex items-center gap-1.5">
                  <Link href={`/product/${product.id}`} className="min-w-0 flex-1 truncate text-[13.5px] font-semibold">
                    {product.name}
                  </Link>
                  <EventBadgeTag badge={product.badge} />
                </div>
                <p className="text-[13.5px] font-bold">{formatPrice(product.price)}</p>
              </div>
              {!itemClosed && product.stock !== 0 && hasRequiredOptions(product) ? (
                <Link
                  href={`/product/${product.id}`}
                  className="shrink-0 rounded-full border border-accent px-3 py-1.5 text-[11.5px] font-bold text-accent"
                >
                  옵션선택
                </Link>
              ) : (
                <QtyControl productId={product.id} max={product.stock} minQty={product.minQty} closed={itemClosed} photo={product.photos?.[0] ?? product.emoji} />
              )}
            </div>
            );
          })}
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
