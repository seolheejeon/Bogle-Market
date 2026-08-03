"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { listEvents } from "@/lib/data";
import type { EventType, MarketEvent, Product } from "@/types";
import { EVENT_TYPE_LABEL } from "@/types";
import { formatPrice, formatDeadlineLabel } from "@/lib/format";
import { useCart, type CartLine } from "@/lib/cart-context";
import { QtyControl } from "@/components/QtyControl";
import { ProductPhoto } from "@/components/ProductPhoto";
import { unitPrice, maxQtyForSelection, optionSelectionLabel } from "@/lib/product-options";
import { totalShippingFee } from "@/lib/shipping";

// 체크아웃 화면과 동일한 순서(components/Checkout/CheckoutView.tsx의
// DELIVERY_TYPE_ORDER 참고) — 장바구니에서부터 체크아웃에서 나뉠 그룹을
// 미리 보여줘서 "왜 이렇게 나뉘어 보이는지" 예측 가능하게 한다.
const DELIVERY_TYPE_ORDER: EventType[] = ["DOOR", "GROUP_BUY", "PARCEL"];

// 상품별 deliveryType override가 있을 수 있어 event.type을 그대로 쓰지
// 않고 이걸로 판정한다(CheckoutView.tsx와 동일한 로직).
function deliveryTypeOf(item: { product: Product; event: MarketEvent }): EventType {
  return item.product.deliveryType ?? item.event.type;
}

export function CartView() {
  const { lines, setQty } = useCart();
  const [events, setEvents] = useState<MarketEvent[] | null>(null);
  const [collapsedTypes, setCollapsedTypes] = useState<Set<EventType>>(new Set());

  useEffect(() => {
    listEvents().then(setEvents);
  }, []);

  function toggleType(type: EventType) {
    setCollapsedTypes((prev) => {
      const next = new Set(prev);
      if (next.has(type)) next.delete(type);
      else next.add(type);
      return next;
    });
  }

  const grouped = useMemo(() => {
    if (!events) return [];
    const byEvent = new Map<string, { event: MarketEvent; items: { product: Product; line: CartLine }[] }>();
    for (const event of events) {
      for (const product of event.products) {
        for (const line of lines) {
          if (line.productId !== product.id) continue;
          if (!byEvent.has(event.id)) byEvent.set(event.id, { event, items: [] });
          byEvent.get(event.id)!.items.push({ product, line });
        }
      }
    }
    return Array.from(byEvent.values());
  }, [events, lines]);

  const totalCount = lines.reduce((sum, l) => sum + l.qty, 0);
  const totalPrice = grouped.reduce((sum, g) => sum + g.items.reduce((s, i) => s + unitPrice(i.product, i.line.optionValueIds) * i.line.qty, 0), 0);
  // 배송비는 택배로 배송되는 상품만, 이벤트(주문 단위)별로 카탈로그 상품 하나당
  // 한 번만 부과된다 — 체크아웃에서 실제 청구될 금액과 항상 같은 방식으로 계산.
  const shippingByEvent = grouped.map((g) => ({
    event: g.event,
    fee: totalShippingFee(
      g.items
        .filter((i) => (i.product.deliveryType ?? g.event.type) === "PARCEL")
        .map((i) => ({ product: i.product, lineTotal: unitPrice(i.product, i.line.optionValueIds) * i.line.qty, qty: i.line.qty })),
    ),
  }));
  const totalShipping = shippingByEvent.reduce((sum, g) => sum + g.fee, 0);

  // 체크아웃에서 배송방식별로 주문이 자동 분리되는 것과 같은 기준으로,
  // 장바구니도 배송방식별 섹션으로 먼저 나누고 그 안에서 이벤트(회차)별로
  // 다시 묶어 보여준다 — 한 이벤트 안 상품들은 보통 배송방식이 통일돼 있어서
  // (deliveryType override는 드문 예외) 그룹의 첫 상품 기준으로 판정한다
  // (CheckoutView.tsx와 동일한 방식).
  const typeSections = useMemo(() => {
    const byType = new Map<EventType, typeof grouped>();
    for (const g of grouped) {
      if (g.items.length === 0) continue;
      const t = deliveryTypeOf({ product: g.items[0].product, event: g.event });
      if (!byType.has(t)) byType.set(t, []);
      byType.get(t)!.push(g);
    }
    return DELIVERY_TYPE_ORDER.filter((t) => byType.has(t)).map((t) => ({ type: t, groups: byType.get(t)! }));
  }, [grouped]);

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
        {typeSections.map(({ type, groups: typeGroups }) => {
          const lineCount = typeGroups.reduce((sum, g) => sum + g.items.length, 0);
          const collapsed = collapsedTypes.has(type);
          return (
            <div key={type} className="mb-5">
              <button type="button" onClick={() => toggleType(type)} className="mb-2 flex w-full items-center gap-1.5 text-left">
                <span className={`inline-block text-[11px] text-text-muted transition-transform ${collapsed ? "-rotate-90" : ""}`}>▼</span>
                <span className="text-[14px] font-extrabold">{EVENT_TYPE_LABEL[type]}</span>
                <span className="text-[12.5px] font-semibold text-text-muted">({lineCount})</span>
              </button>
              {!collapsed &&
                typeGroups.map(({ event, items }) => {
                  const shippingFee = shippingByEvent.find((g) => g.event.id === event.id)?.fee ?? 0;
                  return (
                    <div key={event.id} className="mb-4">
                      {typeGroups.length > 1 && (
                        <div className="mb-2 flex items-center justify-between">
                          <p className="text-xs font-bold text-accent-dark">{event.title}</p>
                          <span className="text-[11px] text-text-muted">{formatDeadlineLabel(event.deadlineAt)}</span>
                        </div>
                      )}
                      {type === "PARCEL" && (
                        <p className="mb-1.5 text-[11.5px] text-text-muted">배송비 {shippingFee > 0 ? formatPrice(shippingFee) : "무료"}</p>
                      )}
                      {items.map(({ product, line }) => (
                        <div key={`${product.id}::${line.optionValueIds.join(",")}`} className="flex items-center gap-3 py-2">
                          <ProductPhoto
                            photo={product.photos?.[0] ?? product.emoji}
                            className="flex h-[52px] w-[52px] shrink-0 items-center justify-center rounded-[10px] bg-accent-soft text-2xl"
                          />
                          <div className="min-w-0 flex-1">
                            <p className="truncate text-[13.5px] font-semibold">{product.name}</p>
                            {line.optionValueIds.length > 0 && (
                              <p className="truncate text-[11.5px] text-text-muted">{optionSelectionLabel(product, line.optionValueIds)}</p>
                            )}
                            <p className="text-[13.5px] font-bold">{formatPrice(unitPrice(product, line.optionValueIds))}</p>
                          </div>
                          <div className="flex shrink-0 flex-col items-end gap-1">
                            <QtyControl
                              productId={product.id}
                              optionValueIds={line.optionValueIds}
                              max={maxQtyForSelection(product, line.optionValueIds)}
                              minQty={product.minQty}
                            />
                            {/* 최소 구매 수량 밑으로는 QtyControl의 −로 못 내려가서, 완전히
                                빼려면 이 삭제 버튼을 따로 눌러야 한다. */}
                            <button
                              onClick={() => setQty(product.id, 0, line.optionValueIds)}
                              className="text-[11px] font-semibold text-text-muted underline"
                            >
                              삭제
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  );
                })}
            </div>
          );
        })}
      </div>
      {/* fixed, not sticky-in-flow: see ProductDetailView for why — a sticky
          footer nested in <main> gets hidden behind BottomNav's own sticky
          bar once the page is tall enough to scroll. */}
      <div className="fixed inset-x-0 bottom-[67px] z-20 border-t border-border bg-bg-card">
        <div className="mx-auto max-w-2xl px-4 py-3.5">
          <div className="mb-1 flex justify-between text-[12.5px] text-text-muted">
            <span>상품 {totalCount}개</span>
            <span>{formatPrice(totalPrice)}</span>
          </div>
          {totalShipping > 0 && (
            <div className="mb-1 flex justify-between text-[12.5px] text-text-muted">
              <span>배송비</span>
              <span>{formatPrice(totalShipping)}</span>
            </div>
          )}
          <div className="mb-2.5 flex justify-between text-[13px]">
            <span className="text-text-muted">총 결제 예정금액</span>
            <strong className="text-[17px]">{formatPrice(totalPrice + totalShipping)}</strong>
          </div>
          <Link href="/checkout" className="block w-full rounded-[10px] bg-accent py-3 text-center text-[13.5px] font-bold text-white">
            주문하기
          </Link>
        </div>
      </div>
      <div className="h-[130px]" />
    </div>
  );
}
