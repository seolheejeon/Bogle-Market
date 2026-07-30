import type { MarketEvent } from "@/types";

export type OrderPolicy = "STRICT_DEADLINE" | "SOFT_DEADLINE" | "ALWAYS_OPEN";

// 이벤트마다 따로 정하는 게 아니라 배송방식 + 특가 여부에서 그대로 파생시킨다 —
// 항상 type/badge와 동기화해야 하는 별도 컬럼을 두지 않기 위함. 관리자의 "종료"
// 버튼도 deadline_at을 지금으로 당기는 것 외엔 별도 취급 없이 이 정책을 그대로
// 따른다(문고리/택배는 종료를 눌러도 재고가 있으면 계속 주문된다).
export function getOrderPolicy(event: Pick<MarketEvent, "type" | "badge">): OrderPolicy {
  if (event.badge === "SALE") return "STRICT_DEADLINE"; // 특가는 배송방식과 무관하게 마감이 곧 종료
  if (event.type === "GROUP_BUY") return "STRICT_DEADLINE"; // 사다드림: 마감 후 주문 불가
  if (event.type === "DOOR") return "SOFT_DEADLINE"; // 문고리: 재고 있으면 마감 후에도 허용
  return "ALWAYS_OPEN"; // 택배(비특가): 마감 개념 없음, 상시 판매
}

// STRICT_DEADLINE 정책이고 마감이 지났을 때만 주문 자체를 막는다. SOFT_DEADLINE/
// ALWAYS_OPEN은 여기서 막지 않고, 재고(품절) 여부만으로 계속 제어된다(기존 로직 그대로).
export function isEventOrderable(event: Pick<MarketEvent, "type" | "badge" | "deadlineAt">): boolean {
  if (getOrderPolicy(event) !== "STRICT_DEADLINE") return true;
  return new Date(event.deadlineAt).getTime() > Date.now();
}
