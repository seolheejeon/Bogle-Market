// 상품 옵션(색상/사이즈/중량/추가옵션 등) 관련 순수 계산 헬퍼 — 장바구니,
// 상품 상세, 체크아웃, 주문 스냅샷이 전부 같은 규칙으로 가격/재고/선택
// 완료 여부를 계산하도록 여기 한 곳에 모아둔다.

import type { Product, OrderItemOption } from "@/types";

// required 그룹이 하나라도 있으면 true — 그리드/목록에서 옵션 선택 없이
// 바로 담을 수 없고 상품 상세로 보내야 한다는 뜻(색상/사이즈처럼 반드시
// 골라야 하는 옵션). optional-only(추가옵션 등) 상품은 옵션 없이도 담을 수
// 있어 여기 해당하지 않는다.
export function hasRequiredOptions(product: Pick<Product, "optionGroups">): boolean {
  return (product.optionGroups ?? []).some((g) => g.required);
}

// 선택된 옵션값 id들의 price_delta 합.
export function optionPriceDelta(product: Pick<Product, "optionGroups">, optionValueIds: string[]): number {
  if (optionValueIds.length === 0) return 0;
  const idSet = new Set(optionValueIds);
  let sum = 0;
  for (const g of product.optionGroups ?? []) {
    for (const v of g.values) {
      if (idSet.has(v.id)) sum += v.priceDelta;
    }
  }
  return sum;
}

// 옵션이 반영된 최종 단가.
export function unitPrice(product: Pick<Product, "price" | "optionGroups">, optionValueIds: string[]): number {
  return product.price + optionPriceDelta(product, optionValueIds);
}

// required 그룹마다 최소 1개, multi=false 그룹은 최대 1개를 골랐는지 확인 —
// 통과하면 null, 문제가 있으면 사용자에게 보여줄 메시지를 반환한다.
export function validateOptionSelection(product: Pick<Product, "optionGroups">, optionValueIds: string[]): string | null {
  const idSet = new Set(optionValueIds);
  for (const g of product.optionGroups ?? []) {
    const selectedInGroup = g.values.filter((v) => idSet.has(v.id));
    if (g.required && selectedInGroup.length === 0) return `${g.name}을(를) 선택해 주세요.`;
    if (!g.multi && selectedInGroup.length > 1) return `${g.name}은(는) 하나만 선택할 수 있어요.`;
  }
  return null;
}

// 주문 저장용 옵션 스냅샷(그룹명/선택값명/가격조정) — 카탈로그가 나중에
// 바뀌어도 과거 주문 표시가 영향받지 않도록 이름/가격을 값 그대로 복사한다.
export function buildOptionSnapshot(product: Pick<Product, "optionGroups">, optionValueIds: string[]): OrderItemOption[] {
  const idSet = new Set(optionValueIds);
  const result: OrderItemOption[] = [];
  for (const g of product.optionGroups ?? []) {
    for (const v of g.values) {
      if (idSet.has(v.id)) result.push({ optionValueId: v.id, groupName: g.name, valueName: v.name, priceDelta: v.priceDelta });
    }
  }
  return result;
}

// 옵션값 id -> 표시용 이름("빨강", "L" 등).
export function optionValueName(product: Pick<Product, "optionGroups">, optionValueId: string): string {
  for (const g of product.optionGroups ?? []) {
    const v = g.values.find((x) => x.id === optionValueId);
    if (v) return v.name;
  }
  return optionValueId;
}

// 선택된 옵션값들을 "색상: 빨강, 사이즈: L" 같은 표시용 문자열로.
export function optionSelectionLabel(product: Pick<Product, "optionGroups">, optionValueIds: string[]): string {
  return optionValueIds.map((id) => optionValueName(product, id)).join(", ");
}

// 옵션값 하나의 남은 재고 — hasStock=false(재고 제한 없음)면 Infinity.
function optionStockFor(product: Pick<Product, "optionGroups">, optionValueId: string): number {
  for (const g of product.optionGroups ?? []) {
    const v = g.values.find((x) => x.id === optionValueId);
    if (v) return v.hasStock ? (v.stock ?? 0) : Infinity;
  }
  return Infinity;
}

// 이 옵션 조합으로 담을 수 있는 최대 수량 — 리스팅 자체 재고(stock)와 선택된
// 각 옵션값의 재고 중 가장 작은 값(전부 만족해야 하므로). 아무 제한도 없으면
// undefined(무제한).
export function maxQtyForSelection(product: Pick<Product, "stock" | "optionGroups">, optionValueIds: string[]): number | undefined {
  const limits: number[] = [];
  if (product.stock !== undefined) limits.push(product.stock);
  for (const id of optionValueIds) {
    const s = optionStockFor(product, id);
    if (s !== Infinity) limits.push(s);
  }
  return limits.length > 0 ? Math.min(...limits) : undefined;
}
