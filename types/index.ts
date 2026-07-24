export type EventType = "DOOR" | "GROUP_BUY" | "PARCEL";

export type PaymentMethod = "bank_transfer" | "card" | "kakaopay" | "incheon_eum";

export type OrderStatus = "wait" | "paid" | "ship" | "done" | "cancelled";

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
  origin?: string;
  weight?: string;
  storage?: string;
  eat?: string;
  description?: string;
  detailBlocks?: ProductDetailBlock[];
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
  apartment: string;
  dong: string;
  ho: string;
  entranceMethod?: string;
  memo?: string;
  isDefault: boolean;
}

// 아파트명/동/호수 + 선택 항목을 사람이 읽는 한 줄로 합친다 (주문 스냅샷, 관리자 화면 등에 사용).
export function formatAddress(a: Pick<Address, "apartment" | "dong" | "ho" | "entranceMethod" | "memo">): string {
  const parts = [`${a.apartment} ${a.dong}동 ${a.ho}호`];
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
  profileId: string | null;
  guestName: string | null;
  guestPhone: string | null;
  guestPin: string | null;
  addressSnapshot: string;
  recipientName: string;
  recipientPhone: string;
  paymentMethod: PaymentMethod;
  status: OrderStatus;
  items: OrderItem[];
  total: number;
  createdAt: string; // ISO
}

export interface NotificationItem {
  id: string;
  icon: string;
  message: string;
  createdAt: string; // ISO
}

export const PAYMENT_METHOD_LABEL: Record<PaymentMethod, string> = {
  bank_transfer: "무통장 입금",
  card: "카드 결제",
  kakaopay: "카카오페이",
  incheon_eum: "인천 이음카드",
};

export const ORDER_STATUS_LABEL: Record<OrderStatus, string> = {
  wait: "입금대기",
  paid: "입금완료",
  ship: "배송중",
  done: "배송완료",
  cancelled: "취소",
};

export const EVENT_TYPE_LABEL: Record<EventType, string> = {
  DOOR: "문고리배송",
  GROUP_BUY: "사다드림",
  PARCEL: "택배",
};
