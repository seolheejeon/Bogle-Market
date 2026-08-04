"use client";

import type { Address, Order, Profile } from "@/types";
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

// 관리자 고객 상세 모달 — 계정 정보 + 기본 배송지 + 주문 통계 + 주문내역을
// 한 화면에서 확인한다. orders는 호출부(admin/customers 목록)가 이미
// listOrdersForProfile로 불러온 배열을 그대로 넘겨줘서 여기서 다시 조회하지
// 않는다.
export function CustomerDetailModal({
  profile,
  address,
  orders,
  onClose,
  onViewOrder,
}: {
  profile: Profile;
  address: Address | null;
  orders: Order[];
  onClose: () => void;
  onViewOrder: (orderId: string) => void;
}) {
  const sortedOrders = [...orders].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  const totalSpent = orders.reduce((sum, o) => sum + o.total, 0);
  const lastOrderAt = sortedOrders[0]?.createdAt ?? null;
  const mapQuery = address ? `${address.roadAddress} ${address.detailAddress}`.trim() : "";

  return (
    <Modal onClose={onClose} wide>
      <div className="mb-3 flex items-center justify-between">
        <div>
          <p className="text-[15px] font-bold">
            {profile.name}
            {profile.isAdmin && " (관리자)"}
          </p>
          <p className="text-[12px] text-text-muted">고객 상세</p>
        </div>
        <button onClick={onClose} className="rounded-[8px] border border-border px-2.5 py-1 text-[12px] font-semibold">
          닫기
        </button>
      </div>

      <Section title="기본 정보">
        <Row label="이름">{profile.name}</Row>
        <Row label="아이디">{profile.username}</Row>
        <Row label="오픈채팅 닉네임">
          <span className="inline-flex items-center gap-1.5">
            {profile.nickname}
            <CopyButton value={profile.nickname} />
          </span>
        </Row>
        <Row label="연락처">
          <span className="inline-flex items-center gap-1.5">
            {profile.phone}
            <CopyButton value={profile.phone} />
          </span>
        </Row>
        <Row label="가입일">{formatDateTime(profile.createdAt)}</Row>
        <Row label="최근 주문일">{lastOrderAt ? formatDateTime(lastOrderAt) : "주문 없음"}</Row>
      </Section>

      <Section title="기본 배송지">
        {address ? (
          <>
            {address.apartmentName && <Row label="건물명">🏢 {address.apartmentName}</Row>}
            <Row label="주소">
              <span className="inline-flex items-center gap-1.5">
                {address.roadAddress}
                <CopyButton value={address.roadAddress} />
              </span>
            </Row>
            <Row label="상세주소">
              <span className="inline-flex items-center gap-1.5">
                {address.detailAddress}
                <CopyButton value={address.detailAddress} />
              </span>
            </Row>
            <Row label="출입방법">{address.entranceMethod || "-"}</Row>
            <Row label="배송메모">{address.memo || "-"}</Row>
            <div className="mt-2 flex gap-1.5">
              <a href={naverMapSearchUrl(mapQuery)} target="_blank" rel="noreferrer" className="rounded-[7px] border border-border px-2.5 py-1 text-[11.5px] font-semibold">
                네이버지도
              </a>
              <a href={kakaoMapSearchUrl(mapQuery)} target="_blank" rel="noreferrer" className="rounded-[7px] border border-border px-2.5 py-1 text-[11.5px] font-semibold">
                카카오맵
              </a>
            </div>
          </>
        ) : (
          <p className="text-[12.5px] text-text-muted">등록된 배송지가 없어요.</p>
        )}
      </Section>

      <Section title="주문 통계">
        <Row label="총 주문 건수">{orders.length}건</Row>
        <Row label="총 구매 금액">{formatPrice(totalSpent)}</Row>
        <Row label="최근 주문일">{lastOrderAt ? formatDateTime(lastOrderAt) : "-"}</Row>
      </Section>

      <Section title={`주문 내역 (${sortedOrders.length}건)`}>
        {sortedOrders.length === 0 ? (
          <p className="text-[12.5px] text-text-muted">주문 내역이 없어요.</p>
        ) : (
          <div className="flex flex-col gap-1.5">
            {sortedOrders.map((o) => (
              <button
                key={o.id}
                onClick={() => onViewOrder(o.id)}
                className="flex items-center justify-between gap-2 rounded-[8px] border border-border px-2.5 py-2 text-left"
              >
                <div className="min-w-0">
                  <p className="truncate text-[12px] font-semibold">{o.orderNumber}</p>
                  <p className="text-[11px] text-text-muted">{formatDateTime(o.createdAt)}</p>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  <span className="text-[12px] font-bold">{formatPrice(o.total)}</span>
                  <OrderStatusBadge status={o.status} />
                </div>
              </button>
            ))}
          </div>
        )}
      </Section>
    </Modal>
  );
}
