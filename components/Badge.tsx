import type { EventBadge, EventType, OrderStatus } from "@/types";
import { EVENT_BADGE_LABEL, EVENT_TYPE_LABEL, ORDER_STATUS_LABEL } from "@/types";

const EVENT_BADGE_CLASS: Record<EventType, string> = {
  DOOR: "bg-[var(--badge-door-bg)] text-[var(--badge-door-fg)]",
  GROUP_BUY: "bg-[var(--badge-group-bg)] text-[var(--badge-group-fg)]",
  PARCEL: "bg-[var(--badge-parcel-bg)] text-[var(--badge-parcel-fg)]",
};

export function EventTypeBadge({ type }: { type: EventType }) {
  return <span className={`rounded-md px-2 py-0.5 text-[11px] font-bold ${EVENT_BADGE_CLASS[type]}`}>{EVENT_TYPE_LABEL[type]}</span>;
}

const SALE_BADGE_CLASS = "bg-[var(--badge-flash-bg)] text-[var(--badge-flash-fg)]";
const EVENT_MERCHANDISE_BADGE_CLASS: Record<Exclude<EventBadge, "NONE">, string> = {
  SALE: SALE_BADGE_CLASS,
  HOT: "bg-[var(--badge-hot-bg)] text-[var(--badge-hot-fg)]",
  NEW: "bg-[var(--badge-new-bg)] text-[var(--badge-new-fg)]",
  RESERVE: "bg-[var(--badge-reserve-bg)] text-[var(--badge-reserve-fg)]",
  DEADLINE: "bg-[var(--badge-deadline-bg)] text-[var(--badge-deadline-fg)]",
};

// 배송방식 뱃지(EventTypeBadge)와 나란히 붙는 판매용 뱃지 — 관리자가 이벤트
// 수정 화면에서 고른 값을 그대로 보여준다. "없음"이면 아무것도 렌더링하지 않는다.
export function EventBadgeTag({ badge }: { badge?: EventBadge }) {
  if (!badge || badge === "NONE") return null;
  const label = badge === "SALE" ? "🔥 1시간 특가" : EVENT_BADGE_LABEL[badge];
  return <span className={`rounded-md px-2 py-0.5 text-[11px] font-bold ${EVENT_MERCHANDISE_BADGE_CLASS[badge]}`}>{label}</span>;
}

const STATUS_BADGE_CLASS: Record<OrderStatus, string> = {
  wait: "bg-[var(--status-wait-bg)] text-[var(--status-wait-fg)]",
  paid: "bg-[var(--status-paid-bg)] text-[var(--status-paid-fg)]",
  confirmed: "bg-[var(--status-confirmed-bg)] text-[var(--status-confirmed-fg)]",
  ship: "bg-[var(--status-ship-bg)] text-[var(--status-ship-fg)]",
  done: "bg-[var(--status-done-bg)] text-[var(--status-done-fg)]",
  refund_requested: "bg-[var(--status-refund-requested-bg)] text-[var(--status-refund-requested-fg)]",
  refunded: "bg-[var(--status-refunded-bg)] text-[var(--status-refunded-fg)]",
  cancelled: "bg-[var(--badge-flash-bg)] text-[var(--badge-flash-fg)]",
};

export function OrderStatusBadge({ status }: { status: OrderStatus }) {
  return <span className={`rounded-md px-2 py-1 text-[11px] font-bold ${STATUS_BADGE_CLASS[status]}`}>{ORDER_STATUS_LABEL[status]}</span>;
}
