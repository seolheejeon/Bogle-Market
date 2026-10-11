"use client";

import { useEffect, useMemo, useState } from "react";
import { listAllOrders, listEvents, getEventProductCosts, getOptionCostDeltas, listDailyVisits, type DailyVisit } from "@/lib/data";
import type { MarketEvent, Order, OrderStatus } from "@/types";
import { EVENT_TYPE_LABEL } from "@/types";
import { formatPrice, formatEventDateChip } from "@/lib/format";

// 매출로 세는 주문 상태 — 입금이 확인된 뒤부터(입금완료~배송완료, 반품 신청·반려 포함).
// 입금대기·취소·환불완료는 뺀다(운영 메인 "오늘 매출"과 같은 기준).
const SALES_STATUSES = new Set<OrderStatus>(["paid", "confirmed", "ship", "done", "refund_requested", "refund_rejected"]);

// 매출·마진을 어느 달로 잡을지 — 문고리/사다드림은 "배송일(회차)" 기준(원가가
// 나가는 발주 시점과 같은 회차로 묶여야 마진이 맞아서). 택배는 회차 개념이 없어
// 주문일 기준. 결과는 한국 날짜 "YYYY-MM-DD".
function basisDay(order: Order, event: MarketEvent | undefined): string {
  const iso = event && event.type !== "PARCEL" ? event.deliveryAt : order.createdAt;
  return new Date(new Date(iso).getTime() + 9 * 3600 * 1000).toISOString().slice(0, 10);
}

interface Row {
  key: string;
  label: string;
  orders: number;
  sales: number;
  cost: number;
}

export default function AdminSalesPage() {
  const [orders, setOrders] = useState<Order[] | null>(null);
  const [events, setEvents] = useState<MarketEvent[]>([]);
  const [listingCosts, setListingCosts] = useState<Record<string, number>>({});
  const [optionCosts, setOptionCosts] = useState<Record<string, number>>({});
  const [visits, setVisits] = useState<DailyVisit[] | null>(null);
  const [month, setMonth] = useState(() => new Date(Date.now() + 9 * 3600 * 1000).toISOString().slice(0, 7));

  useEffect(() => {
    (async () => {
      const [allOrders, allEvents, optCosts] = await Promise.all([listAllOrders(), listEvents(), getOptionCostDeltas()]);
      setOrders(allOrders);
      setEvents(allEvents);
      setOptionCosts(optCosts);
      setListingCosts(await getEventProductCosts(allEvents.flatMap((e) => e.products.map((p) => p.id))));
    })();
    listDailyVisits(14)
      .then(setVisits)
      .catch(() => setVisits([]));
  }, []);

  const eventById = useMemo(() => new Map(events.map((e) => [e.id, e])), [events]);

  const report = useMemo(() => {
    if (!orders) return null;
    const rows = new Map<string, Row>();
    const missingCost = new Set<string>();
    let sales = 0;
    let cost = 0;
    let count = 0;
    for (const o of orders) {
      if (!SALES_STATUSES.has(o.status)) continue;
      const event = eventById.get(o.eventId);
      if (!basisDay(o, event).startsWith(month)) continue;
      // 매출은 손님이 낸 상품값(할인 반영) — 택배 배송비는 택배비로 나가는 돈이라 뺀다.
      const orderSales = o.total - o.shippingFee;
      let orderCost = 0;
      for (const item of o.items) {
        const base = listingCosts[item.productId];
        if (base === undefined || base === 0) missingCost.add(item.productName);
        const optionDelta = (item.options ?? []).reduce((s, opt) => s + (optionCosts[opt.optionValueId] ?? 0), 0);
        orderCost += ((base ?? 0) + optionDelta) * item.quantity;
      }
      sales += orderSales;
      cost += orderCost;
      count++;
      const key = event && event.type !== "PARCEL" ? event.id : `parcel-${basisDay(o, event)}`;
      const label = event
        ? event.type !== "PARCEL"
          ? `${EVENT_TYPE_LABEL[event.type]} · ${formatEventDateChip(event.deliveryAt)} ${event.title}`
          : `택배 · ${basisDay(o, event).slice(5).replace("-", "/")} 주문분`
        : "(삭제된 이벤트)";
      const row = rows.get(key) ?? { key, label, orders: 0, sales: 0, cost: 0 };
      row.orders++;
      row.sales += orderSales;
      row.cost += orderCost;
      rows.set(key, row);
    }
    return { sales, cost, count, rows: [...rows.values()].sort((a, b) => a.label.localeCompare(b.label)), missingCost: [...missingCost] };
  }, [orders, eventById, listingCosts, optionCosts, month]);

  function shiftMonth(delta: number) {
    const [y, m] = month.split("-").map(Number);
    const d = new Date(Date.UTC(y, m - 1 + delta, 1));
    setMonth(d.toISOString().slice(0, 7));
  }

  const maxVisitors = Math.max(1, ...(visits ?? []).map((v) => v.visitors));
  const pct = (margin: number, salesAmount: number) => (salesAmount > 0 ? `${Math.round((margin / salesAmount) * 100)}%` : "-");

  return (
    <div className="max-w-2xl">
      <p className="mb-1 text-[15px] font-bold">매출·방문</p>
      <p className="mb-4 text-[12px] text-text-muted">
        문고리·사다드림은 <strong>배송일(회차)</strong>, 택배는 주문일 기준으로 그 달 매출에 들어가요. 입금 확인된 주문만(입금대기·취소·환불 제외), 택배 배송비는 빼고 계산해요.
      </p>

      <div className="mb-3 flex items-center gap-2">
        <button onClick={() => shiftMonth(-1)} className="rounded-[8px] border border-border px-2.5 py-1 text-[13px]">
          ◀
        </button>
        <span className="text-[14px] font-bold">
          {month.slice(0, 4)}년 {Number(month.slice(5))}월
        </span>
        <button onClick={() => shiftMonth(1)} className="rounded-[8px] border border-border px-2.5 py-1 text-[13px]">
          ▶
        </button>
      </div>

      {!report ? (
        <p className="text-sm text-text-muted">불러오는 중...</p>
      ) : (
        <>
          <div className="mb-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
            {[
              { label: "매출", value: formatPrice(report.sales) },
              { label: "원가", value: formatPrice(report.cost) },
              { label: "마진", value: formatPrice(report.sales - report.cost), strong: true },
              { label: "마진율", value: pct(report.sales - report.cost, report.sales) },
            ].map((t) => (
              <div key={t.label} className={`rounded-xl border p-3 ${t.strong ? "border-accent bg-accent-soft" : "border-border"}`}>
                <p className="text-[11.5px] font-semibold text-text-muted">{t.label}</p>
                <p className="mt-0.5 text-[17px] font-extrabold">{t.value}</p>
              </div>
            ))}
          </div>
          <p className="mb-2 text-[12px] text-text-muted">주문 {report.count}건</p>

          {report.missingCost.length > 0 && (
            <p className="mb-3 rounded-[9px] bg-amber-50 px-3 py-2 text-[12px] text-amber-800">
              ⚠️ 원가가 입력 안 된 상품이 있어 원가 0원으로 계산했어요(마진이 실제보다 크게 보여요): {report.missingCost.join(", ")}. 이벤트 관리 화면에서 상품별 원가를 넣어 주세요.
            </p>
          )}

          <p className="mb-2 text-[13.5px] font-bold">회차별</p>
          {report.rows.length === 0 ? (
            <p className="mb-6 text-[12.5px] text-text-muted">이 달에 잡힌 매출이 없어요.</p>
          ) : (
            <div className="mb-6 flex flex-col gap-1.5">
              {report.rows.map((r) => (
                <div key={r.key} className="rounded-[9px] border border-border px-3 py-2 text-[12.5px]">
                  <div className="flex items-center justify-between gap-2">
                    <span className="min-w-0 truncate font-semibold">{r.label}</span>
                    <span className="shrink-0 text-text-muted">{r.orders}건</span>
                  </div>
                  <div className="mt-0.5 flex flex-wrap gap-x-3 text-text-muted">
                    <span>매출 {formatPrice(r.sales)}</span>
                    <span>원가 {formatPrice(r.cost)}</span>
                    <span className="font-bold text-accent-dark">
                      마진 {formatPrice(r.sales - r.cost)} ({pct(r.sales - r.cost, r.sales)})
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </>
      )}

      <p className="mb-1 text-[13.5px] font-bold">하루 방문자 (최근 14일)</p>
      <p className="mb-2 text-[11.5px] text-text-muted">같은 휴대폰·브라우저는 하루 1명으로 세요. 관리자 접속은 빠져요. 2026년 10월 11일부터 기록돼요.</p>
      {visits === null ? (
        <p className="text-sm text-text-muted">불러오는 중...</p>
      ) : (
        <div className="flex flex-col gap-1">
          {[...visits].reverse().map((v) => (
            <div key={v.day} className="flex items-center gap-2 text-[12px]">
              <span className="w-[72px] shrink-0 text-text-muted">{formatEventDateChip(`${v.day}T12:00:00+09:00`)}</span>
              <div className="h-3.5 flex-1 overflow-hidden rounded-full bg-bg-sunken">
                <div className="h-full rounded-full bg-accent" style={{ width: `${(v.visitors / maxVisitors) * 100}%` }} />
              </div>
              <span className="w-[86px] shrink-0 text-right">
                <strong>{v.visitors}명</strong> <span className="text-text-muted">· {v.pageViews}뷰</span>
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
