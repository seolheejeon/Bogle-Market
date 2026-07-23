export type EventType = "DOOR" | "GROUP_BUY" | "PARCEL";

export type PaymentMethod = "bank_transfer" | "card" | "kakaopay" | "incheon_eum";

export type OrderStatus = "wait" | "paid" | "ship" | "done" | "cancelled";

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
  address: string;
  isDefault: boolean;
}

export interface Profile {
  id: string;
  email: string;
  name: string;
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
