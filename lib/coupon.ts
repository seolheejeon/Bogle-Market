// 쿠폰 할인 계산 — 결제 화면이 쓰고, 서버(create_order)가 같은 규칙으로 다시 검사한다.
// 장바구니가 회차별로 주문 여러 건으로 나뉠 수 있어서, 쿠폰은 쓸 수 있는 회차 중
// 상품 금액이 가장 큰 주문 한 건에만 적용한다(사다드림만 여는 지금은 보통 한 건).

import type { CouponRule, EventType } from "@/types";
import { EVENT_TYPE_LABEL } from "@/types";
import { formatPrice } from "@/lib/format";

// 상품 금액(subtotal, 다른 할인 전)에 대해 이 쿠폰이 깎아줄 수 있는 최대 금액.
// 서버 검사(create_order)와 같은 식: 정액은 그 금액, 정률은 내림 + 최대 할인액.
export function couponMaxDiscount(rule: CouponRule, subtotal: number): number {
  if (subtotal < rule.minOrderAmount) return 0;
  if (rule.discountType === "fixed") return Math.min(rule.amount, subtotal);
  const pct = Math.floor((subtotal * rule.amount) / 100);
  return rule.maxDiscount ? Math.min(pct, rule.maxDiscount) : pct;
}

export function describeCoupon(rule: CouponRule): string {
  const amount = rule.discountType === "fixed" ? `${formatPrice(rule.amount)} 할인` : `${rule.amount}% 할인${rule.maxDiscount ? `(최대 ${formatPrice(rule.maxDiscount)})` : ""}`;
  const parts = [amount];
  if (rule.minOrderAmount > 0) parts.push(`${formatPrice(rule.minOrderAmount)} 이상 주문 시`);
  if (rule.deliveryTypes && rule.deliveryTypes.length > 0) parts.push(`${rule.deliveryTypes.map((t) => EVENT_TYPE_LABEL[t]).join("·")} 전용`);
  if (!rule.stackable) parts.push("다른 할인과 중복 불가");
  return parts.join(" · ");
}

export interface CouponGroupInput {
  key: string;
  type: EventType;
  subtotal: number; // 상품 금액(할인 전)
  baseDiscount: number; // 상품 구간 할인 + 여러 품목 할인
}

export type CouponPlan =
  | { ok: true; key: string; couponDiscount: number; groupDiscount: number; replacesBase: boolean }
  | { ok: false; message: string };

// 어느 주문(회차)에 쿠폰을 붙이고 그 주문의 할인 합계가 얼마가 되는지 정한다.
// 중복 불가 쿠폰은 기존 할인 대신 적용되는데, 기존 할인이 더 크면 손님에게
// 손해라 적용하지 않고 이유를 알려준다.
export function planCoupon(rule: CouponRule, groups: CouponGroupInput[]): CouponPlan {
  const allowed = groups.filter((g) => !rule.deliveryTypes || rule.deliveryTypes.length === 0 || rule.deliveryTypes.includes(g.type));
  if (allowed.length === 0) return { ok: false, message: "장바구니 상품에는 쓸 수 없는 쿠폰이에요." };
  const target = [...allowed].sort((a, b) => b.subtotal - a.subtotal)[0];
  if (target.subtotal < rule.minOrderAmount) return { ok: false, message: `${formatPrice(rule.minOrderAmount)} 이상 주문하면 쓸 수 있는 쿠폰이에요.` };
  const max = couponMaxDiscount(rule, target.subtotal);
  if (rule.stackable) {
    const couponDiscount = Math.max(0, Math.min(max, target.subtotal - target.baseDiscount));
    return { ok: true, key: target.key, couponDiscount, groupDiscount: target.baseDiscount + couponDiscount, replacesBase: false };
  }
  if (max <= target.baseDiscount) {
    return { ok: false, message: "다른 할인과 함께 쓸 수 없는 쿠폰인데, 지금 받는 할인이 더 커서 적용하지 않았어요." };
  }
  return { ok: true, key: target.key, couponDiscount: max, groupDiscount: max, replacesBase: true };
}
