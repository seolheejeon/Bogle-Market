"use client";

import { useEffect, useState } from "react";
import { listAllOrders, updateOrderStatus, createNotification } from "@/lib/data";
import type { Order, OrderStatus } from "@/types";
import { ORDER_STATUS_LABEL, PAYMENT_METHOD_LABEL } from "@/types";
import { formatDateTime, formatPrice } from "@/lib/format";
import { OrderStatusBadge } from "@/components/Badge";

const NEXT_STATUS: Partial<Record<OrderStatus, OrderStatus>> = { wait: "paid", paid: "ship", ship: "done" };
const NEXT_LABEL: Partial<Record<OrderStatus, string>> = { wait: "입금확인", paid: "배송시작", ship: "배송완료 처리" };

export default function AdminOrdersPage() {
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<OrderStatus | "all">("all");

  function refresh() {
    listAllOrders().then((o) => {
      setOrders(o);
      setLoading(false);
    });
  }
  useEffect(refresh, []);

  async function advance(order: Order) {
    const next = NEXT_STATUS[order.status];
    if (!next) return;
    await updateOrderStatus(order.id, next);
    // Guest orders have no profile to notify — only members get these.
    if (order.profileId && (next === "ship" || next === "done")) {
      await createNotification({
        title: next === "ship" ? "배송이 시작됐어요" : "배송이 완료됐어요",
        message: `주문번호 ${order.orderNumber} ${next === "ship" ? "배송이 시작됐어요." : "배송이 완료됐어요. 확인해보세요!"}`,
        icon: "🚚",
        linkType: "ORDER",
        linkId: order.id,
        profileId: order.profileId,
      });
    }
    refresh();
  }
  async function cancel(order: Order) {
    if (!confirm("이 주문을 취소할까요?")) return;
    await updateOrderStatus(order.id, "cancelled");
    refresh();
  }

  const filtered = orders.filter((o) => filter === "all" || o.status === filter);

  return (
    <div>
      <p className="mb-4 text-[15px] font-bold">주문 관리</p>
      <div className="mb-4 flex gap-2 overflow-x-auto">
        {(["all", "wait", "paid", "ship", "done", "cancelled"] as const).map((s) => (
          <button
            key={s}
            onClick={() => setFilter(s)}
            className={`shrink-0 rounded-full px-3.5 py-1.5 text-[13px] font-semibold ${filter === s ? "bg-accent text-white" : "bg-bg-sunken text-text-muted"}`}
          >
            {s === "all" ? "전체" : ORDER_STATUS_LABEL[s]}
          </button>
        ))}
      </div>
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
                {o.status !== "done" && o.status !== "cancelled" && (
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
