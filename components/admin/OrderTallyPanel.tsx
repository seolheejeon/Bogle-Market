"use client";

import { useMemo, useState } from "react";
import type { MarketEvent, Order, OrderStatus } from "@/types";
import { EVENT_TYPE_LABEL } from "@/types";
import { formatEventDateChip } from "@/lib/format";

// 발주에 넣을 수량으로 세는 주문 상태 — 입금이 확인된 뒤(입금완료·발주확인)부터
// 배송 중/완료, 반품 신청·반려까지(실제로 나간 물건이라 발주 수량에 포함).
// 취소·환불완료는 빼고, 입금대기는 "아직 확정 아님"으로 따로 보여준다.
const CONFIRMED_STATUSES = new Set<OrderStatus>(["paid", "confirmed", "ship", "done", "refund_requested", "refund_rejected"]);

interface Count {
  confirmed: number;
  wait: number;
}

interface ProductTally extends Count {
  name: string;
  options: { label: string; confirmed: number; wait: number }[];
}

function tally(event: MarketEvent, orders: Order[]): { products: ProductTally[]; confirmedOrders: number; waitOrders: number } {
  const byProduct = new Map<string, Count & { options: Map<string, Count> }>();
  let confirmedOrders = 0;
  let waitOrders = 0;
  for (const o of orders) {
    if (o.eventId !== event.id) continue;
    const isConfirmed = CONFIRMED_STATUSES.has(o.status);
    const isWait = o.status === "wait";
    if (!isConfirmed && !isWait) continue;
    if (isConfirmed) confirmedOrders++;
    else waitOrders++;
    for (const item of o.items) {
      const p = byProduct.get(item.productName) ?? { confirmed: 0, wait: 0, options: new Map() };
      const label = item.options && item.options.length > 0 ? item.options.map((opt) => opt.valueName).join(" / ") : "";
      const opt = p.options.get(label) ?? { confirmed: 0, wait: 0 };
      if (isConfirmed) {
        p.confirmed += item.quantity;
        opt.confirmed += item.quantity;
      } else {
        p.wait += item.quantity;
        opt.wait += item.quantity;
      }
      p.options.set(label, opt);
      byProduct.set(item.productName, p);
    }
  }
  // 이벤트에서 정한 상품 노출 순서대로(지금은 빠진 상품의 주문은 맨 뒤에).
  const order = event.products.map((p) => p.name);
  const products = [...byProduct.entries()]
    .sort(([a], [b]) => (order.indexOf(a) === -1 ? 999 : order.indexOf(a)) - (order.indexOf(b) === -1 ? 999 : order.indexOf(b)))
    .map(([name, p]) => ({
      name,
      confirmed: p.confirmed,
      wait: p.wait,
      // 옵션 없는 상품은 옵션 줄을 안 보여준다("" 하나뿐인 경우).
      options: [...p.options.entries()].filter(([label]) => label !== "").map(([label, c]) => ({ label, ...c })),
    }));
  return { products, confirmedOrders, waitOrders };
}

// 운영 메인의 "회차별 발주 집계" — 회차(이벤트)를 고르면 상품별·옵션별로 몇 개
// 들어왔는지 센다. 사장님이 발주 넣을 때 주문 목록을 보며 손으로 세던 걸 대신하고,
// "에그타르트+휘낭시에 합쳐 30개 넘으면" 같은 기준도 상품 합계로 바로 보인다.
export function OrderTallyPanel({ orders, events }: { orders: Order[]; events: MarketEvent[] }) {
  // 주문이 들어온 회차만, 배송일이 가까운 순. 기본 선택은 아직 배송 전인 가장 가까운 회차.
  const candidates = useMemo(() => {
    const withOrders = new Set(orders.map((o) => o.eventId));
    return events
      .filter((e) => withOrders.has(e.id) && e.type !== "PARCEL")
      .sort((a, b) => new Date(a.deliveryAt).getTime() - new Date(b.deliveryAt).getTime());
  }, [orders, events]);
  const [pickedId, setPickedId] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [today] = useState(() => new Date().setHours(0, 0, 0, 0));
  const defaultEvent = candidates.find((e) => new Date(e.deliveryAt).getTime() >= today) ?? candidates[candidates.length - 1];
  const event = candidates.find((e) => e.id === pickedId) ?? defaultEvent;
  const result = useMemo(() => (event ? tally(event, orders) : null), [event, orders]);

  if (candidates.length === 0 || !event || !result) return null;

  async function copy() {
    if (!event || !result) return;
    const lines = [`${event.title} 발주 집계 (입금완료 기준)`];
    for (const p of result.products) {
      lines.push(`${p.name} ${p.confirmed}개`);
      for (const o of p.options) lines.push(`  - ${o.label} ${o.confirmed}개`);
    }
    try {
      await navigator.clipboard.writeText(lines.join("\n"));
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // 클립보드 권한이 없으면 조용히 무시 — 표는 화면에 그대로 있다.
    }
  }

  return (
    <div className="mb-6 rounded-xl border border-border p-3.5">
      <div className="mb-2.5 flex flex-wrap items-center justify-between gap-2">
        <p className="text-[13.5px] font-bold">📦 회차별 발주 집계</p>
        <div className="flex items-center gap-1.5">
          <select
            className="rounded-[8px] border border-border bg-bg-card px-2 py-1.5 text-[12.5px]"
            value={event.id}
            onChange={(e) => setPickedId(e.target.value)}
          >
            {candidates.map((e) => (
              <option key={e.id} value={e.id}>
                {EVENT_TYPE_LABEL[e.type]} · {formatEventDateChip(e.deliveryAt)} {e.title}
              </option>
            ))}
          </select>
          <button type="button" onClick={copy} className="rounded-[8px] border border-border px-2.5 py-1.5 text-[12px] font-semibold">
            {copied ? "복사됨" : "복사"}
          </button>
        </div>
      </div>
      <p className="mb-2 text-[11.5px] text-text-muted">
        입금완료 기준 {result.confirmedOrders}건 · 입금대기 {result.waitOrders}건 (취소·환불 제외). 괄호 안은 아직 입금 안 된 수량이에요.
      </p>
      {result.products.length === 0 ? (
        <p className="text-[12.5px] text-text-muted">집계할 주문이 없어요.</p>
      ) : (
        <div className="flex flex-col gap-2">
          {result.products.map((p) => (
            <div key={p.name} className="rounded-[9px] bg-bg-sunken px-3 py-2">
              <div className="flex items-center justify-between gap-2 text-[13px]">
                <span className="min-w-0 truncate font-bold">{p.name}</span>
                <span className="shrink-0">
                  <strong className="text-[15px]">{p.confirmed}개</strong>
                  {p.wait > 0 && <span className="ml-1 text-[11.5px] text-text-muted">(+대기 {p.wait})</span>}
                </span>
              </div>
              {p.options.map((o) => (
                <div key={o.label} className="mt-1 flex items-center justify-between gap-2 pl-3 text-[12px] text-text-muted">
                  <span className="min-w-0 truncate">└ {o.label}</span>
                  <span className="shrink-0">
                    <strong className="text-text">{o.confirmed}개</strong>
                    {o.wait > 0 && <span className="ml-1 text-[11px]">(+대기 {o.wait})</span>}
                  </span>
                </div>
              ))}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
