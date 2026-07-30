"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useAuth } from "@/lib/auth-context";
import { listOrdersForProfile, lookupGuestOrders, getEvent, cancelOrder, requestCancellation, requestRefund } from "@/lib/data";
import type { MarketEvent, Order, OrderStatus } from "@/types";
import { PAYMENT_METHOD_LABEL, ORDER_STATUS_LABEL, COURIER_LABEL, COURIER_TRACKING_URL } from "@/types";
import { formatDateTime, formatPrice, formatEventDateChip } from "@/lib/format";
import { OrderStatusBadge } from "@/components/Badge";
import { BankAccountInfo } from "@/components/BankAccountInfo";

const STEPS: { value: OrderStatus; label: string }[] = [
  { value: "wait", label: "입금대기" },
  { value: "paid", label: "입금완료" },
  { value: "confirmed", label: "발주확인" },
  { value: "ship", label: "배송중" },
  { value: "done", label: "배송완료" },
];

export function OrderDetailView({ orderId, guestName, guestPin }: { orderId: string; guestName?: string; guestPin?: string }) {
  const router = useRouter();
  const { profile, loading } = useAuth();
  const [order, setOrder] = useState<Order | null | undefined>(undefined);
  // 한 번의 체크아웃(batchId)에서 같이 만들어진 다른 이벤트의 주문들 — 이벤트가
  // 하나뿐인 보통의 주문에서는 항상 빈 배열.
  const [batchSiblings, setBatchSiblings] = useState<Order[]>([]);
  const [event, setEvent] = useState<MarketEvent | null>(null);
  const [cancelling, setCancelling] = useState(false);
  const [requestingRefund, setRequestingRefund] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  function apply(all: Order[]) {
    const found = all.find((o) => o.id === orderId) ?? null;
    setOrder(found);
    setBatchSiblings(found ? all.filter((o) => o.batchId === found.batchId && o.id !== found.id) : []);
  }

  function refresh() {
    if (profile) {
      listOrdersForProfile(profile.id).then(apply);
    } else if (guestName && guestPin) {
      lookupGuestOrders(guestName, guestPin).then(apply);
    } else {
      setOrder(null);
    }
  }

  useEffect(() => {
    if (loading) return;
    refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profile, loading, orderId, guestName, guestPin]);

  useEffect(() => {
    if (!order) return;
    getEvent(order.eventId).then(setEvent);
  }, [order]);

  // done 이후 refund_requested/refunded로 갈라져도(STEPS엔 없는 상태) 스테퍼는
  // "배송완료"까지 다 밟은 것으로 표시 — 실제로 그 단계를 다 거쳐야 도달하는 상태라서.
  const stepIndex = order
    ? order.status === "refund_requested" || order.status === "refunded"
      ? STEPS.length - 1
      : STEPS.findIndex((s) => s.value === order.status)
    : -1;
  const siblingHref = (id: string) => (guestName && guestPin ? `/orders/${id}?gn=${encodeURIComponent(guestName)}&pin=${guestPin}` : `/orders/${id}`);

  const canSelfCancel = order?.status === "wait" || order?.status === "paid";
  const cancelPending = order?.cancelRequested ?? false;
  const canRequestCancel = (order?.status === "confirmed" || order?.status === "ship") && !cancelPending;
  const canRequestRefund = order?.status === "done";

  async function handleCancel() {
    if (!order) return;
    if (!confirm("이 주문을 취소할까요?")) return;
    setActionError(null);
    setCancelling(true);
    try {
      await cancelOrder(order.id, { profileId: profile?.id ?? null, guestName, guestPin });
      refresh();
    } catch (e) {
      setActionError(e instanceof Error ? e.message : "취소 중 오류가 발생했어요.");
    } finally {
      setCancelling(false);
    }
  }

  // 발주확인 이후엔 즉시 취소가 아니라 요청만 남긴다 — 관리자가 승인/거절한다.
  async function handleRequestCancel() {
    if (!order) return;
    const reason = window.prompt("취소 사유를 알려주시면 확인이 더 빨라요. (선택 입력, 비워두고 확인해도 돼요)");
    if (reason === null) return;
    setActionError(null);
    setCancelling(true);
    try {
      await requestCancellation(order.id, { profileId: profile?.id ?? null, guestName, guestPin, reason: reason.trim() || undefined });
      refresh();
    } catch (e) {
      setActionError(e instanceof Error ? e.message : "요청 중 오류가 발생했어요.");
    } finally {
      setCancelling(false);
    }
  }

  async function handleRequestRefund() {
    if (!order) return;
    if (!confirm("반품/환불을 신청할까요? 확인 후 처리해드릴게요.")) return;
    setActionError(null);
    setRequestingRefund(true);
    try {
      await requestRefund(order.id);
      refresh();
    } catch (e) {
      setActionError(e instanceof Error ? e.message : "신청 중 오류가 발생했어요.");
    } finally {
      setRequestingRefund(false);
    }
  }

  return (
    <div>
      <div className="flex items-center gap-2 border-b border-border px-4 py-3">
        <button onClick={() => router.push("/orders")} className="p-1 text-xl text-text">
          ‹
        </button>
        <strong className="text-[15px]">주문 상세</strong>
      </div>
      <div className="p-4">
        {order === undefined && <p className="text-sm text-text-muted">불러오는 중...</p>}
        {order === null && <p className="text-sm text-text-muted">주문을 찾을 수 없어요. 로그인하거나 주문번호로 조회해 주세요.</p>}
        {order && (
          <>
            <div className="mb-2 flex items-center justify-between">
              <span className="text-[13px] text-text-muted">{order.orderNumber}</span>
              <OrderStatusBadge status={order.status} />
            </div>
            <p className="text-[12px] text-text-muted">{formatDateTime(order.createdAt)}</p>

            {order.status !== "cancelled" && (
              <div className="my-4.5 flex items-center">
                {STEPS.map((s, i) => (
                  <div key={s.value} className="flex flex-1 items-center last:flex-none">
                    <div className="flex flex-col items-center gap-1">
                      <div className={`flex h-[26px] w-[26px] items-center justify-center rounded-full text-xs font-bold ${i <= stepIndex ? "bg-accent text-white" : "bg-bg-sunken text-text-muted"}`}>
                        {i + 1}
                      </div>
                      <span className={`text-[10.5px] ${i <= stepIndex ? "font-bold text-accent-dark" : "text-text-muted"}`}>{s.label}</span>
                    </div>
                    {i < STEPS.length - 1 && <div className={`mx-1 mb-4.5 h-0.5 flex-1 ${i < stepIndex ? "bg-accent" : "bg-border"}`} />}
                  </div>
                ))}
              </div>
            )}

            <div className="mb-4 rounded-[10px] border border-border p-3 text-[13px]">
              {event && (
                <p className="mb-1">
                  <span className="text-text-muted">이벤트</span> {event.title} · 배송예정 {formatEventDateChip(event.deliveryAt)}
                </p>
              )}
              <p className="mb-1">
                <span className="text-text-muted">받는 분</span> {order.recipientName} ({order.recipientPhone})
              </p>
              <p className="mb-1">
                <span className="text-text-muted">배송지</span> {order.addressSnapshot}
              </p>
              <p>
                <span className="text-text-muted">결제 방법</span> {PAYMENT_METHOD_LABEL[order.paymentMethod]}
              </p>
            </div>

            {order.courierCode && order.trackingNumber && <TrackingSection courierCode={order.courierCode} trackingNumber={order.trackingNumber} />}

            {actionError && <p className="mb-4 text-[12.5px] font-semibold text-red-600">{actionError}</p>}

            {canSelfCancel && (
              <button
                onClick={handleCancel}
                disabled={cancelling}
                className="mb-4 w-full rounded-[10px] border border-border py-2.5 text-[13px] font-semibold text-red-600 disabled:opacity-50"
              >
                {cancelling ? "취소 처리 중..." : "주문 취소"}
              </button>
            )}
            {canRequestCancel && (
              <button
                onClick={handleRequestCancel}
                disabled={cancelling}
                className="mb-4 w-full rounded-[10px] border border-border py-2.5 text-[13px] font-semibold text-red-600 disabled:opacity-50"
              >
                {cancelling ? "요청 처리 중..." : "취소 요청"}
              </button>
            )}
            {cancelPending && (
              <p className="mb-4 rounded-[10px] bg-bg-sunken p-3 text-[12.5px] text-text-muted">
                취소 요청이 접수됐어요. 확인 후 승인되면 취소 처리되고, 어려운 경우 사유와 함께 알려드릴게요.
              </p>
            )}
            {canRequestRefund && (
              <button
                onClick={handleRequestRefund}
                disabled={requestingRefund}
                className="mb-4 w-full rounded-[10px] border border-border py-2.5 text-[13px] font-semibold disabled:opacity-50"
              >
                {requestingRefund ? "신청 처리 중..." : "반품/환불 신청"}
              </button>
            )}
            {order.status === "refund_requested" && (
              <p className="mb-4 rounded-[10px] bg-bg-sunken p-3 text-[12.5px] text-text-muted">
                반품/환불 신청이 접수됐어요. 확인 후 처리해드릴게요.
              </p>
            )}

            {batchSiblings.length > 0 && (
              <div className="mb-4 rounded-[10px] border border-border p-3">
                <p className="mb-2 text-[12px] font-bold text-text-muted">이번에 함께 결제한 다른 주문</p>
                <div className="flex flex-col gap-2">
                  {batchSiblings.map((sibling) => (
                    <Link key={sibling.id} href={siblingHref(sibling.id)} className="flex items-center justify-between text-[12.5px]">
                      <span className="text-text-muted">{sibling.orderNumber}</span>
                      <span className="flex items-center gap-2">
                        <span>{ORDER_STATUS_LABEL[sibling.status]}</span>
                        <span className="font-semibold">{formatPrice(sibling.total)}</span>
                      </span>
                    </Link>
                  ))}
                </div>
              </div>
            )}

            {order.paymentMethod === "bank_transfer" && order.status === "wait" && (
              <div className="mb-4">
                <BankAccountInfo />
              </div>
            )}

            <p className="mb-2 text-[12.5px] font-bold text-text-muted">주문 상품</p>
            <div className="flex flex-col gap-2">
              {order.items.map((item) => (
                <div key={item.productId} className="flex items-center gap-3">
                  <div className="flex h-[44px] w-[44px] items-center justify-center rounded-[10px] bg-accent-soft text-xl">{item.productEmoji}</div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[13px]">{item.productName}</p>
                    <p className="text-[12px] text-text-muted">
                      {formatPrice(item.price)} x {item.quantity}
                    </p>
                  </div>
                  <span className="text-[13px] font-semibold">{formatPrice(item.price * item.quantity)}</span>
                </div>
              ))}
            </div>
            <div className="mt-4 flex justify-between border-t border-border pt-3.5 text-base font-extrabold">
              <span>총 결제금액</span>
              <span>{formatPrice(order.total)}</span>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

interface TrackingResult {
  ok: boolean;
  reason?: "not_configured" | "error";
  message?: string;
  statusText?: string;
  itemName?: string;
  estimate?: string;
  events?: { time: string; location: string; description: string }[];
}

// 실시간 조회(스마트택배 API)가 되면 앱 안에서 바로 상태/타임라인을 보여주고,
// 키 미설정이나 조회 실패 시엔 해당 택배사 공식 조회 페이지로 대신 안내한다.
function TrackingSection({ courierCode, trackingNumber }: { courierCode: string; trackingNumber: string }) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<TrackingResult | null>(null);
  const courierLabel = COURIER_LABEL[courierCode] ?? "택배";
  const fallbackUrl = COURIER_TRACKING_URL[courierCode]?.(trackingNumber);

  async function check() {
    setOpen(true);
    if (result) return;
    setLoading(true);
    try {
      const res = await fetch(`/api/tracking?courier=${encodeURIComponent(courierCode)}&invoice=${encodeURIComponent(trackingNumber)}`);
      setResult(await res.json());
    } catch {
      setResult({ ok: false, reason: "error" });
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="mb-4 rounded-[10px] border border-border p-3 text-[13px]">
      <p className="mb-1">
        <span className="text-text-muted">택배사</span> {courierLabel}
      </p>
      <p className="mb-2">
        <span className="text-text-muted">송장번호</span> {trackingNumber}
      </p>
      {!open && (
        <button onClick={check} className="w-full rounded-[9px] bg-accent py-2 text-[13px] font-bold text-white">
          배송조회
        </button>
      )}
      {open && loading && <p className="text-[12.5px] text-text-muted">배송 정보를 불러오는 중...</p>}
      {open && !loading && result?.ok && (
        <div>
          <p className="mb-2 font-bold text-accent-dark">
            {result.statusText}
            {result.estimate ? ` · 도착예정 ${result.estimate}` : ""}
          </p>
          {result.events && result.events.length > 0 && (
            <div className="flex flex-col gap-1.5 border-t border-border pt-2">
              {result.events.map((e, i) => (
                <div key={i} className="flex justify-between gap-2 text-[12px]">
                  <span className="shrink-0 text-text-muted">{e.time}</span>
                  <span className="flex-1 text-center">{e.description}</span>
                  <span className="shrink-0 text-text-muted">{e.location}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
      {open && !loading && result && !result.ok && (
        <div>
          <p className="mb-2 text-[12.5px] text-text-muted">
            {result.reason === "not_configured" ? "실시간 조회는 아직 준비 중이에요." : "배송 정보를 불러오지 못했어요."} 택배사 사이트에서 확인해 주세요.
          </p>
          {fallbackUrl && (
            <a
              href={fallbackUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="block w-full rounded-[9px] border border-border py-2 text-center text-[13px] font-bold text-accent-dark"
            >
              {courierLabel} 사이트에서 조회하기
            </a>
          )}
        </div>
      )}
    </div>
  );
}
