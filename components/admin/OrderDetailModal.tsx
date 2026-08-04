"use client";

import type { MarketEvent, Order, Profile } from "@/types";
import { EVENT_TYPE_LABEL, PAYMENT_METHOD_LABEL, ORDER_STATUS_LABEL } from "@/types";
import { formatDateTime, formatPrice } from "@/lib/format";
import { OrderStatusBadge } from "@/components/Badge";
import { Modal } from "@/components/admin/Modal";
import { CopyButton } from "@/components/admin/CopyButton";
import { naverMapSearchUrl, kakaoMapSearchUrl } from "@/lib/maps";

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-3 py-1 text-[12.5px]">
      <span className="shrink-0 text-text-muted">{label}</span>
      <span className="text-right font-semibold">{children}</span>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="mb-3 rounded-[10px] border border-border p-3">
      <p className="mb-1.5 text-[11.5px] font-bold text-text-muted">{title}</p>
      {children}
    </div>
  );
}

// 관리자 주문 상세 모달 — 목록 카드에서 다 못 보여주는 정보를 전부 모아
// 보여준다. 순수 조회용이라 상태 전환 등 액션 버튼은 목록 카드 쪽에 그대로
// 두고 여기서는 중복 구현하지 않는다.
export function OrderDetailModal({
  order,
  event,
  ordererProfile,
  onClose,
  onViewCustomer,
}: {
  order: Order;
  event: MarketEvent | undefined;
  // 회원 주문이면 profileId로 찾은 계정 정보(실명은 여기서만 나옴 — 수령인
  // 이름은 그때그때 바뀔 수 있어 별개). 게스트 주문이면 undefined.
  ordererProfile: Profile | undefined;
  onClose: () => void;
  onViewCustomer?: (profileId: string) => void;
}) {
  const itemsTotal = order.items.reduce((sum, i) => sum + i.price * i.quantity, 0);
  const hasStructuredAddress = Boolean(order.roadAddress);
  const mapQuery = hasStructuredAddress ? `${order.roadAddress} ${order.detailAddress ?? ""}`.trim() : order.addressSnapshot;

  return (
    <Modal onClose={onClose} wide>
      <div className="mb-3 flex items-center justify-between">
        <div>
          <p className="text-[15px] font-bold">주문 상세</p>
          <p className="text-[12px] text-text-muted">{order.orderNumber}</p>
        </div>
        <div className="flex items-center gap-2">
          <OrderStatusBadge status={order.status} />
          <button onClick={onClose} className="rounded-[8px] border border-border px-2.5 py-1 text-[12px] font-semibold">
            닫기
          </button>
        </div>
      </div>

      <Section title="기본 정보">
        <Row label="주문번호">
          <span className="inline-flex items-center gap-1.5">
            {order.orderNumber}
            <CopyButton value={order.orderNumber} />
          </span>
        </Row>
        <Row label="주문일시">{formatDateTime(order.createdAt)}</Row>
        <Row label="주문상태">
          {ORDER_STATUS_LABEL[order.status]}
          {order.cancelRequested && <span className="ml-1.5 text-red-600">(취소 요청)</span>}
        </Row>
        {event && <Row label="배송방식">{EVENT_TYPE_LABEL[event.type]}</Row>}
        {event && <Row label="이벤트명">{event.title}</Row>}
      </Section>

      <Section title={`주문상품 (${order.items.length}개)`}>
        <div className="flex flex-col gap-2">
          {order.items.map((i, idx) => (
            <div key={idx} className="flex items-start justify-between gap-2 text-[12.5px]">
              <div className="min-w-0">
                <p className="truncate font-semibold">{i.productName}</p>
                {i.options && i.options.length > 0 && (
                  <p className="text-[11.5px] text-text-muted">{i.options.map((o) => `${o.groupName}: ${o.valueName}`).join(" · ")}</p>
                )}
                <p className="text-[11.5px] text-text-muted">
                  {formatPrice(i.price)} x {i.quantity}개
                </p>
              </div>
              <span className="shrink-0 font-semibold">{formatPrice(i.price * i.quantity)}</span>
            </div>
          ))}
        </div>
        <div className="mt-2.5 flex flex-col gap-0.5 border-t border-border pt-2 text-[12.5px]">
          <div className="flex justify-between text-text-muted">
            <span>상품 합계</span>
            <span>{formatPrice(itemsTotal)}</span>
          </div>
          {order.shippingFee > 0 && (
            <div className="flex justify-between text-text-muted">
              <span>배송비</span>
              <span>{formatPrice(order.shippingFee)}</span>
            </div>
          )}
          <div className="flex justify-between text-[13.5px] font-bold">
            <span>총 결제금액</span>
            <span>{formatPrice(order.total)}</span>
          </div>
        </div>
      </Section>

      <Section title="주문자">
        {ordererProfile ? (
          <>
            <Row label="이름">
              <span className="inline-flex items-center gap-1.5">
                {ordererProfile.name}
                {onViewCustomer && (
                  <button onClick={() => onViewCustomer(ordererProfile.id)} className="rounded-[6px] border border-accent px-1.5 py-0.5 text-[10.5px] font-semibold text-accent-dark">
                    고객상세
                  </button>
                )}
              </span>
            </Row>
            <Row label="연락처">
              <span className="inline-flex items-center gap-1.5">
                {ordererProfile.phone}
                <CopyButton value={ordererProfile.phone} />
              </span>
            </Row>
          </>
        ) : (
          <>
            <Row label="이름">{order.guestName ?? "비회원"}</Row>
            <Row label="연락처">
              <span className="inline-flex items-center gap-1.5">
                {order.guestPhone}
                <CopyButton value={order.guestPhone} />
              </span>
            </Row>
          </>
        )}
      </Section>

      <Section title="수령인">
        <Row label="이름">{order.recipientName}</Row>
        <Row label="연락처">
          <span className="inline-flex items-center gap-1.5">
            {order.recipientPhone}
            <CopyButton value={order.recipientPhone} />
          </span>
        </Row>
      </Section>

      <Section title="배송지">
        {order.apartmentName && <Row label="건물명">🏢 {order.apartmentName}</Row>}
        {hasStructuredAddress ? (
          <>
            <Row label="주소">
              <span className="inline-flex items-center gap-1.5">
                {order.roadAddress}
                <CopyButton value={order.roadAddress} />
              </span>
            </Row>
            <Row label="상세주소">
              <span className="inline-flex items-center gap-1.5">
                {order.detailAddress || "-"}
                <CopyButton value={order.detailAddress} />
              </span>
            </Row>
            <Row label="출입방법">{order.entranceMethod || "-"}</Row>
            <Row label="배송메모">{order.deliveryMemo || "-"}</Row>
          </>
        ) : (
          <Row label="주소">
            <span className="inline-flex items-center gap-1.5">
              {order.addressSnapshot}
              <CopyButton value={order.addressSnapshot} />
            </span>
          </Row>
        )}
        <div className="mt-2 flex gap-1.5">
          <a href={naverMapSearchUrl(mapQuery)} target="_blank" rel="noreferrer" className="rounded-[7px] border border-border px-2.5 py-1 text-[11.5px] font-semibold">
            네이버지도
          </a>
          <a href={kakaoMapSearchUrl(mapQuery)} target="_blank" rel="noreferrer" className="rounded-[7px] border border-border px-2.5 py-1 text-[11.5px] font-semibold">
            카카오맵
          </a>
        </div>
      </Section>

      <Section title="결제">
        <Row label="결제수단">{PAYMENT_METHOD_LABEL[order.paymentMethod]}</Row>
        {order.courierCode && order.trackingNumber && <Row label="송장번호">{order.trackingNumber}</Row>}
        {order.cancelRequested && order.cancelReason && <Row label="취소 사유">{order.cancelReason}</Row>}
      </Section>
    </Modal>
  );
}
