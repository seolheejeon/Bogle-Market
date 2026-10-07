// 상품 할인 정책 계산 — 상품(카탈로그) 단위로 정책을 관리한다(이벤트/리스팅
// 단위가 아님, lib/shipping.ts와 동일한 성격). 같은 카탈로그 상품이 장바구니/
// 주문 안에서 옵션 조합이 다른 여러 줄로 나뉘어 있어도, 할인은 그 상품에 담은
// 총 수량 기준으로 한 번만 계산된다(최소구매수량 합산과 동일한 이유 — 조합
// 하나하나가 아니라 상품 전체 수량이 정책의 기준). 정책은 상품당 하나만
// 설정할 수 있다(types/index.ts의 ProductDiscount 참고):
// - "qty_threshold": 총 수량이 minQty 이상이면 총액에서 amountOff 정액 할인
// - "qty_tiers": qty_threshold의 여러 구간 버전 — 넘긴 구간 중 가장 큰 할인 하나만
// - "per_unit": 수량과 무관하게 개당 amountOff 할인
// - "n_plus_1": buyQty개 살 때마다 1개를 무료로(할인액 = 무료 개수 × 평균 단가)
// - "bundle": bundleQty개 묶음마다 정가 대신 bundlePrice로(할인액 = 묶음 수 ×
//   (정가 묶음가 - bundlePrice), 나머지 단품은 할인 없음)

import type { EventComboDiscount, Product, ProductDiscount } from "@/types";
import { formatPrice } from "@/lib/format";

type QtyTier = Extract<ProductDiscount, { type: "qty_tiers" }>["tiers"][number];

export function sortedTiers(tiers: QtyTier[]): QtyTier[] {
  return [...tiers].sort((a, b) => a.minQty - b.minQty);
}

export function describeDiscount(discount: ProductDiscount): string {
  switch (discount.type) {
    case "qty_threshold":
      return `${discount.minQty}개 이상 구매 시 ${formatPrice(discount.amountOff)} 할인`;
    case "qty_tiers": {
      const tiers = sortedTiers(discount.tiers);
      if (tiers.length === 1) return `${tiers[0].minQty}개 이상 구매 시 ${formatPrice(tiers[0].amountOff)} 할인`;
      return tiers.map((t) => `${t.minQty}개 ${formatPrice(t.amountOff)}`).join(" · ") + " 할인";
    }
    case "per_unit":
      return `개당 ${formatPrice(discount.amountOff)} 할인`;
    case "n_plus_1":
      return `${discount.buyQty}개 사면 1개 무료`;
    case "bundle":
      return `${discount.bundleQty}개 묶음 ${formatPrice(discount.bundlePrice)}`;
  }
}

// qty개를 unitPrice(정가, 옵션 추가금 포함 평균 단가)로 샀을 때 할인 금액(원).
// 항상 0 이상, 그리고 정가 총액(qty * unitPrice)을 넘지 않도록 클램프한다.
export function calculateDiscount(discount: ProductDiscount | undefined, qty: number, unitPrice: number): number {
  if (!discount || qty <= 0 || unitPrice <= 0) return 0;
  const fullTotal = qty * unitPrice;
  let raw = 0;
  switch (discount.type) {
    case "qty_threshold":
      raw = qty >= discount.minQty ? discount.amountOff : 0;
      break;
    case "qty_tiers":
      raw = Math.max(0, ...discount.tiers.filter((t) => qty >= t.minQty).map((t) => t.amountOff));
      break;
    case "per_unit":
      raw = discount.amountOff * qty;
      break;
    case "n_plus_1": {
      const groupSize = discount.buyQty + 1;
      const freeUnits = Math.floor(qty / groupSize);
      raw = freeUnits * unitPrice;
      break;
    }
    case "bundle": {
      const bundles = Math.floor(qty / discount.bundleQty);
      const savingsPerBundle = discount.bundleQty * unitPrice - discount.bundlePrice;
      raw = bundles * Math.max(savingsPerBundle, 0);
      break;
    }
  }
  return Math.min(Math.max(raw, 0), fullTotal);
}

export interface DiscountLineItem {
  product: Pick<Product, "catalogProductId" | "name" | "discount">;
  lineTotal: number;
  qty: number;
}

export interface DiscountGroup {
  catalogProductId: string;
  name: string;
  qty: number;
  amount: number;
}

// 여러 장바구니/주문 줄을 카탈로그 상품 단위로 묶어서 상품별 할인액을 계산한다.
// 단가는 그 상품에 담긴 줄들의 평균 단가(subtotal / qty)를 쓴다 — 옵션 추가금이
// 조합마다 달라도 n_plus_1/bundle처럼 "1개 값"이 필요한 정책에 합리적인 근사치.
export function groupDiscounts(items: DiscountLineItem[]): DiscountGroup[] {
  const groups = new Map<string, DiscountGroup & { subtotal: number }>();
  for (const item of items) {
    const key = item.product.catalogProductId;
    const g = groups.get(key) ?? { catalogProductId: key, name: item.product.name, qty: 0, amount: 0, subtotal: 0 };
    g.qty += item.qty;
    g.subtotal += item.lineTotal;
    groups.set(key, g);
  }
  for (const [key, g] of groups) {
    const rep = items.find((i) => i.product.catalogProductId === key)!.product;
    const unitPrice = g.qty > 0 ? g.subtotal / g.qty : 0;
    g.amount = calculateDiscount(rep.discount, g.qty, unitPrice);
  }
  return Array.from(groups.values()).filter((g) => g.amount > 0);
}

export function totalDiscount(items: DiscountLineItem[]): number {
  return groupDiscounts(items).reduce((sum, g) => sum + g.amount, 0);
}

// ---------- 함께 구매 할인 (이벤트 단위) ----------
// 같은 회차(=주문 하나)에 담긴 상품들을 카탈로그 상품별 수량으로 합친 뒤,
// 이벤트의 comboDiscounts 규칙마다 "모든 상품이 필요한 수량 이상인지" 본다.
// 채워진 규칙은 주문당 한 번씩 amountOff를 깎고(세트를 두 번 채워도 한 번),
// 상품별 수량 할인과 별개로 더해진다. 하나라도 담았지만 덜 채운 규칙은
// "OO 1개 더 담으면 1,000원 추가 할인" 안내용으로 따로 돌려준다.

export interface ComboLine {
  catalogProductId: string;
  qty: number;
}

export interface ComboResult {
  applied: { combo: EventComboDiscount; amount: number }[];
  hints: { combo: EventComboDiscount; missing: { catalogProductId: string; qty: number }[] }[];
  total: number;
}

export function calculateComboDiscounts(combos: EventComboDiscount[] | undefined, lines: ComboLine[]): ComboResult {
  const result: ComboResult = { applied: [], hints: [], total: 0 };
  if (!combos || combos.length === 0) return result;
  const have = new Map<string, number>();
  for (const l of lines) have.set(l.catalogProductId, (have.get(l.catalogProductId) ?? 0) + l.qty);
  for (const combo of combos) {
    if (combo.items.length === 0 || combo.amountOff <= 0) continue;
    const missing = combo.items
      .map((it) => ({ catalogProductId: it.catalogProductId, qty: it.qty - (have.get(it.catalogProductId) ?? 0) }))
      .filter((m) => m.qty > 0);
    if (missing.length === 0) {
      result.applied.push({ combo, amount: combo.amountOff });
      result.total += combo.amountOff;
    } else if (combo.items.some((it) => (have.get(it.catalogProductId) ?? 0) > 0)) {
      result.hints.push({ combo, missing });
    }
  }
  return result;
}

export function describeCombo(combo: EventComboDiscount, nameOf: (catalogProductId: string) => string): string {
  const parts = combo.items.map((it) => `${nameOf(it.catalogProductId)} ${it.qty}개`).join(" + ");
  return `${parts} 함께 구매 시 ${formatPrice(combo.amountOff)} 추가 할인`;
}

// 장바구니/체크아웃이 한 이벤트(=주문 단위)의 할인 합계를 똑같이 계산하도록
// 묶어둔 것 — 상품별 수량 할인 + 함께 구매 할인, 단 상품 금액 합계를 넘지 않게.
export function eventDiscountTotal(
  combos: EventComboDiscount[] | undefined,
  items: DiscountLineItem[],
): { productDiscount: number; combo: ComboResult; total: number } {
  const productDiscount = totalDiscount(items);
  const combo = calculateComboDiscounts(
    combos,
    items.map((i) => ({ catalogProductId: i.product.catalogProductId, qty: i.qty })),
  );
  const subtotal = items.reduce((sum, i) => sum + i.lineTotal, 0);
  const total = Math.min(productDiscount + combo.total, subtotal);
  return { productDiscount, combo, total };
}
