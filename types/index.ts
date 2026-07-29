export type EventType = "DOOR" | "GROUP_BUY" | "PARCEL";

export type PaymentMethod = "bank_transfer" | "card" | "kakaopay" | "incheon_eum";

export type OrderStatus = "wait" | "paid" | "confirmed" | "ship" | "done" | "refund_requested" | "refunded" | "cancelled";

// The product detail page's long-form "상세설명" content, rendered top to
// bottom in order — mirrors the shape a future admin editor would write
// (and a future `products.detail_blocks` jsonb column would store), so
// swapping the dummy data for real admin-authored content later only means
// changing where this array comes from, not how it's rendered.
export type ProductDetailBlock =
  | { type: "heading"; text: string }
  | { type: "text"; text: string }
  | { type: "image"; url: string; alt?: string };

export interface Product {
  id: string;
  eventId: string;
  name: string;
  price: number;
  emoji: string;
  photos?: string[];
  // Overrides the parent event's delivery type when set — undefined means
  // "inherit the event's type" (the common case).
  deliveryType?: EventType;
  origin?: string;
  weight?: string;
  storage?: string;
  eat?: string;
  description?: string;
  detailBlocks?: ProductDetailBlock[];
  // undefined = 재고 제한 없음(상시 판매). 정해두면 그 수량만큼만 주문 가능하고,
  // 0이 되면 품절 처리된다.
  stock?: number;
  // false면 고객 화면(그리드/이벤트 상세 등)에서 숨김 — 상품은 남겨두되 잠시
  // 판매만 중단하고 싶을 때(예: 다음 회차 준비 중) 삭제 없이 끄는 용도.
  visible?: boolean;
}

export interface MarketEvent {
  id: string;
  type: EventType;
  title: string;
  isFlash?: boolean;
  deadlineAt: string; // ISO
  deliveryAt: string; // ISO
  notice: string;
  products: Product[];
}

export interface Address {
  id: string;
  profileId: string | null;
  name: string;
  phone: string;
  zonecode: string;
  roadAddress: string;
  // Daum 주소검색 결과가 공동주택일 때만 채워짐(단독주택 등은 빈 문자열).
  // 사용자가 직접 입력하는 값이 아니라 검색 결과에서 추출한 값 — 관리자가
  // 아파트 단지별로 필터링/일괄 배송처리를 할 수 있도록 별도 컬럼으로 둔다.
  apartmentName: string;
  detailAddress: string;
  entranceMethod?: string;
  memo?: string;
  isDefault: boolean;
}

// 도로명주소/상세주소 + 선택 항목을 사람이 읽는 한 줄로 합친다 (주문 스냅샷, 관리자 화면 등에 사용).
export function formatAddress(a: Pick<Address, "roadAddress" | "detailAddress" | "entranceMethod" | "memo">): string {
  const parts = [`${a.roadAddress} ${a.detailAddress}`.trim()];
  if (a.entranceMethod) parts.push(`출입방법: ${a.entranceMethod}`);
  if (a.memo) parts.push(`배송메모: ${a.memo}`);
  return parts.join(" · ");
}

export interface Profile {
  id: string;
  username: string;
  nickname: string;
  phone: string;
  isAdmin: boolean;
}

export interface OrderItem {
  productId: string;
  productName: string;
  productEmoji: string;
  price: number;
  quantity: number;
}

export interface Order {
  id: string;
  orderNumber: string;
  // 주문은 정확히 하나의 이벤트에만 속한다 — 장바구니에 여러 이벤트 상품이
  // 섞여 있으면 체크아웃이 이벤트별로 주문을 나눠서 만든다.
  eventId: string;
  // 한 번의 체크아웃(결제)에서 함께 생성된 주문들을 묶는 키. 이벤트가 하나뿐인
  // 보통의 체크아웃도 자기 자신만 담긴 배치로 취급된다.
  batchId: string;
  profileId: string | null;
  guestName: string | null;
  guestPhone: string | null;
  guestPin: string | null;
  addressSnapshot: string;
  // 주문 시점 배송지의 아파트명 스냅샷(없으면 null) — 관리자가 아파트 단지별로
  // 주문을 필터링/일괄 배송처리할 때 쓴다. addressSnapshot과 마찬가지로
  // 주문 이후 회원이 배송지를 바꿔도 이 값은 그대로 남는다.
  apartmentName: string | null;
  recipientName: string;
  recipientPhone: string;
  paymentMethod: PaymentMethod;
  status: OrderStatus;
  // 발주확인(confirmed) 이후 고객이 취소를 "요청"하면 true — 상태 자체는 그대로
  // 두고(배송 준비는 계속 진행) 이 플래그만 세워서, 관리자가 승인(취소 처리)
  // 하거나 거절(사유와 함께 알림)할 때까지 대기시킨다. wait/paid 단계의 셀프
  // 취소는 이 플래그 없이 바로 status를 cancelled로 바꾼다(cancelOrder()).
  cancelRequested: boolean;
  // 고객이 취소 요청 시 남긴 사유(선택) — 관리자가 승인/거절을 판단할 때 참고.
  cancelReason: string | null;
  items: OrderItem[];
  total: number;
  createdAt: string; // ISO
}

// PRODUCT/EVENT/ORDER carry linkId to the matching detail page; NONE is a
// plain announcement with nothing to navigate to.
export type NotificationLinkType = "PRODUCT" | "EVENT" | "ORDER" | "NONE";

export interface NotificationItem {
  id: string;
  icon: string;
  title: string;
  message: string;
  linkType: NotificationLinkType;
  linkId?: string;
  // null = broadcast to everyone (admin announcements); set = only that
  // member sees it (e.g. their own order shipped).
  profileId: string | null;
  createdAt: string; // ISO
}

export const NOTIFICATION_LINK_LABEL: Record<NotificationLinkType, string> = {
  PRODUCT: "상품",
  EVENT: "이벤트",
  ORDER: "주문",
  NONE: "없음",
};

export const PAYMENT_METHOD_LABEL: Record<PaymentMethod, string> = {
  bank_transfer: "무통장 입금",
  card: "카드 결제",
  kakaopay: "카카오페이",
  incheon_eum: "인천 이음카드",
};

export const ORDER_STATUS_LABEL: Record<OrderStatus, string> = {
  wait: "입금대기",
  paid: "입금완료",
  confirmed: "발주확인",
  ship: "배송중",
  done: "배송완료",
  refund_requested: "반품/환불 신청",
  refunded: "환불완료",
  cancelled: "취소",
};

export const EVENT_TYPE_LABEL: Record<EventType, string> = {
  DOOR: "문고리배송",
  GROUP_BUY: "사다드림",
  PARCEL: "택배",
};

// 무통장입금 안내용 계좌 정보. 매장 전체에 하나만 존재하는 설정값(싱글턴)이라
// 관리자만 수정할 수 있고, 체크아웃/주문상세에서 손님에게 그대로 노출된다.
export interface StoreSettings {
  bankName: string;
  accountNumber: string;
  accountHolder: string;
}

export const EMPTY_STORE_SETTINGS: StoreSettings = { bankName: "", accountNumber: "", accountHolder: "" };

export function hasBankAccountInfo(settings: StoreSettings): boolean {
  return Boolean(settings.bankName.trim() && settings.accountNumber.trim() && settings.accountHolder.trim());
}
