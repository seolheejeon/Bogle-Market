import type { EventType, OrderStatus } from "@/types";
import { EVENT_TYPE_LABEL, ORDER_STATUS_LABEL } from "@/types";

const EVENT_BADGE_CLASS: Record<EventType, string> = {
  DOOR: "bg-[var(--badge-door-bg)] text-[var(--badge-door-fg)]",
  GROUP_BUY: "bg-[var(--badge-group-bg)] text-[var(--badge-group-fg)]",
  PARCEL: "bg-[var(--badge-parcel-bg)] text-[var(--badge-parcel-fg)]",
};

export function EventTypeBadge({ type, flash }: { type: EventType; flash?: boolean }) {
  if (flash) {
    return <span className="rounded-md bg-[var(--badge-flash-bg)] px-2 py-0.5 text-[11px] font-bold text-[var(--badge-flash-fg)]">🔥 1시간 특가</span>;
  }
  return <span className={`rounded-md px-2 py-0.5 text-[11px] font-bold ${EVENT_BADGE_CLASS[type]}`}>{EVENT_TYPE_LABEL[type]}</span>;
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
