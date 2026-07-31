// 상품 옵션(색상/사이즈/중량/추가옵션 등) 관련 순수 계산 헬퍼 — 장바구니,
// 상품 상세, 체크아웃, 주문 스냅샷이 전부 같은 규칙으로 가격/재고/선택
// 완료 여부를 계산하도록 여기 한 곳에 모아둔다.

import type { Product, OrderItemOption, ProductOptionGroup } from "@/types";

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

// 재고관리(hasStock=true) 대상인 옵션값 id 전체 — 이 값들만 "조합"(SKU) 키에
// 참여한다. 재고 제한이 없는 값(hasStock=false)은 어떤 조합을 고르든 재고를
// 제한하지 않으므로 키에서 아예 빠진다.
function stockTrackedValueIds(product: Pick<Product, "optionGroups">): Set<string> {
  const ids = new Set<string>();
  for (const g of product.optionGroups ?? []) {
    for (const v of g.values) if (v.hasStock) ids.add(v.id);
  }
  return ids;
}

// 재고관리 대상 값이 하나라도 있는 그룹의 개수 — 1개면 값 하나가 곧 조합이라
// (기존과 동일하게) 버튼 하나하나에 품절 표시를 해도 되지만, 2개 이상이면
// 값 하나만으로는 품절 여부를 알 수 없다(조합 전체를 봐야 함).
export function stockTrackedGroupCount(product: Pick<Product, "optionGroups">): number {
  return (product.optionGroups ?? []).filter((g) => g.values.some((v) => v.hasStock)).length;
}

// 선택된 옵션값들 중 재고관리 대상만 골라 id 오름차순으로 정렬한 배열 —
// event_option_stock/order_items.stock_value_ids와 항상 같은 순서로 맞추기
// 위한 정규화. 재고관리 대상을 하나도 안 골랐으면 빈 배열(무제한).
export function comboValueIds(product: Pick<Product, "optionGroups">, optionValueIds: string[]): string[] {
  const tracked = stockTrackedValueIds(product);
  return optionValueIds.filter((id) => tracked.has(id)).sort();
}

// comboValueIds를 DB/맵 키로 쓸 수 있는 문자열로("id1,id2" 형태, 오름차순이라
// 항상 같은 조합이면 같은 문자열이 나온다). 재고관리 대상이 없으면 빈 문자열.
export function comboKey(product: Pick<Product, "optionGroups">, optionValueIds: string[]): string {
  return comboValueIds(product, optionValueIds).join(",");
}

// 이 옵션 조합의 남은 재고 — 재고관리 대상 값을 하나도 안 골랐으면 undefined
// (무제한). 골랐는데 아직 이 조합에 대한 재고 행이 없으면 0(안전하게 품절
// 취급 — 있어야 할 조합이 없다는 건 대개 아직 채워지지 않은 상태라서).
function comboStockFor(product: Pick<Product, "optionGroups" | "optionStockByCombo">, optionValueIds: string[]): number | undefined {
  const key = comboKey(product, optionValueIds);
  if (key === "") return undefined;
  return product.optionStockByCombo?.[key] ?? 0;
}

// 이 옵션 조합으로 담을 수 있는 최대 수량 — 리스팅 자체 재고(stock)와 선택된
// 옵션 조합의 재고 중 더 작은 값(전부 만족해야 하므로). 아무 제한도 없으면
// undefined(무제한).
export function maxQtyForSelection(
  product: Pick<Product, "stock" | "optionGroups" | "optionStockByCombo">,
  optionValueIds: string[],
): number | undefined {
  const limits: number[] = [];
  if (product.stock !== undefined) limits.push(product.stock);
  const comboStock = comboStockFor(product, optionValueIds);
  if (comboStock !== undefined) limits.push(comboStock);
  return limits.length > 0 ? Math.min(...limits) : undefined;
}

// 재고관리 그룹(hasStock 값이 있는 그룹)들의 카티션 곱 — 그룹이 1개면 그
// 그룹의 재고관리 대상 값 각각이 곧 조합(예전과 동일), 2개 이상이면 진짜
// 조합(예: 블랙+260)이 나온다. 각 조합의 기본 재고는 참여하는 값들의
// defaultStock 중 최솟값으로 잡는다 — 조합 전용 기본값을 카탈로그에 따로
// 두지 않은 대신 쓰는 합리적인 추정치(하나라도 부족하면 그 조합도 그만큼만
// 팔 수 있다고 보는 게 안전).
export function generateStockCombos(groups: ProductOptionGroup[]): { valueIds: string[]; defaultStock: number }[] {
  const stockGroups = groups.map((g) => g.values.filter((v) => v.hasStock)).filter((vs) => vs.length > 0);
  if (stockGroups.length === 0) return [];
  let combos: { valueIds: string[]; defaultStock: number }[] = [{ valueIds: [], defaultStock: Infinity }];
  for (const values of stockGroups) {
    const next: typeof combos = [];
    for (const combo of combos) {
      for (const v of values) {
        next.push({ valueIds: [...combo.valueIds, v.id].sort(), defaultStock: Math.min(combo.defaultStock, v.defaultStock ?? 0) });
      }
    }
    combos = next;
  }
  return combos;
}
