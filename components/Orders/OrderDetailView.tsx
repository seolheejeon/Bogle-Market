"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useAuth } from "@/lib/auth-context";
import { listOrdersForProfile, lookupGuestOrders, getEvent, cancelOrder, requestCancellation, requestRefund, updateOrderDelivery } from "@/lib/data";
import { uploadRefundPhoto } from "@/lib/supabase/storage";
import type { MarketEvent, Order, OrderStatus, RefundReasonCode } from "@/types";
import { PAYMENT_METHOD_LABEL, ORDER_STATUS_LABEL, COURIER_LABEL, COURIER_TRACKING_URL, REFUND_REASON_LABEL, formatAddress } from "@/types";
import { formatDateTime, formatPrice, formatEventDateChip } from "@/lib/format";
import { canEditOrderDelivery, DELIVERY_EDITABLE_STATUSES } from "@/lib/order-policy";
import { OrderStatusBadge } from "@/components/Badge";
import { BankAccountInfo } from "@/components/BankAccountInfo";
import { SupportLinks } from "@/components/SupportLinks";
import { AddressFields, type AddressFieldsValue } from "@/components/AddressFields";
import { saveGuestLookup, useGuestLookup, useIsClient } from "@/lib/guest-session";

const STEPS: { value: OrderStatus; label: string }[] = [
  { value: "wait", label: "입금대기" },
  { value: "paid", label: "입금완료" },
  { value: "confirmed", label: "발주확인" },
  { value: "ship", label: "배송중" },
  { value: "done", label: "배송완료" },
];

export function OrderDetailView({
  orderId,
  legacyGuestName,
  legacyGuestPin,
  justOrdered = false,
}: {
  orderId: string;
  legacyGuestName?: string;
  legacyGuestPin?: string;
  justOrdered?: boolean;
}) {
  const router = useRouter();
  const { profile, loading } = useAuth();
  // 비회원 조회 정보는 이 탭의 sessionStorage에서 읽는다(lib/guest-session.ts).
  // 예전 방식 링크(?gn=&pin=)로 들어오면 탭에 옮겨 담고 주소창에서 바로 지운다.
  const storedGuest = useGuestLookup();
  const isClient = useIsClient();
  const guestName = storedGuest?.name ?? legacyGuestName;
  const guestPin = storedGuest?.pin ?? legacyGuestPin;
  useEffect(() => {
    if (!legacyGuestName || !legacyGuestPin) return;
    saveGuestLookup(legacyGuestName, legacyGuestPin);
    router.replace(`/orders/${orderId}`);
  }, [legacyGuestName, legacyGuestPin, orderId, router]);
  const [order, setOrder] = useState<Order | null | undefined>(undefined);
  // 한 번의 체크아웃(batchId)에서 같이 만들어진 다른 이벤트의 주문들 — 이벤트가
  // 하나뿐인 보통의 주문에서는 항상 빈 배열.
  const [batchSiblings, setBatchSiblings] = useState<Order[]>([]);
  const [event, setEvent] = useState<MarketEvent | null>(null);
  const [cancelling, setCancelling] = useState(false);
  const [requestingRefund, setRequestingRefund] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [refundFormOpen, setRefundFormOpen] = useState(false);
  const [refundReasonCode, setRefundReasonCode] = useState<RefundReasonCode | "">("");
  const [refundDetail, setRefundDetail] = useState("");
  const [refundPhotoFile, setRefundPhotoFile] = useState<File | null>(null);
  const [refundPhotoPreview, setRefundPhotoPreview] = useState<string | null>(null);
  const [editingDelivery, setEditingDelivery] = useState(false);

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
    if (loading || !isClient) return;
    refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profile, loading, isClient, orderId, guestName, guestPin]);

  useEffect(() => {
    if (!order) return;
    getEvent(order.eventId).then(setEvent);
  }, [order]);

  // done 이후 refund_requested/refunded/refund_rejected로 갈라져도(STEPS엔 없는
  // 상태) 스테퍼는 "배송완료"까지 다 밟은 것으로 표시 — 실제로 그 단계를 다
  // 거쳐야 도달하는 상태라서.
  const stepIndex = order
    ? order.status === "refund_requested" || order.status === "refunded" || order.status === "refund_rejected"
      ? STEPS.length - 1
      : STEPS.findIndex((s) => s.value === order.status)
    : -1;
  const siblingHref = (id: string) => `/orders/${id}`;

  const canSelfCancel = order?.status === "wait" || order?.status === "paid";
  const cancelPending = order?.cancelRequested ?? false;
  const canRequestCancel = (order?.status === "confirmed" || order?.status === "ship") && !cancelPending;
  // 반려된 후에도 재신청할 수 있게 둔다(연락 없이 막다른 상태가 되지 않도록).
  const canRequestRefund = order?.status === "done" || order?.status === "refund_rejected";
  // 관리자가 이 주문에 한해 열어줬을 때만 손님이 직접 배송지/연락처/입금자명을 고칠 수 있다.
  const canEditDelivery = order ? canEditOrderDelivery(order) : false;
  // 아직 안 열렸지만 배송 시작 전이라 요청하면 열어줄 수 있는 상태 — 요청 방법을 안내한다.
  const canRequestDeliveryEdit = !!order && !canEditDelivery && !order.cancelRequested && DELIVERY_EDITABLE_STATUSES.includes(order.status);

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

  function pickRefundPhoto(file: File | null) {
    setRefundPhotoFile(file);
    setRefundPhotoPreview(file ? URL.createObjectURL(file) : null);
  }

  async function handleSubmitRefundRequest() {
    if (!order) return;
    if (!refundReasonCode) {
      setActionError("반품/환불 사유를 선택해 주세요.");
      return;
    }
    setActionError(null);
    setRequestingRefund(true);
    try {
      const photoUrl = refundPhotoFile ? await uploadRefundPhoto(refundPhotoFile) : undefined;
      await requestRefund(order.id, {
        profileId: profile?.id ?? null,
        guestName,
        guestPin,
        reason: refundReasonCode,
        reasonDetail: refundDetail.trim() || undefined,
        photoUrl,
      });
      setRefundFormOpen(false);
      setRefundReasonCode("");
      setRefundDetail("");
      pickRefundPhoto(null);
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
        {order === null && (
          <div className="text-sm text-text-muted">
            <p className="mb-3">주문을 찾을 수 없어요. 회원은 로그인하고, 비회원은 이름과 확인번호로 다시 조회해 주세요.</p>
            <Link href="/orders" className="inline-block rounded-[10px] bg-accent px-4 py-2.5 text-[13px] font-bold text-white">
              내 주문 조회하기
            </Link>
          </div>
        )}
        {order && (
          <>
            {/* 체크아웃 직후 — 비회원은 확인번호가 URL에 안 남으니(탭을 닫으면 다시
                조회해야 함) 이름+확인번호를 여기서 한 번 크게 보여주고 기억하게 한다. */}
            {justOrdered && (
              <div className="mb-4 rounded-[12px] border-2 border-accent bg-accent-soft p-3.5">
                <p className="text-[15px] font-extrabold text-accent-dark">✅ 주문이 접수됐어요!</p>
                <p className="mt-1 text-[12.5px]">
                  {order.paymentMethod === "bank_transfer" ? "아래 계좌로 입금해 주시면 확인 후 순서대로 진행돼요." : "확인 후 순서대로 진행돼요."}
                </p>
                {!profile && guestName && guestPin && (
                  <div className="mt-2.5 rounded-[9px] bg-bg-card p-2.5 text-[12.5px]">
                    <p className="font-bold">나중에 주문 확인할 때 필요해요 (캡처해 두세요 📸)</p>
                    <p className="mt-1">
                      이름 <strong>{guestName}</strong> · 확인번호 <strong className="tracking-widest">{guestPin}</strong>
                    </p>
                    <p className="mt-1 text-[11.5px] text-text-muted">아래 &lsquo;내 주문&rsquo; 메뉴에서 이 이름과 확인번호로 언제든 조회할 수 있어요.</p>
                  </div>
                )}
              </div>
            )}
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
              {event?.notice && <p className="mb-1 rounded-[8px] bg-bg-sunken px-2.5 py-1.5 text-[12px] whitespace-pre-line">📢 {event.notice}</p>}
              <p className="mb-1">
                <span className="text-text-muted">받는 분</span> {order.recipientName} ({order.recipientPhone})
              </p>
              <p className="mb-1">
                <span className="text-text-muted">배송지</span> {order.addressSnapshot}
              </p>
              <p>
                <span className="text-text-muted">결제 방법</span> {PAYMENT_METHOD_LABEL[order.paymentMethod]}
              </p>
              {order.paymentMethod === "bank_transfer" && (
                <p className="mt-1">
                  <span className="text-text-muted">입금자명</span> {order.depositorName ?? `${order.recipientName} (받는 분과 같음)`}
                </p>
              )}
              {canEditDelivery && !editingDelivery && (
                <button
                  type="button"
                  onClick={() => setEditingDelivery(true)}
                  className="mt-2.5 w-full rounded-[9px] border border-accent py-2 text-[12.5px] font-bold text-accent-dark"
                >
                  배송지 · 연락처 수정하기
                </button>
              )}
              {canRequestDeliveryEdit && (
                <p className="mt-2 text-[11.5px] text-text-muted">배송지·연락처 변경이 필요하면 아래 &lsquo;문의하기&rsquo;로 요청해 주세요. 확인 후 수정할 수 있게 열어드려요.</p>
              )}
            </div>

            {canEditDelivery && editingDelivery && event && (
              <EditDeliveryForm
                order={order}
                needsEntranceMethod={event.type !== "PARCEL"}
                onCancel={() => setEditingDelivery(false)}
                onSave={async (patch) => {
                  await updateOrderDelivery(order.id, patch, { guestName, guestPin });
                  setEditingDelivery(false);
                  refresh();
                }}
              />
            )}

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
            {/* 거절 사유는 알림뿐 아니라 여기서도 계속 보여준다(알림을 못 봤을 수 있어서). */}
            {!cancelPending && order.status !== "cancelled" && order.cancelRejectReason && (
              <div className="mb-4 rounded-[10px] bg-bg-sunken p-3 text-[12.5px] text-text-muted">
                <p className="font-semibold text-red-600">취소 요청이 거절됐어요.</p>
                <p className="mt-1">사유: {order.cancelRejectReason}</p>
              </div>
            )}
            {canRequestRefund && !refundFormOpen && (
              <button
                onClick={() => setRefundFormOpen(true)}
                className="mb-4 w-full rounded-[10px] border border-border py-2.5 text-[13px] font-semibold"
              >
                {order.status === "refund_rejected" ? "반품/환불 다시 신청" : "반품/환불 신청"}
              </button>
            )}
            {canRequestRefund && refundFormOpen && (
              <div className="mb-4 rounded-[10px] border border-border p-3">
                <p className="mb-2 text-[12.5px] font-bold">반품/환불 신청</p>
                <p className="mb-1.5 text-[11.5px] font-semibold text-text-muted">사유 선택</p>
                <div className="mb-3 flex flex-wrap gap-1.5">
                  {(Object.entries(REFUND_REASON_LABEL) as [RefundReasonCode, string][]).map(([code, label]) => (
                    <button
                      key={code}
                      type="button"
                      onClick={() => setRefundReasonCode(code)}
                      className={`rounded-full border px-3 py-1.5 text-[12px] font-semibold ${
                        refundReasonCode === code ? "border-accent bg-accent text-white" : "border-border text-text-muted"
                      }`}
                    >
                      {label}
                    </button>
                  ))}
                </div>
                <textarea
                  value={refundDetail}
                  onChange={(e) => setRefundDetail(e.target.value)}
                  placeholder="자세한 사유를 직접 입력할 수 있어요 (선택)"
                  rows={3}
                  className="mb-3 w-full rounded-[8px] border border-border bg-bg-card px-2.5 py-2 text-[12.5px]"
                />
                <p className="mb-1.5 text-[11.5px] font-semibold text-text-muted">사진 첨부 (선택)</p>
                <div className="mb-3 flex items-center gap-2">
                  {refundPhotoPreview ? (
                    // eslint-disable-next-line @next/next/no-img-element -- 로컬 미리보기(object URL)
                    <img src={refundPhotoPreview} alt="첨부 사진" className="h-16 w-16 rounded-[8px] object-cover" />
                  ) : (
                    <label className="flex h-16 w-16 cursor-pointer items-center justify-center rounded-[8px] border border-dashed border-border text-[11px] text-text-muted">
                      + 사진
                      <input type="file" accept="image/*" className="hidden" onChange={(e) => pickRefundPhoto(e.target.files?.[0] ?? null)} />
                    </label>
                  )}
                  {refundPhotoPreview && (
                    <button type="button" onClick={() => pickRefundPhoto(null)} className="text-[11.5px] font-semibold text-text-muted">
                      제거
                    </button>
                  )}
                </div>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      setRefundFormOpen(false);
                      setActionError(null);
                    }}
                    className="flex-1 rounded-[9px] border border-border py-2 text-[12.5px] font-semibold text-text-muted"
                  >
                    취소
                  </button>
                  <button
                    type="button"
                    onClick={handleSubmitRefundRequest}
                    disabled={requestingRefund}
                    className="flex-1 rounded-[9px] bg-accent py-2 text-[12.5px] font-bold text-white disabled:opacity-50"
                  >
                    {requestingRefund ? "신청 처리 중..." : "신청하기"}
                  </button>
                </div>
              </div>
            )}
            {order.status === "refund_requested" && (
              <div className="mb-4 rounded-[10px] bg-bg-sunken p-3 text-[12.5px] text-text-muted">
                <p className="font-semibold">반품/환불 신청이 접수됐어요. 확인 후 처리해드릴게요.</p>
                {order.refundReason && <p className="mt-1">사유: {REFUND_REASON_LABEL[order.refundReason]}</p>}
                {order.refundReasonDetail && <p className="mt-0.5">{order.refundReasonDetail}</p>}
                {order.refundPhotoUrl && (
                  // eslint-disable-next-line @next/next/no-img-element -- source domain unknown ahead of time
                  <img src={order.refundPhotoUrl} alt="첨부 사진" className="mt-2 h-16 w-16 rounded-[8px] object-cover" />
                )}
              </div>
            )}
            {order.status === "refund_rejected" && (
              <div className="mb-4 rounded-[10px] bg-bg-sunken p-3 text-[12.5px] text-text-muted">
                <p className="font-semibold text-red-600">반품/환불 신청이 반려됐어요.</p>
                {order.refundRejectReason && <p className="mt-1">사유: {order.refundRejectReason}</p>}
              </div>
            )}
            {order.status === "refunded" && (
              <p className="mb-4 rounded-[10px] bg-bg-sunken p-3 text-[12.5px] font-semibold text-text-muted">환불이 완료됐어요.</p>
            )}

            <SupportLinks />

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
              {order.items.map((item, i) => (
                <div key={`${item.productId}-${i}`} className="flex items-center gap-3">
                  <div className="flex h-[44px] w-[44px] items-center justify-center rounded-[10px] bg-accent-soft text-xl">{item.productEmoji}</div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[13px]">{item.productName}</p>
                    {item.options && item.options.length > 0 && (
                      <p className="truncate text-[11.5px] text-text-muted">{item.options.map((o) => o.valueName).join(", ")}</p>
                    )}
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

// 주문 후 배송지/연락처/입금자명 수정 폼 — 체크아웃과 같은 AddressFields를 쓰고,
// 같은 필수 항목(이름/전화/주소/상세주소, 문고리·사다드림은 공동현관 출입방법)을 검사한다.
function EditDeliveryForm({
  order,
  needsEntranceMethod,
  onCancel,
  onSave,
}: {
  order: Order;
  needsEntranceMethod: boolean;
  onCancel: () => void;
  onSave: (patch: Parameters<typeof updateOrderDelivery>[1]) => Promise<void>;
}) {
  const [name, setName] = useState(order.recipientName);
  const [phone, setPhone] = useState(order.recipientPhone);
  const [address, setAddress] = useState<AddressFieldsValue>({
    zonecode: "",
    roadAddress: order.roadAddress ?? "",
    apartmentName: order.apartmentName ?? "",
    detailAddress: order.detailAddress ?? "",
    entranceMethod: order.entranceMethod ?? "",
    memo: order.deliveryMemo ?? "",
  });
  const [depositorName, setDepositorName] = useState(order.depositorName ?? "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function save() {
    if (!name.trim()) return setError("받는 분 이름을 입력해 주세요.");
    if (!phone.trim()) return setError("전화번호를 입력해 주세요.");
    if (!address.roadAddress) return setError("주소검색으로 주소를 입력해 주세요.");
    if (!address.detailAddress.trim()) return setError("상세주소를 입력해 주세요.");
    if (needsEntranceMethod && !address.entranceMethod.trim()) return setError("공동현관 출입방법을 입력해 주세요.");
    setError(null);
    setSaving(true);
    try {
      const entranceMethod = needsEntranceMethod ? address.entranceMethod.trim() : "";
      await onSave({
        recipientName: name.trim(),
        recipientPhone: phone.trim(),
        addressSnapshot: formatAddress({
          roadAddress: address.roadAddress,
          detailAddress: address.detailAddress.trim(),
          entranceMethod: entranceMethod || undefined,
          memo: address.memo.trim() || undefined,
        }),
        roadAddress: address.roadAddress,
        detailAddress: address.detailAddress.trim(),
        entranceMethod,
        deliveryMemo: address.memo.trim(),
        apartmentName: address.apartmentName,
        depositorName: order.paymentMethod === "bank_transfer" ? depositorName.trim() : undefined,
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : (e as { message?: string })?.message ?? "저장 중 오류가 발생했어요.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="mb-4 flex flex-col gap-2 rounded-[10px] border border-accent p-3">
      <p className="text-[12.5px] font-bold">배송지 · 연락처 수정</p>
      <input className="w-full rounded-[9px] border border-border bg-bg-card px-3 py-2.5 text-[13px]" placeholder="받는 분 이름" value={name} onChange={(e) => setName(e.target.value)} />
      <input className="w-full rounded-[9px] border border-border bg-bg-card px-3 py-2.5 text-[13px]" placeholder="전화번호 (010-0000-0000)" value={phone} onChange={(e) => setPhone(e.target.value)} />
      <AddressFields value={address} onChange={(patch) => setAddress((v) => ({ ...v, ...patch }))} showEntranceMethod={needsEntranceMethod} />
      {order.paymentMethod === "bank_transfer" && (
        <input
          className="w-full rounded-[9px] border border-border bg-bg-card px-3 py-2.5 text-[13px]"
          placeholder="입금자명 (받는 분과 다른 이름으로 입금하면 입력)"
          value={depositorName}
          onChange={(e) => setDepositorName(e.target.value)}
        />
      )}
      {error && <p className="text-[12px] font-semibold text-red-600">{error}</p>}
      <div className="mt-1 flex gap-2">
        <button type="button" onClick={onCancel} className="flex-1 rounded-[9px] border border-border py-2 text-[12.5px] font-semibold text-text-muted">
          취소
        </button>
        <button type="button" onClick={save} disabled={saving} className="flex-1 rounded-[9px] bg-accent py-2 text-[12.5px] font-bold text-white disabled:opacity-50">
          {saving ? "저장 중..." : "저장"}
        </button>
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
