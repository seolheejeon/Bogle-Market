"use client";

import { useEffect, useMemo, useState } from "react";
import { listAllOrders, listEvents, updateOrderStatus, createNotification } from "@/lib/data";
import type { MarketEvent, Order, OrderStatus } from "@/types";
import { ORDER_STATUS_LABEL, PAYMENT_METHOD_LABEL } from "@/types";
import { formatDateTime, formatPrice } from "@/lib/format";
import { OrderStatusBadge } from "@/components/Badge";

const NEXT_STATUS: Partial<Record<OrderStatus, OrderStatus>> = { wait: "paid", paid: "confirmed", confirmed: "ship", ship: "done" };
const NEXT_LABEL: Partial<Record<OrderStatus, string>> = { wait: "입금확인", paid: "발주확인", confirmed: "배송시작", ship: "배송완료 처리" };

// 주요 상태 전환 시 해당 주문 고객에게만(비회원 제외) 알림을 보낸다 — 개별
// 처리와 아파트 단위 일괄 처리 양쪽에서 재사용. eventTitle이 있으면 어느
// 이벤트 배송인지 알림 문구에 같이 넣어준다. 발주확인(confirmed)은 고객이
// 딱히 할 일이 없는 내부 진행 상태라 알림을 보내지 않는다.
const STATUS_CHANGE_NOTICE: Partial<Record<OrderStatus, { title: string; message: string; icon: string }>> = {
  paid: { title: "입금이 확인됐어요", message: "입금이 확인됐어요. 발주 준비 중이에요.", icon: "💰" },
  ship: { title: "배송이 시작됐어요", message: "배송이 시작됐어요.", icon: "🚚" },
  done: { title: "배송이 완료됐어요", message: "배송이 완료됐어요. 확인해보세요!", icon: "🚚" },
  refunded: { title: "환불이 완료됐어요", message: "환불 처리가 완료됐어요.", icon: "💸" },
};

async function notifyStatusChange(order: Order, next: OrderStatus, eventTitle?: string) {
  const notice = STATUS_CHANGE_NOTICE[next];
  if (!order.profileId || !notice) return;
  const prefix = eventTitle ? `[${eventTitle}] ` : "";
  await createNotification({
    title: notice.title,
    message: `${prefix}주문번호 ${order.orderNumber} ${notice.message}`,
    icon: notice.icon,
    linkType: "ORDER",
    linkId: order.id,
    profileId: order.profileId,
  });
}

export default function AdminOrdersPage() {
  const [orders, setOrders] = useState<Order[]>([]);
  const [events, setEvents] = useState<MarketEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<OrderStatus | "all">("all");
  const [apartmentFilter, setApartmentFilter] = useState("all");
  const [eventFilter, setEventFilter] = useState("all");
  const [bulkCompleting, setBulkCompleting] = useState(false);

  function refresh() {
    listAllOrders().then((o) => {
      setOrders(o);
      setLoading(false);
    });
  }
  useEffect(refresh, []);
  useEffect(() => {
    listEvents().then(setEvents);
  }, []);

  const eventTitleById = useMemo(() => new Map(events.map((e) => [e.id, e.title])), [events]);

  async function advance(order: Order) {
    const next = NEXT_STATUS[order.status];
    if (!next) return;
    await updateOrderStatus(order.id, next);
    await notifyStatusChange(order, next, eventTitleById.get(order.eventId));
    refresh();
  }
  async function cancel(order: Order) {
    if (!confirm("이 주문을 취소할까요?")) return;
    await updateOrderStatus(order.id, "cancelled");
    refresh();
  }
  async function markRefunded(order: Order) {
    if (!confirm("환불 처리를 완료했나요?")) return;
    await updateOrderStatus(order.id, "refunded");
    await notifyStatusChange(order, "refunded", eventTitleById.get(order.eventId));
    refresh();
  }

  // 검색 결과가 공동주택이 아닌 주문(아파트명이 빈 값)은 필터 목록에서 제외.
  const apartments = useMemo(() => Array.from(new Set(orders.map((o) => o.apartmentName).filter((v): v is string => !!v))).sort(), [orders]);
  // 주문이 실제로 있는 이벤트만 필터 목록에 노출.
  const orderedEventIds = useMemo(() => Array.from(new Set(orders.map((o) => o.eventId))), [orders]);
  const filterableEvents = useMemo(() => events.filter((e) => orderedEventIds.includes(e.id)), [events, orderedEventIds]);

  const filtered = orders.filter(
    (o) =>
      (filter === "all" || o.status === filter) &&
      (apartmentFilter === "all" || o.apartmentName === apartmentFilter) &&
      (eventFilter === "all" || o.eventId === eventFilter),
  );

  const shippingInApartment = apartmentFilter === "all" ? [] : orders.filter((o) => o.apartmentName === apartmentFilter && o.status === "ship");

  async function bulkCompleteApartment() {
    if (shippingInApartment.length === 0) return;
    if (!confirm(`"${apartmentFilter}"의 배송중 주문 ${shippingInApartment.length}건을 전부 배송완료 처리할까요?`)) return;
    setBulkCompleting(true);
    for (const order of shippingInApartment) {
      await updateOrderStatus(order.id, "done");
      await notifyStatusChange(order, "done", eventTitleById.get(order.eventId));
    }
    setBulkCompleting(false);
    refresh();
  }

  return (
    <div>
      <p className="mb-4 text-[15px] font-bold">주문 관리</p>
      <div className="mb-3 flex gap-2 overflow-x-auto">
        {(["all", "wait", "paid", "confirmed", "ship", "done", "refund_requested", "refunded", "cancelled"] as const).map((s) => (
          <button
            key={s}
            onClick={() => setFilter(s)}
            className={`shrink-0 rounded-full px-3.5 py-1.5 text-[13px] font-semibold ${filter === s ? "bg-accent text-white" : "bg-bg-sunken text-text-muted"}`}
          >
            {s === "all" ? "전체" : ORDER_STATUS_LABEL[s]}
          </button>
        ))}
      </div>
      {filterableEvents.length > 0 && (
        <div className="mb-3">
          <select
            className="rounded-[9px] border border-border bg-bg-card px-3 py-2 text-[13px]"
            value={eventFilter}
            onChange={(e) => setEventFilter(e.target.value)}
          >
            <option value="all">전체 이벤트</option>
            {filterableEvents.map((e) => (
              <option key={e.id} value={e.id}>
                {e.title}
              </option>
            ))}
          </select>
        </div>
      )}
      {apartments.length > 0 && (
        <div className="mb-4 flex items-center gap-2">
          <select
            className="rounded-[9px] border border-border bg-bg-card px-3 py-2 text-[13px]"
            value={apartmentFilter}
            onChange={(e) => setApartmentFilter(e.target.value)}
          >
            <option value="all">전체 아파트</option>
            {apartments.map((name) => (
              <option key={name} value={name}>
                {name}
              </option>
            ))}
          </select>
          {shippingInApartment.length > 0 && (
            <button
              onClick={bulkCompleteApartment}
              disabled={bulkCompleting}
              className="rounded-[9px] bg-accent px-3 py-2 text-[12.5px] font-bold text-white disabled:opacity-50"
            >
              {bulkCompleting ? "처리 중..." : `배송중 ${shippingInApartment.length}건 일괄 배송완료`}
            </button>
          )}
        </div>
      )}
      {loading && <p className="text-sm text-text-muted">불러오는 중...</p>}
      {!loading && filtered.length === 0 && <p className="text-sm text-text-muted">해당하는 주문이 없어요.</p>}
      <div className="flex flex-col gap-2">
        {filtered.map((o) => (
          <div key={o.id} className="rounded-xl border border-border p-3.5">
            <div className="mb-1.5 flex items-center justify-between">
              <span className="text-[12px] text-text-muted">
                {o.orderNumber} · {formatDateTime(o.createdAt)}
              </span>
              <OrderStatusBadge status={o.status} />
            </div>
            {eventTitleById.get(o.eventId) && <p className="mb-1 text-[12px] font-semibold text-accent-dark">{eventTitleById.get(o.eventId)}</p>}
            <p className="text-[13px]">
              {o.recipientName} ({o.recipientPhone}) · {PAYMENT_METHOD_LABEL[o.paymentMethod]}
            </p>
            <p className="mt-1 text-[12.5px] text-text-muted">{o.addressSnapshot}</p>
            <p className="mt-1 text-[12.5px] text-text-muted">
              {o.items.map((i) => `${i.productName} x${i.quantity}`).join(", ")}
            </p>
            <div className="mt-1.5 flex items-center justify-between">
              <strong className="text-[14px]">{formatPrice(o.total)}</strong>
              <div className="flex gap-1.5">
                {NEXT_STATUS[o.status] && (
                  <button onClick={() => advance(o)} className="rounded-[8px] bg-accent px-3 py-1.5 text-[12px] font-bold text-white">
                    {NEXT_LABEL[o.status]}
                  </button>
                )}
                {o.status === "refund_requested" && (
                  <button onClick={() => markRefunded(o)} className="rounded-[8px] bg-accent px-3 py-1.5 text-[12px] font-bold text-white">
                    환불완료 처리
                  </button>
                )}
                {o.status !== "done" &&
                  o.status !== "cancelled" &&
                  o.status !== "refund_requested" &&
                  o.status !== "refunded" && (
                  <button onClick={() => cancel(o)} className="rounded-[8px] border border-border px-3 py-1.5 text-[12px] font-semibold text-red-600">
                    취소
                  </button>
                )}
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
