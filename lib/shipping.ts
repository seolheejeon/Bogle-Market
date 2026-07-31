// 택배 배송비 계산 — 상품(카탈로그) 단위로 정책을 관리한다(이벤트/리스팅
// 단위가 아님). 같은 카탈로그 상품이 장바구니/주문 안에서 옵션 조합이 다른
// 여러 줄로 나뉘어 있어도, 그 상품의 배송비는 딱 한 번만(정책에 맞게) 계산된다
// — 물리적으로 같은 판매자에게서 오는 한 건의 배송이기 때문. 정책은 상품마다
// 다를 수 있다(shippingFeeType, types/index.ts 참고):
// - "fixed": 항상 shippingFee 고정 부과
// - "free_threshold": 이 상품의 소계가 freeShippingThreshold 이상이면 0원
// - "per_quantity": 이 상품의 총 수량을 shippingFeeQtyUnit으로 나눈 만큼(올림)
//   shippingFee를 반복 부과 — 예: 5개마다 4,000원이면 12개 주문 시 3배(ceil(12/5))

import type { Product } from "@/types";

type ShippingPolicyFields = Pick<Product, "shippingFee" | "shippingFeeType" | "freeShippingThreshold" | "shippingFeeQtyUnit">;

export interface ShippingLineItem {
  product: Pick<Product, "catalogProductId" | "name"> & ShippingPolicyFields;
  lineTotal: number;
  qty: number;
}

export interface ShippingGroup {
  catalogProductId: string;
  name: string;
  subtotal: number;
  qty: number;
  fee: number;
}

// 상품 하나의 배송비 — 정책(shippingFeeType)에 따라 subtotal 또는 qty를 본다.
export function shippingFeeForProduct(product: ShippingPolicyFields, subtotal: number, qty: number): number {
  const fee = product.shippingFee ?? 0;
  const type = product.shippingFeeType ?? "fixed";
  if (type === "free_threshold") {
    const threshold = product.freeShippingThreshold ?? 0;
    if (threshold > 0 && subtotal >= threshold) return 0;
    return fee;
  }
  if (type === "per_quantity") {
    const unit = product.shippingFeeQtyUnit ?? 1;
    if (qty <= 0) return 0;
    return Math.ceil(qty / unit) * fee;
  }
  return fee;
}

// 여러 장바구니/주문 줄을 카탈로그 상품 단위로 묶어서 상품별 배송비를 계산한다.
// 호출부는 이미 "택배로 배송되는 줄"만 걸러서 넘겨야 한다(문고리/사다드림은
// 배송비가 없음).
export function groupShippingFees(items: ShippingLineItem[]): ShippingGroup[] {
  const groups = new Map<string, ShippingGroup>();
  for (const item of items) {
    const key = item.product.catalogProductId;
    const g = groups.get(key) ?? { catalogProductId: key, name: item.product.name, subtotal: 0, qty: 0, fee: 0 };
    g.subtotal += item.lineTotal;
    g.qty += item.qty;
    groups.set(key, g);
  }
  for (const [key, g] of groups) {
    const rep = items.find((i) => i.product.catalogProductId === key)!.product;
    g.fee = shippingFeeForProduct(rep, g.subtotal, g.qty);
  }
  return Array.from(groups.values());
}

export function totalShippingFee(items: ShippingLineItem[]): number {
  return groupShippingFees(items).reduce((sum, g) => sum + g.fee, 0);
}
