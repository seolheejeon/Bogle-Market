"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { listEvents, listAllOrders } from "@/lib/data";
import type { MarketEvent, Order } from "@/types";
import { formatPrice } from "@/lib/format";

export default function AdminDashboardPage() {
  const [events, setEvents] = useState<MarketEvent[]>([]);
  const [orders, setOrders] = useState<Order[]>([]);

  useEffect(() => {
    listEvents().then(setEvents);
    listAllOrders().then(setOrders);
  }, []);

  const waitCount = orders.filter((o) => o.status === "wait").length;
  const todaySales = orders
    .filter((o) => o.status !== "cancelled" && o.status !== "refund_requested" && o.status !== "refunded" && new Date(o.createdAt).toDateString() === new Date().toDateString())
    .reduce((s, o) => s + o.total, 0);

  return (
    <div>
      <p className="mb-4 text-[15px] font-bold">대시보드</p>
      <div className="grid grid-cols-3 gap-3">
        <div className="rounded-xl border border-border p-4">
          <p className="text-[12px] text-text-muted">진행 중 이벤트</p>
          <p className="mt-1 text-xl font-extrabold">{events.length}</p>
        </div>
        <div className="rounded-xl border border-border p-4">
          <p className="text-[12px] text-text-muted">입금확인 대기</p>
          <p className="mt-1 text-xl font-extrabold text-red-600">{waitCount}</p>
        </div>
        <div className="rounded-xl border border-border p-4">
          <p className="text-[12px] text-text-muted">오늘 매출</p>
          <p className="mt-1 text-xl font-extrabold">{formatPrice(todaySales)}</p>
        </div>
      </div>
      <div className="mt-5 flex gap-2">
        <Link href="/admin/events/new" className="rounded-[10px] bg-accent px-4 py-2.5 text-[13px] font-bold text-white">
          + 새 이벤트 등록
        </Link>
        <Link href="/admin/orders" className="rounded-[10px] border border-border px-4 py-2.5 text-[13px] font-semibold">
          주문 관리로 이동
        </Link>
      </div>
    </div>
  );
}
