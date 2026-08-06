import type { MarketEvent, Product } from "@/types";

export type OrderPolicy = "STRICT_DEADLINE" | "SOFT_DEADLINE" | "ALWAYS_OPEN";

// 이벤트마다 따로 정하는 게 아니라 배송방식 + 특가 여부에서 그대로 파생시킨다 —
// 항상 type/flashSale과 동기화해야 하는 별도 컬럼을 두지 않기 위함. 관리자의
// "종료" 버튼도 deadline_at을 지금으로 당기는 것 외엔 별도 취급 없이 이 정책을
// 그대로 따른다(문고리/택배는 종료를 눌러도 재고가 있으면 계속 주문된다).
export function getOrderPolicy(event: Pick<MarketEvent, "type" | "flashSale">): OrderPolicy {
  if (event.flashSale) return "STRICT_DEADLINE"; // 1시간 특가는 배송방식과 무관하게 마감이 곧 종료
  if (event.type === "GROUP_BUY") return "STRICT_DEADLINE"; // 사다드림: 마감 후 주문 불가
  if (event.type === "DOOR") return "SOFT_DEADLINE"; // 문고리: 재고 있으면 마감 후에도 허용
  return "ALWAYS_OPEN"; // 택배(비특가): 마감 개념 없음, 상시 판매
}

// STRICT_DEADLINE 정책이고 마감이 지났을 때만 주문 자체를 막는다. SOFT_DEADLINE/
// ALWAYS_OPEN은 여기서 막지 않고, 재고(품절) 여부만으로 계속 제어된다(기존 로직 그대로).
// status==='ended'(관리자 "종료")는 배송방식 정책과 무관하게 항상 최우선으로
// 주문을 막는다 — 문고리/택배(SOFT_DEADLINE/ALWAYS_OPEN)도 예외 없음.
export function isEventOrderable(event: Pick<MarketEvent, "type" | "flashSale" | "status" | "deadlineAt">): boolean {
  if (event.status === "ended") return false;
  if (getOrderPolicy(event) !== "STRICT_DEADLINE") return true;
  return new Date(event.deadlineAt).getTime() > Date.now();
}

// 고객 화면(홈/카테고리 등 목록)에 이 이벤트를 아예 노출할지 여부.
// 문고리/사다드림은 회차(날짜)마다 별도 이벤트라서, 관리자가 "종료"를 따로
// 안 눌러도 배송일이 지나면 자연스럽게 그 회차는 끝난 것 — 그래서 상태와
// 무관하게 배송일 당일까지만 노출하고 다음날 00:00부터는 목록에서 자동으로
// 숨긴다. 택배(PARCEL)는 상시 판매라 배송일이 "이번 상품의 마지막 날"이라는
// 의미가 없으므로(회차 개념 자체가 없음) 이 자동 숨김 대상에서 빼고,
// 관리자가 직접 "종료"를 눌렀을 때만(status==='ended') 같은 규칙을 적용해
// 숨긴다. 직접 링크(상품 상세 등)로 들어온 경우는 이 함수를 거치지 않으므로
// 계속 열람은 가능하고 주문만 막힌다.
export function isEventVisibleToCustomers(event: Pick<MarketEvent, "type" | "status" | "deliveryAt">): boolean {
  if (event.type === "PARCEL" && event.status !== "ended") return true;
  const d = new Date(event.deliveryAt);
  const hideAt = new Date(d.getFullYear(), d.getMonth(), d.getDate() + 1, 0, 0, 0, 0);
  return Date.now() < hideAt.getTime();
}

// 관리자 화면(운영 메인 타일, 이벤트 관리 목록)에서 "진행중" vs "종료"를
// 나눌 때 쓰는 기준 — 관리자가 직접 "종료"를 안 눌러도 마감(deadlineAt)이
// 지나면 그 회차는 더 볼 일이 없다고 보고 자동으로 종료 쪽으로 묶는다.
// 택배(PARCEL)는 마감 개념이 없어(상시 판매) 대상에서 뺀다.
//
// 실제 주문 가능 여부(isEventOrderable)는 이 값과 완전히 별개다 — 문고리
// (SOFT_DEADLINE)처럼 마감이 지나도 재고가 있으면 계속 주문을 받는 이벤트가
// 있어서, 여기서 "종료"로 분류된다고 해서 주문이 막히는 건 아니다. 실제로
// 막고 싶으면 관리자가 이 목록에서 "종료" 버튼을 눌러 status를 바꿔야 한다.
export function isEventDeadlinePassed(event: Pick<MarketEvent, "type" | "deadlineAt">): boolean {
  if (event.type === "PARCEL") return false;
  return new Date(event.deadlineAt).getTime() <= Date.now();
}

export function isEventAdminEnded(event: Pick<MarketEvent, "type" | "status" | "deadlineAt">): boolean {
  return event.status === "ended" || isEventDeadlinePassed(event);
}

// 이 리스팅 하나만(이벤트 전체와 별개로) 주문 가능한지 — 관리자가 즉시
// 마감시킨 경우(closed) 또는 이 리스팅만의 예약 마감시간(orderDeadlineAt)이
// 지난 경우 둘 다 여기서 막는다. 예약상품(발주 마감이 이벤트 마감보다
// 이른 경우)은 orderDeadlineAt만 지나 있어도 closed 없이 자동으로 막히고,
// 관리자가 그 값을 지우거나 미래로 늦추면 다시 열린다 — closed는 "지금
// 당장" 끄는 수동 스위치라 시간이 지나도 저절로 안 풀린다는 점이 다르다.
export function isListingOrderable(product: Pick<Product, "closed" | "orderDeadlineAt">): boolean {
  if (product.closed) return false;
  if (product.orderDeadlineAt && new Date(product.orderDeadlineAt).getTime() <= Date.now()) return false;
  return true;
}
