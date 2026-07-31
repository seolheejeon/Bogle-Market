// 택배 배송비 계산 — 상품(카탈로그) 단위로 정책을 관리한다(이벤트/리스팅
// 단위가 아님). 같은 카탈로그 상품이 장바구니/주문 안에서 옵션 조합이 다른
// 여러 줄로 나뉘어 있어도, 그 상품의 배송비는 딱 한 번만 부과된다 — 물리적으로
// 같은 판매자에게서 오는 한 건의 배송이기 때문. 무료배송 기준 금액은
// "이 상품의 장바구니/주문 내 소계"를 기준으로 판단한다(전체 주문 금액이
// 아니라 그 상품 자신의 판매 금액 합계).

import type { Product } from "@/types";

export interface ShippingLineItem {
  product: Pick<Product, "catalogProductId" | "name" | "shippingFee" | "freeShippingThreshold">;
  lineTotal: number;
}

export interface ShippingGroup {
  catalogProductId: string;
  name: string;
  subtotal: number;
  fee: number;
}

// 상품 하나의 배송비 — 무료배송 기준(0보다 큼)을 그 상품 소계가 넘으면 0원.
export function shippingFeeForProduct(product: Pick<Product, "shippingFee" | "freeShippingThreshold">, subtotal: number): number {
  const fee = product.shippingFee ?? 0;
  const threshold = product.freeShippingThreshold ?? 0;
  if (threshold > 0 && subtotal >= threshold) return 0;
  return fee;
}

// 여러 장바구니/주문 줄을 카탈로그 상품 단위로 묶어서 상품별 배송비를 계산한다.
// 호출부는 이미 "택배로 배송되는 줄"만 걸러서 넘겨야 한다(문고리/사다드림은
// 배송비가 없음).
export function groupShippingFees(items: ShippingLineItem[]): ShippingGroup[] {
  const groups = new Map<string, ShippingGroup>();
  for (const item of items) {
    const key = item.product.catalogProductId;
    const g = groups.get(key) ?? { catalogProductId: key, name: item.product.name, subtotal: 0, fee: 0 };
    g.subtotal += item.lineTotal;
    groups.set(key, g);
  }
  for (const [key, g] of groups) {
    const rep = items.find((i) => i.product.catalogProductId === key)!.product;
    g.fee = shippingFeeForProduct(rep, g.subtotal);
  }
  return Array.from(groups.values());
}

export function totalShippingFee(items: ShippingLineItem[]): number {
  return groupShippingFees(items).reduce((sum, g) => sum + g.fee, 0);
}
