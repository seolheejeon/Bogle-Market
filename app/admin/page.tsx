"use client";

import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { listAllOrders, listEvents, updateOrderStatus, createNotification, approveCancelRequest, rejectCancelRequest } from "@/lib/data";
import type { EventType, MarketEvent, Order, OrderStatus } from "@/types";
import { ORDER_STATUS_LABEL, PAYMENT_METHOD_LABEL, EVENT_TYPE_LABEL, COURIER_OPTIONS, COURIER_LABEL } from "@/types";
import { formatDateTime, formatPrice } from "@/lib/format";
import { OrderStatusBadge } from "@/components/Badge";

const NEXT_STATUS: Partial<Record<OrderStatus, OrderStatus>> = { wait: "paid", paid: "confirmed", confirmed: "ship", ship: "done" };
const NEXT_LABEL: Partial<Record<OrderStatus, string>> = { wait: "입금확인", paid: "발주확인", confirmed: "배송시작", ship: "배송완료 처리" };
const STATUS_OPTIONS: (OrderStatus | "all")[] = ["all", "wait", "paid", "confirmed", "ship", "done", "refund_requested", "refunded", "cancelled"];
const PERIOD_DAYS: Record<string, number> = { "7": 7, "30": 30, "90": 90, "365": 365 };

// 주요 상태 전환 시 해당 주문 고객에게만(비회원 제외) 알림을 보낸다. 발주확인은
// 고객이 딱히 할 일이 없는 내부 진행 상태라 알림을 보내지 않는다.
const STATUS_CHANGE_NOTICE: Partial<Record<OrderStatus, { title: string; message: string; icon: string }>> = {
  paid: { title: "입금이 확인됐어요", message: "입금이 확인됐어요. 발주 준비 중이에요.", icon: "💰" },
  ship: { title: "배송이 시작됐어요", message: "배송이 시작됐어요.", icon: "🚚" },
  done: { title: "배송이 완료됐어요", message: "배송이 완료됐어요. 확인해보세요!", icon: "🚚" },
  refunded: { title: "환불이 완료됐어요", message: "환불 처리가 완료됐어요.", icon: "💸" },
  cancelled: { title: "주문이 취소됐어요", message: "취소 요청이 승인돼서 주문이 취소됐어요.", icon: "🧾" },
};

async function notifyStatusChange(
  order: Order,
  next: OrderStatus,
  eventTitle?: string,
  shipping?: { courierCode: string; trackingNumber: string },
) {
  const notice = STATUS_CHANGE_NOTICE[next];
  if (!order.profileId || !notice) return;
  const prefix = eventTitle ? `[${eventTitle}] ` : "";
  const shippingSuffix = shipping ? ` (${COURIER_LABEL[shipping.courierCode] ?? "택배"} / ${shipping.trackingNumber})` : "";
  await createNotification({
    title: notice.title,
    message: `${prefix}주문번호 ${order.orderNumber} ${notice.message}${shippingSuffix}`,
    icon: notice.icon,
    linkType: "ORDER",
    linkId: order.id,
    profileId: order.profileId,
  });
}

function isToday(iso: string): boolean {
  return new Date(iso).toDateString() === new Date().toDateString();
}

export default function AdminHomePage() {
  const searchParams = useSearchParams();
  const [orders, setOrders] = useState<Order[]>([]);
  const [events, setEvents] = useState<MarketEvent[]>([]);
  const [loading, setLoading] = useState(true);

  const [typeFilter, setTypeFilter] = useState<EventType | "">("");
  const [subFilter, setSubFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState<OrderStatus | "all">("all");
  const [search, setSearch] = useState("");
  const [period, setPeriod] = useState<keyof typeof PERIOD_DAYS | "all">("30");
  const [cancelOnly, setCancelOnly] = useState(false);
  const [todayDeliveryOnly, setTodayDeliveryOnly] = useState(false);
  const [todayDoneOnly, setTodayDoneOnly] = useState(false);
  const [activeTile, setActiveTile] = useState<string | null>(null);
  const [bulkCompleting, setBulkCompleting] = useState(false);
  // 배송중 전환은 택배사+송장번호를 먼저 받아야 해서, 한 번에 하나의 주문만
  // 인라인 입력 폼을 펼쳐둔다.
  const [shippingId, setShippingId] = useState<string | null>(null);

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

  const eventById = useMemo(() => new Map(events.map((e) => [e.id, e])), [events]);

  // /admin/events에서 "주문 바로 보기"로 들어온 경우 그 이벤트로 필터를 미리 세팅.
  useEffect(() => {
    const eventId = searchParams.get("event");
    if (!eventId || events.length === 0) return;
    const ev = eventById.get(eventId);
    if (!ev) return;
    setTypeFilter(ev.type);
    setSubFilter(ev.type === "PARCEL" ? "" : eventId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams, events]);

  async function advance(order: Order) {
    const next = NEXT_STATUS[order.status];
    if (!next) return;
    await updateOrderStatus(order.id, next);
    await notifyStatusChange(order, next, eventById.get(order.eventId)?.title);
    refresh();
  }
  // 배송중 전환 전용 — 택배사/송장번호를 같이 받아서 저장하고, 알림에도 포함해 보낸다.
  async function submitShipping(order: Order, courierCode: string, trackingNumber: string) {
    await updateOrderStatus(order.id, "ship", { courierCode, trackingNumber });
    await notifyStatusChange(order, "ship", eventById.get(order.eventId)?.title, { courierCode, trackingNumber });
    setShippingId(null);
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
    await notifyStatusChange(order, "refunded", eventById.get(order.eventId)?.title);
    refresh();
  }
  async function approveCancel(order: Order) {
    if (!confirm("취소 요청을 승인할까요? 재고가 있으면 복구되고, 고객에게 취소 알림이 가요.")) return;
    await approveCancelRequest(order.id);
    await notifyStatusChange(order, "cancelled", eventById.get(order.eventId)?.title);
    refresh();
  }
  async function rejectCancel(order: Order) {
    const reason = window.prompt("거절 사유를 입력해주세요. 고객에게 그대로 전달돼요.");
    if (reason === null) return;
    if (!reason.trim()) {
      alert("거절 사유를 입력해주세요.");
      return;
    }
    await rejectCancelRequest(order.id);
    if (order.profileId) {
      await createNotification({
        title: "취소 요청이 거절됐어요",
        message: `주문번호 ${order.orderNumber} 취소 요청이 거절됐어요: ${reason.trim()}`,
        icon: "🙏",
        linkType: "ORDER",
        linkId: order.id,
        profileId: order.profileId,
      });
    }
    refresh();
  }

  // ---------- 오늘 할 일 타일 ----------
  const tiles = useMemo(() => {
    const soldoutCount = events.reduce((s, e) => s + e.products.filter((p) => p.stock === 0).length, 0);
    return [
      { key: "wait", label: "입금대기 주문", count: orders.filter((o) => o.status === "wait").length },
      { key: "paid", label: "발주확인 대기", count: orders.filter((o) => o.status === "paid").length },
      {
        key: "deliverytoday",
        label: "오늘 배송 예정",
        count: orders.filter((o) => o.status === "confirmed" && isToday(eventById.get(o.eventId)?.deliveryAt ?? "")).length,
      },
      { key: "ship", label: "배송중", count: orders.filter((o) => o.status === "ship").length },
      {
        key: "donetoday",
        label: "오늘 배송완료",
        count: orders.filter((o) => o.status === "done" && isToday(eventById.get(o.eventId)?.deliveryAt ?? "")).length,
      },
      { key: "cancel_requested", label: "취소 요청", count: orders.filter((o) => o.cancelRequested).length },
      { key: "refund_requested", label: "반품/환불 요청", count: orders.filter((o) => o.status === "refund_requested").length },
      { key: "soldout", label: "품절 상품", count: soldoutCount, href: "/admin/events" },
      { key: "events", label: "진행중 이벤트", count: events.length, href: "/admin/events" },
    ];
  }, [orders, events, eventById]);

  function clickTile(key: string) {
    setActiveTile(key);
    setCancelOnly(false);
    setTodayDeliveryOnly(false);
    setTodayDoneOnly(false);
    if (key === "deliverytoday") {
      setStatusFilter("confirmed");
      setTodayDeliveryOnly(true);
      setPeriod("all");
    } else if (key === "donetoday") {
      setStatusFilter("done");
      setTodayDoneOnly(true);
      setPeriod("all");
    } else if (key === "cancel_requested") {
      setStatusFilter("all");
      setCancelOnly(true);
    } else {
      setStatusFilter(key as OrderStatus);
    }
  }

  // ---------- 배송방식 → 종속(이벤트/상품) 필터 ----------
  const orderedEventIds = useMemo(() => new Set(orders.map((o) => o.eventId)), [orders]);
  const subEventOptions = useMemo(
    () => (typeFilter && typeFilter !== "PARCEL" ? events.filter((e) => e.type === typeFilter && orderedEventIds.has(e.id)) : []),
    [events, typeFilter, orderedEventIds],
  );
  const parcelProductNames = useMemo(() => {
    const names = new Set<string>();
    orders.forEach((o) => {
      if (eventById.get(o.eventId)?.type === "PARCEL") o.items.forEach((i) => names.add(i.productName));
    });
    return Array.from(names).sort();
  }, [orders, eventById]);

  const filtered = orders.filter((o) => {
    const ev = eventById.get(o.eventId);
    if (typeFilter && ev?.type !== typeFilter) return false;
    if (subFilter) {
      if (typeFilter === "PARCEL") {
        if (!o.items.some((i) => i.productName === subFilter)) return false;
      } else if (o.eventId !== subFilter) return false;
    }
    if (statusFilter !== "all" && o.status !== statusFilter) return false;
    if (cancelOnly && !o.cancelRequested) return false;
    if (search) {
      const q = search.toLowerCase();
      if (!o.orderNumber.toLowerCase().includes(q) && !o.recipientName.toLowerCase().includes(q)) return false;
    }
    if (todayDeliveryOnly && !isToday(ev?.deliveryAt ?? "")) return false;
    if (todayDoneOnly && !isToday(ev?.deliveryAt ?? "")) return false;
    if (period !== "all") {
      const ageMs = Date.now() - new Date(o.createdAt).getTime();
      if (ageMs > PERIOD_DAYS[period] * 86400000) return false;
    }
    return true;
  });

  function clearFilters() {
    setTypeFilter("");
    setSubFilter("");
    setStatusFilter("all");
    setSearch("");
    setPeriod("30");
    setCancelOnly(false);
    setTodayDeliveryOnly(false);
    setTodayDoneOnly(false);
    setActiveTile(null);
  }

  // ---------- 배송 관리(아파트별 그룹) ----------
  // 문고리·사다드림은 배송을 아파트 단위로 도는 경우가 많아, 배송중 주문을
  // 이벤트 → 아파트로 묶어 한 번에 배송완료 처리 + 그 아파트 고객에게만 알림을
  // 보낼 수 있게 한다(택배는 아파트 개념이 없어 제외).
  const deliveryGroups = useMemo(() => {
    const byEvent = new Map<string, Map<string, Order[]>>();
    orders
      .filter((o) => o.status === "ship" && o.apartmentName && eventById.get(o.eventId)?.type !== "PARCEL")
      .forEach((o) => {
        if (!byEvent.has(o.eventId)) byEvent.set(o.eventId, new Map());
        const aptMap = byEvent.get(o.eventId)!;
        if (!aptMap.has(o.apartmentName!)) aptMap.set(o.apartmentName!, []);
        aptMap.get(o.apartmentName!)!.push(o);
      });
    return byEvent;
  }, [orders, eventById]);

  async function completeApartmentGroup(eventId: string, apt: string, groupOrders: Order[]) {
    if (!confirm(`"${apt}"의 배송중 주문 ${groupOrders.length}건을 전부 배송완료 처리하고, 그 아파트 고객에게만 배송완료 알림을 보낼까요?`)) return;
    setBulkCompleting(true);
    for (const o of groupOrders) {
      await updateOrderStatus(o.id, "done");
      await notifyStatusChange(o, "done", eventById.get(o.eventId)?.title);
    }
    setBulkCompleting(false);
    refresh();
  }

  return (
    <div>
      <p className="mb-1 text-[15px] font-bold">운영 메인</p>
      <p className="mb-4 text-[12.5px] text-text-muted">오늘 처리할 일을 누르면 아래 주문 목록이 그 조건으로 필터돼요.</p>

      <div className="mb-6 grid grid-cols-3 gap-2 sm:grid-cols-5">
        {tiles.map((t) =>
          t.href ? (
            <Link key={t.key} href={t.href} className="rounded-xl border border-border p-3 text-left">
              <p className={`text-xl font-extrabold ${t.count > 0 ? "text-text" : "text-text-muted"}`}>{t.count}</p>
              <p className="mt-0.5 text-[11.5px] font-semibold text-text-muted">{t.label}</p>
            </Link>
          ) : (
            <button
              key={t.key}
              onClick={() => clickTile(t.key)}
              className={`rounded-xl border p-3 text-left ${activeTile === t.key ? "border-accent bg-accent-soft" : "border-border"}`}
            >
              <p className={`text-xl font-extrabold ${t.count > 0 ? "text-red-600" : "text-text-muted"}`}>{t.count}</p>
              <p className="mt-0.5 text-[11.5px] font-semibold text-text-muted">{t.label}</p>
            </button>
          ),
        )}
      </div>

      {deliveryGroups.size > 0 && (
        <div className="mb-6 rounded-xl border border-border p-3.5">
          <p className="mb-2.5 text-[13.5px] font-bold">배송 관리 (아파트별)</p>
          <div className="flex flex-col gap-3">
            {Array.from(deliveryGroups.entries()).map(([eventId, aptMap]) => (
              <div key={eventId}>
                <p className="mb-1.5 text-[12.5px] font-bold text-accent-dark">{eventById.get(eventId)?.title}</p>
                <div className="flex flex-col gap-1.5">
                  {Array.from(aptMap.entries()).map(([apt, groupOrders]) => (
                    <div key={apt} className="flex items-center justify-between rounded-[9px] bg-bg-sunken px-3 py-2">
                      <span className="text-[13px] font-semibold">
                        {apt} <span className="text-[11.5px] font-normal text-text-muted">({groupOrders.length}건)</span>
                      </span>
                      <button
                        onClick={() => completeApartmentGroup(eventId, apt, groupOrders)}
                        disabled={bulkCompleting}
                        className="rounded-[8px] bg-accent px-3 py-1.5 text-[12px] font-bold text-white disabled:opacity-50"
                      >
                        배송완료 처리 + 알림 발송
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      <p className="mb-2 text-[13.5px] font-bold">주문 ({filtered.length}건)</p>
      <div className="mb-3 flex flex-wrap gap-2">
        <select
          className="rounded-[9px] border border-border bg-bg-card px-3 py-2 text-[13px] font-semibold"
          value={typeFilter}
          onChange={(e) => {
            setTypeFilter(e.target.value as EventType | "");
            setSubFilter("");
          }}
        >
          <option value="">전체 배송방식</option>
          {(Object.keys(EVENT_TYPE_LABEL) as EventType[]).map((t) => (
            <option key={t} value={t}>
              {EVENT_TYPE_LABEL[t]}
            </option>
          ))}
        </select>
        <select
          className="rounded-[9px] border border-border bg-bg-card px-3 py-2 text-[13px] disabled:opacity-50"
          value={subFilter}
          disabled={!typeFilter}
          onChange={(e) => setSubFilter(e.target.value)}
        >
          <option value="">전체</option>
          {typeFilter === "PARCEL"
            ? parcelProductNames.map((name) => (
                <option key={name} value={name}>
                  {name}
                </option>
              ))
            : subEventOptions.map((e) => (
                <option key={e.id} value={e.id}>
                  {e.title}
                </option>
              ))}
        </select>
        <select
          className="rounded-[9px] border border-border bg-bg-card px-3 py-2 text-[13px]"
          value={statusFilter}
          onChange={(e) => {
            setStatusFilter(e.target.value as OrderStatus | "all");
            setCancelOnly(false);
            setActiveTile(null);
          }}
        >
          {STATUS_OPTIONS.map((s) => (
            <option key={s} value={s}>
              {s === "all" ? "전체 상태" : ORDER_STATUS_LABEL[s]}
            </option>
          ))}
        </select>
        <input
          className="rounded-[9px] border border-border bg-bg-card px-3 py-2 text-[13px]"
          placeholder="주문번호·고객명 검색"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <select className="rounded-[9px] border border-border bg-bg-card px-3 py-2 text-[13px]" value={period} onChange={(e) => setPeriod(e.target.value as typeof period)}>
          <option value="7">최근 7일</option>
          <option value="30">최근 30일</option>
          <option value="90">최근 3개월</option>
          <option value="365">최근 1년</option>
          <option value="all">전체 기간</option>
        </select>
        <button onClick={clearFilters} className="px-1 text-[12px] text-text-muted underline">
          필터 초기화
        </button>
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
              <div className="flex items-center gap-1.5">
                {o.cancelRequested && <span className="rounded-md bg-red-100 px-1.5 py-0.5 text-[11px] font-bold text-red-600">취소 요청</span>}
                <OrderStatusBadge status={o.status} />
              </div>
            </div>
            {eventById.get(o.eventId) && <p className="mb-1 text-[12px] font-semibold text-accent-dark">{eventById.get(o.eventId)?.title}</p>}
            <p className="text-[13px]">
              {o.recipientName} ({o.recipientPhone}) · {PAYMENT_METHOD_LABEL[o.paymentMethod]}
            </p>
            <p className="mt-1 text-[12.5px] text-text-muted">{o.addressSnapshot}</p>
            <p className="mt-1 text-[12.5px] text-text-muted">{o.items.map((i) => `${i.productName} x${i.quantity}`).join(", ")}</p>
            {o.courierCode && o.trackingNumber && (
              <p className="mt-1 text-[12px] font-semibold text-accent-dark">
                {COURIER_LABEL[o.courierCode] ?? "택배"} · {o.trackingNumber}
              </p>
            )}
            {o.cancelRequested && o.cancelReason && <p className="mt-1 text-[12px] font-semibold text-red-600">고객 취소 사유: {o.cancelReason}</p>}
            <div className="mt-1.5 flex items-center justify-between">
              <strong className="text-[14px]">{formatPrice(o.total)}</strong>
              <div className="flex gap-1.5">
                {o.cancelRequested ? (
                  <>
                    <button onClick={() => approveCancel(o)} className="rounded-[8px] bg-accent px-3 py-1.5 text-[12px] font-bold text-white">
                      취소 승인
                    </button>
                    <button onClick={() => rejectCancel(o)} className="rounded-[8px] border border-border px-3 py-1.5 text-[12px] font-semibold text-red-600">
                      거절
                    </button>
                  </>
                ) : (
                  <>
                    {NEXT_STATUS[o.status] === "ship" ? (
                      <button
                        onClick={() => setShippingId(shippingId === o.id ? null : o.id)}
                        className="rounded-[8px] bg-accent px-3 py-1.5 text-[12px] font-bold text-white"
                      >
                        송장 입력
                      </button>
                    ) : (
                      NEXT_STATUS[o.status] && (
                        <button onClick={() => advance(o)} className="rounded-[8px] bg-accent px-3 py-1.5 text-[12px] font-bold text-white">
                          {NEXT_LABEL[o.status]}
                        </button>
                      )
                    )}
                    {o.status === "refund_requested" && (
                      <button onClick={() => markRefunded(o)} className="rounded-[8px] bg-accent px-3 py-1.5 text-[12px] font-bold text-white">
                        환불완료 처리
                      </button>
                    )}
                    {o.status !== "done" && o.status !== "cancelled" && o.status !== "refund_requested" && o.status !== "refunded" && (
                      <button onClick={() => cancel(o)} className="rounded-[8px] border border-border px-3 py-1.5 text-[12px] font-semibold text-red-600">
                        취소
                      </button>
                    )}
                  </>
                )}
              </div>
            </div>
            {shippingId === o.id && (
              <ShippingForm onSubmit={(courierCode, trackingNumber) => submitShipping(o, courierCode, trackingNumber)} onCancel={() => setShippingId(null)} />
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

function ShippingForm({ onSubmit, onCancel }: { onSubmit: (courierCode: string, trackingNumber: string) => Promise<void>; onCancel: () => void }) {
  const [courierCode, setCourierCode] = useState<string>(COURIER_OPTIONS[0].code);
  const [trackingNumber, setTrackingNumber] = useState("");
  const [submitting, setSubmitting] = useState(false);

  async function submit() {
    if (!trackingNumber.trim()) return;
    setSubmitting(true);
    await onSubmit(courierCode, trackingNumber.trim());
    setSubmitting(false);
  }

  return (
    <div className="mt-2 flex flex-wrap items-center gap-2 rounded-lg bg-bg-sunken p-2.5">
      <select
        value={courierCode}
        onChange={(e) => setCourierCode(e.target.value)}
        className="rounded-[7px] border border-border bg-bg-card px-2 py-1.5 text-[12.5px]"
      >
        {COURIER_OPTIONS.map((c) => (
          <option key={c.code} value={c.code}>
            {c.label}
          </option>
        ))}
      </select>
      <input
        value={trackingNumber}
        onChange={(e) => setTrackingNumber(e.target.value)}
        placeholder="송장번호"
        className="min-w-[140px] flex-1 rounded-[7px] border border-border bg-bg-card px-2 py-1.5 text-[12.5px]"
      />
      <button
        onClick={submit}
        disabled={submitting || !trackingNumber.trim()}
        className="rounded-[7px] bg-accent px-3 py-1.5 text-[12px] font-bold text-white disabled:opacity-50"
      >
        {submitting ? "저장 중..." : "배송시작"}
      </button>
      <button onClick={onCancel} className="rounded-[7px] border border-border px-3 py-1.5 text-[12px] font-semibold">
        취소
      </button>
    </div>
  );
}
