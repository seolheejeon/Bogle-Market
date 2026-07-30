"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useAuth } from "@/lib/auth-context";
import { listOrdersForProfile, lookupGuestOrders } from "@/lib/data";
import type { Order, OrderStatus } from "@/types";
import { ORDER_STATUS_LABEL } from "@/types";
import { formatPrice, formatDateTime } from "@/lib/format";
import { OrderStatusBadge } from "@/components/Badge";

const TABS: { value: OrderStatus | "all"; label: string }[] = [
  { value: "all", label: "전체" },
  { value: "wait", label: ORDER_STATUS_LABEL.wait },
  { value: "paid", label: ORDER_STATUS_LABEL.paid },
  { value: "confirmed", label: ORDER_STATUS_LABEL.confirmed },
  { value: "ship", label: ORDER_STATUS_LABEL.ship },
  { value: "done", label: ORDER_STATUS_LABEL.done },
  { value: "refund_requested", label: ORDER_STATUS_LABEL.refund_requested },
  { value: "refunded", label: ORDER_STATUS_LABEL.refunded },
];

export function OrdersView() {
  const { profile, loading } = useAuth();
  const [orders, setOrders] = useState<Order[] | null>(null);
  const [tab, setTab] = useState<OrderStatus | "all">("all");

  const [guestName, setGuestName] = useState("");
  const [guestPin, setGuestPin] = useState("");
  const [guestOrders, setGuestOrders] = useState<Order[] | undefined>(undefined);

  useEffect(() => {
    if (profile) listOrdersForProfile(profile.id).then(setOrders);
  }, [profile]);

  if (loading) return <p className="p-4 text-sm text-text-muted">불러오는 중...</p>;

  if (!profile) {
    return (
      <div className="p-4">
        <strong className="mb-3 block text-[15px]">내 주문 조회</strong>
        <p className="mb-3 text-[12.5px] text-text-muted">비회원으로 주문하셨다면 이름과 주문 시 정했던 확인번호 4자리로 조회할 수 있어요.</p>
        <div className="flex flex-col gap-2">
          <input className="rounded-[9px] border border-border bg-bg-card px-3 py-2.5 text-[13px]" placeholder="이름" value={guestName} onChange={(e) => setGuestName(e.target.value)} />
          <input
            className="rounded-[9px] border border-border bg-bg-card px-3 py-2.5 text-[13px]"
            placeholder="확인번호 4자리"
            inputMode="numeric"
            maxLength={4}
            value={guestPin}
            onChange={(e) => setGuestPin(e.target.value.replace(/\D/g, "").slice(0, 4))}
          />
          <button
            className="rounded-[10px] bg-accent py-2.5 text-[13px] font-bold text-white"
            onClick={async () => setGuestOrders(await lookupGuestOrders(guestName.trim(), guestPin.trim()))}
          >
            조회하기
          </button>
        </div>
        {guestOrders !== undefined && guestOrders.length === 0 && <p className="mt-3 text-[12.5px] text-red-600">일치하는 주문을 찾을 수 없어요.</p>}
        {guestOrders !== undefined && guestOrders.length > 0 && (
          <div className="mt-4">
            {guestOrders.map((o) => (
              <OrderRow key={o.id} order={o} href={`/orders/${o.id}?gn=${encodeURIComponent(guestName.trim())}&pin=${guestPin.trim()}`} />
            ))}
          </div>
        )}
      </div>
    );
  }

  const filtered = (orders ?? []).filter((o) => tab === "all" || o.status === tab);

  return (
    <div>
      <div className="border-b border-border px-4 py-3">
        <strong className="text-[15px]">내 주문</strong>
      </div>
      <div className="flex gap-2 overflow-x-auto border-b border-border px-4 py-3">
        {TABS.map((t) => (
          <button
            key={t.value}
            onClick={() => setTab(t.value)}
            className={`shrink-0 rounded-full px-3.5 py-1.5 text-[13px] font-semibold ${tab === t.value ? "bg-accent text-white" : "bg-bg-sunken text-text-muted"}`}
          >
            {t.label}
          </button>
        ))}
      </div>
      {orders === null && <p className="p-4 text-sm text-text-muted">불러오는 중...</p>}
      {orders !== null && filtered.length === 0 && <p className="p-4 text-sm text-text-muted">주문 내역이 없어요.</p>}
      <div>
        {filtered.map((o) => (
          <OrderRow key={o.id} order={o} />
        ))}
      </div>
    </div>
  );
}

function OrderRow({ order, href }: { order: Order; href?: string }) {
  return (
    <Link href={href ?? `/orders/${order.id}`} className="block border-b border-border px-4 py-3.5">
      <div className="mb-1.5 flex items-center justify-between">
        <span className="text-[11px] text-text-muted">{order.orderNumber}</span>
        <OrderStatusBadge status={order.status} />
      </div>
      <p className="text-[13px]">
        {order.items[0]?.productName}
        {order.items.length > 1 ? ` 외 ${order.items.length - 1}건` : ""}
      </p>
      <div className="mt-1 flex justify-between text-[12px] text-text-muted">
        <span>{formatDateTime(order.createdAt)}</span>
        <strong className="text-text">{formatPrice(order.total)}</strong>
      </div>
    </Link>
  );
}
