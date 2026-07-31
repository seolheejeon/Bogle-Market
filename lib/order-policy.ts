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
// status==='ended'(관리자 "종료")는 배송방식 정책과 무관하게 항상 최우선으로
// 주문을 막는다 — 문고리/택배(SOFT_DEADLINE/ALWAYS_OPEN)도 예외 없음.
export function isEventOrderable(event: Pick<MarketEvent, "type" | "badge" | "status" | "deadlineAt">): boolean {
  if (event.status === "ended") return false;
  if (getOrderPolicy(event) !== "STRICT_DEADLINE") return true;
  return new Date(event.deadlineAt).getTime() > Date.now();
}

// 고객 화면(홈/카테고리 등 목록)에 이 이벤트를 아예 노출할지 여부 — 진행중이면
// 항상 노출하고, 관리자가 종료했다면 배송일 당일까지만 "마감"으로 조회 가능하게
// 남겨두고(주문은 isEventOrderable이 막음), 배송일 다음날 00:00부터는 목록에서
// 완전히 숨긴다. 직접 링크(상품 상세 등)로 들어온 경우는 이 함수를 거치지 않으므로
// 계속 열람은 가능하고 주문만 막힌다.
export function isEventVisibleToCustomers(event: Pick<MarketEvent, "status" | "deliveryAt">): boolean {
  if (event.status !== "ended") return true;
  const d = new Date(event.deliveryAt);
  const hideAt = new Date(d.getFullYear(), d.getMonth(), d.getDate() + 1, 0, 0, 0, 0);
  return Date.now() < hideAt.getTime();
}
