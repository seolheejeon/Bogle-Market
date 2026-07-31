import type { EventType, PaymentMethod } from "@/types";

export const isTossConfigured = Boolean(process.env.NEXT_PUBLIC_TOSS_CLIENT_KEY);

export const PAYMENT_METHODS: { value: PaymentMethod; icon: string; label: string; manual: boolean; help: string }[] = [
  { value: "bank_transfer", icon: "🏦", label: "무통장 입금", manual: true, help: "주문 후 안내되는 계좌로 입금해 주세요. 사장님이 입금을 확인하면 주문상태가 바뀌어요." },
  { value: "card", icon: "💳", label: "카드 결제", manual: !isTossConfigured, help: isTossConfigured ? "카드로 바로 결제돼요." : "결제 연동 준비 중이에요. 지금은 무통장입금처럼 사장님이 직접 확인 후 처리해요." },
  { value: "kakaopay", icon: "💛", label: "카카오페이", manual: !isTossConfigured, help: isTossConfigured ? "카카오페이로 바로 결제돼요." : "결제 연동 준비 중이에요. 지금은 무통장입금처럼 사장님이 직접 확인 후 처리해요." },
  { value: "incheon_eum", icon: "🪙", label: "인천 이음카드", manual: true, help: "인천e음 앱에서 결제 후 사장님께 알려주세요. 확인되면 주문상태가 바뀌어요." },
];

// 사다드림(GROUP_BUY)은 은행 계좌로만 직접 입금받는 운영 방식이라 카드/카카오페이/
// 이음카드 같은 다른 결제수단을 아예 받지 않는다 — 무통장입금만 허용. 문고리/택배는
// 제한이 없어 4가지 모두 그대로 허용.
export function allowedPaymentMethods(deliveryType: EventType): PaymentMethod[] {
  if (deliveryType === "GROUP_BUY") return ["bank_transfer"];
  return PAYMENT_METHODS.map((m) => m.value);
}
