export type EventType = "DOOR" | "GROUP_BUY" | "PARCEL";

export type PaymentMethod = "bank_transfer" | "card" | "kakaopay" | "incheon_eum";

export type OrderStatus = "wait" | "paid" | "confirmed" | "ship" | "done" | "refund_requested" | "refunded" | "cancelled";

// The product detail page's long-form "상세설명" content, rendered top to
// bottom in order — mirrors the shape a future admin editor would write
// (and a future `products.detail_blocks` jsonb column would store), so
// swapping the dummy data for real admin-authored content later only means
// changing where this array comes from, not how it's rendered.
// images 블록은 사진 목록(urls, 몇 장이든)과 레이아웃(columns)이 서로 독립이다 —
// 사진을 자유롭게 추가/삭제/순서변경 해두고, 그 목록을 1/2/3열 중 원하는
// 레이아웃으로만 렌더링한다(장수와 열 수가 안 맞으면 마지막 줄만 덜 채워짐).
export type ProductDetailBlock =
  | { type: "heading"; text: string }
  | { type: "text"; text: string }
  | { type: "images"; urls: string[]; columns: 1 | 2 | 3 };

// 옵션 그룹에 속한 선택지 하나(예: 색상 그룹의 "빨강"). priceDelta는 이 값을
// 고르면 기준 판매가에 더해지는 금액(음수 가능). hasStock=false면 재고 제한이
// 없다는 뜻이라 stock 필드가 아예 없다 — 있으면 그 이벤트 리스팅 기준 남은
// 재고(event_option_stock 스냅샷)를 뜻한다. defaultStock은 카탈로그 값으로,
// 새 이벤트에 리스팅을 추가할 때만 stock의 초기값으로 복사되고 그 이후로는
// 서로 독립적으로 움직인다(product_option_values.default_stock 참고).
export interface ProductOptionValue {
  id: string;
  name: string;
  priceDelta: number;
  hasStock: boolean;
  defaultStock?: number;
  sortOrder: number;
  // 이벤트 리스팅에 조인된 경우에만 채워짐(카탈로그 단독 조회 시엔 없음) —
  // hasStock=true인 옵션값의 "이 리스팅" 기준 남은 재고.
  stock?: number;
}

// 상품 옵션 그룹(색상/사이즈/중량/추가옵션 등) — required/multi/순서 같은
// "구조"는 origin/weight/storage와 동일하게 카탈로그 전용 값이라 이 상품을
// 파는 모든 이벤트가 그대로 공유하고, 이벤트별로 달라지지 않는다.
export interface ProductOptionGroup {
  id: string;
  name: string;
  // true면 반드시 하나 이상 선택해야 장바구니에 담을 수 있음(예: 색상/사이즈).
  required: boolean;
  // true면 여러 값 동시 선택 가능(예: 추가옵션), false면 하나만(예: 색상).
  multi: boolean;
  sortOrder: number;
  values: ProductOptionValue[];
}

// 카탈로그 상품 — 사진/설명/원산지 등 "내용물"만 담고 있고 이벤트와 무관하게
// 하나만 존재한다. "상품 관리"(`/admin/products`) 화면에서 검색·수정하는
// 대상이며, 여러 이벤트에서 그대로 재사용된다(복제해도 새로 안 늘어남).
export interface CatalogProduct {
  id: string;
  name: string;
  emoji: string;
  photos?: string[];
  origin?: string;
  weight?: string;
  storage?: string;
  eat?: string;
  description?: string;
  detailBlocks?: ProductDetailBlock[];
  // 새 이벤트에 이 상품을 추가할 때 기본값으로 복사되는 기준 판매가 — 공개
  // 정보라 다른 필드처럼 products 테이블에 그대로 저장된다. 실제 판매가는
  // 이벤트별 리스팅(event_products.price)이 독립적으로 갖는다.
  basePrice?: number;
  // 기준 원가 — 관리자에게만 보여야 하는 값이라 products/CatalogProduct와는
  // 별도의 admin-only 테이블(product_costs, RLS is_admin()만 조회 가능)에서
  // 온다. listCatalogProducts()가 관리자 화면에서만 호출되기 때문에 이 타입에
  // 같이 둬도 고객 화면에는 절대 노출되지 않는다.
  costPrice?: number;
  // 상품 중심 재고 — 이 상품을 쓰는 모든 이벤트 리스팅이 이 값 하나를
  // 공유한다. undefined = 재고 제한 없음(상시 판매). 한 이벤트에서 주문이
  // 들어가면 이 값이 줄고, 같은 상품을 파는 다른 이벤트에도 즉시 반영된다.
  // 입력/수정은 "상품 관리"(/admin/products)에서만 하고, 이벤트 관리
  // 화면(리스팅)에는 재고 입력란이 없다(Epic 1 Phase 3).
  stock?: number;
  // 최소 구매 수량 — 없으면 1(제한 없음과 동일). 상품 상세/빠른 담기가 항상
  // 이 수량으로 시작하고, 장바구니 등에서 이 밑으로는 못 내려간다.
  minQty?: number;
  // 상품 카드/상세에 붙는 표시용 뱃지(HOT/NEW/특가 등) — 예전엔 이벤트
  // 단위로 관리했지만, 같은 이벤트 안에서도 상품마다 다르게 붙이고 싶다는
  // 요청으로 상품(카탈로그) 단위로 옮겼다. 순수 노출용이라 주문/마감 정책과는
  // 무관하다 — "특가"라는 이름이 겹치지만 이벤트의 flashSale(1시간 특가)과는
  // 완전히 별개의 값이니 헷갈리지 않도록 주의.
  badge?: EventBadge;
  // 택배 배송비 — 상품(카탈로그) 단위로 관리한다. 없으면 0(배송비 없음).
  // 실제로 어떻게 부과되는지는 shippingFeeType이 정한다.
  shippingFee?: number;
  // 배송비 정책 — 없으면 "fixed"(고정 배송비)와 동일하게 취급한다.
  shippingFeeType?: ShippingFeeType;
  // shippingFeeType이 "free_threshold"일 때만 의미 있음 — 이 상품의 주문 내
  // 소계가 이 금액 이상이면 배송비가 0원이 된다. 0(또는 없음)이면 무료배송 미사용.
  freeShippingThreshold?: number;
  // shippingFeeType이 "per_quantity"일 때만 의미 있음 — 이 수량마다 배송비를
  // 한 번씩 더 부과한다(예: 5개마다 부과).
  shippingFeeQtyUnit?: number;
  // COURIER_OPTIONS의 code값이거나, 목록에 없는 택배사를 관리자가 직접 입력한
  // 자유 텍스트. 택배가 아니거나 아직 안 정했으면 undefined.
  courierCode?: string;
  fulfillmentType?: FulfillmentType;
  // fulfillmentType이 "scheduled"일 때만 의미 있는 출고예정일(YYYY-MM-DD).
  shipsAt?: string;
  // 색상/사이즈/중량/추가옵션 등 — 신발/의류/식품/과일/묶음상품 어디든 같은
  // 구조로 표현하기 위한 유연한 옵션 그룹 목록. 정렬 순서(sortOrder)대로 온다.
  optionGroups?: ProductOptionGroup[];
}

// 이벤트에 실제로 노출되는 상품(리스팅) — 카탈로그 상품 하나를 이번 회차에
// 어떤 가격/재고/노출 여부로 팔지 나타낸다. 장바구니/주문/재고 차감은 전부
// 이 리스팅의 id 기준으로 돈다(카탈로그 원본이 아니라) — 같은 카탈로그
// 상품이 여러 이벤트에 동시에 걸려도 이벤트별로 독립된 재고를 가져야 하기
// 때문. 화면 코드가 지금까지처럼 "상품 하나"를 평평하게 다룰 수 있도록
// 카탈로그 내용(name/photos/description 등)과 리스팅 정보(price/stock 등)를
// 합쳐서 내려준다 — 필드 구성 자체는 기존 Product와 거의 동일하다.
export interface Product {
  id: string;
  eventId: string;
  // 이 리스팅이 참조하는 카탈로그 상품의 id — "상품 관리"에서 수정하는 대상.
  catalogProductId: string;
  name: string;
  price: number;
  emoji: string;
  photos?: string[];
  // Overrides the parent event's delivery type when set — undefined means
  // "inherit the event's type" (the common case).
  deliveryType?: EventType;
  origin?: string;
  weight?: string;
  storage?: string;
  eat?: string;
  description?: string;
  detailBlocks?: ProductDetailBlock[];
  // 카탈로그 상품(CatalogProduct.stock)에서 그대로 내려오는 공유 재고값 —
  // 이 리스팅만의 독립된 값이 아니라, 같은 상품을 쓰는 다른 이벤트와 실시간
  // 공유된다. undefined = 재고 제한 없음. 0이 되면 품절 처리된다.
  stock?: number;
  // 카탈로그(CatalogProduct)에서 그대로 내려오는 값들 — 리스팅별로 달라지지
  // 않는다(origin/weight와 동일한 성격).
  minQty?: number;
  // 카탈로그의 표시용 뱃지(CatalogProduct.badge) — 리스팅마다 달라지지 않고
  // 이 상품을 파는 모든 이벤트에서 항상 같게 보인다.
  badge?: EventBadge;
  shippingFee?: number;
  shippingFeeType?: ShippingFeeType;
  freeShippingThreshold?: number;
  shippingFeeQtyUnit?: number;
  courierCode?: string;
  fulfillmentType?: FulfillmentType;
  shipsAt?: string;
  // false면 고객 화면(그리드/이벤트 상세 등)에서 숨김 — 상품은 남겨두되 잠시
  // 판매만 중단하고 싶을 때(예: 다음 회차 준비 중) 삭제 없이 끄는 용도.
  visible?: boolean;
  // 색상/사이즈/중량/추가옵션 등 — 그룹 구조(required/multi/이름)는 카탈로그와
  // 동일하지만, 재고관리(hasStock) 대상 값의 stock은 이 리스팅(event_option_stock)
  // 기준으로 온다. 재고관리 그룹이 하나뿐이면 이 stock이 곧 그 값 하나의 재고고,
  // 두 개 이상이면 단순 표시값일 뿐 실제 재고 판단은 optionStockByCombo를 쓴다.
  optionGroups?: ProductOptionGroup[];
  // 재고관리(hasStock) 대상 옵션값들의 "조합" 단위 재고 — 키는 선택된 값들
  // 중 hasStock=true인 것만 골라 id 오름차순 정렬 후 콤마로 이은 문자열
  // (lib/product-options.ts의 comboKey). 재고관리 그룹이 하나뿐이면 값 하나가
  // 곧 조합이라 키가 그 값의 id와 같고, 두 개 이상이면 진짜 조합(예: "블랙
  // id,260 id")이 된다 — 예전엔 값 하나하나의 재고를 각각 차감해서, 색상+사이즈처럼
  // 옵션이 2개 이상일 때 서로 다른 조합끼리 재고가 잘못 간섭하는 문제가 있었다.
  optionStockByCombo?: Record<string, number>;
}

// 상품 카드/상세에 붙는 표시용 뱃지 — 관리자가 상품 관리(CatalogProduct.badge)
// 화면에서 직접 고른다. 순수 노출용 라벨이라 주문 로직과는 무관하다(예전엔
// 이벤트 단위로 관리하며 SALE만 예외적으로 마감 정책에도 영향을 줬지만, 지금은
// 완전히 분리되어 그 역할은 MarketEvent.flashSale이 대신한다).
export type EventBadge = "NONE" | "SALE" | "HOT" | "NEW" | "RESERVE" | "DEADLINE";

export const EVENT_BADGE_LABEL: Record<EventBadge, string> = {
  NONE: "없음",
  SALE: "특가",
  HOT: "HOT",
  NEW: "NEW",
  RESERVE: "예약상품",
  DEADLINE: "마감임박",
};

// 관리자가 "종료" 버튼으로 세우는 명시적 상태 — deadlineAt과 별개로 배송방식별
// 마감 정책(lib/order-policy.ts)보다 항상 우선해서 주문을 막는다. "재시작"으로
// 다시 open으로 되돌릴 수 있다.
export type EventStatus = "open" | "ended";

export interface MarketEvent {
  id: string;
  type: EventType;
  title: string;
  // 관리자가 켠 "1시간 특가" 이벤트 여부 — 켜지면 배송방식과 무관하게 항상
  // 마감(deadlineAt)이 지나는 즉시 주문이 막히고(lib/order-policy.ts의
  // STRICT_DEADLINE), 홈 화면 히어로에 특가 슬라이드로 노출된다. 상품에
  // 붙이는 표시용 "특가" 뱃지(CatalogProduct.badge)와는 이름만 같을 뿐
  // 서로 아무 영향을 주지 않는 별개의 값.
  flashSale: boolean;
  status: EventStatus;
  deadlineAt: string; // ISO
  deliveryAt: string; // ISO
  notice: string;
  products: Product[];
}

// mock 모드 로컬스토리지에 이벤트와 함께 내장되는 "리스팅 원본" — 카탈로그
// 내용(name/photos/description 등)은 없고 이 이벤트에서의 가격/노출/배송방식
// 오버라이드만 담는다(재고는 카탈로그 상품 쪽에 있다 — CatalogProduct.stock).
// lib/data.ts가 이 원본을 카탈로그 상품과
// 조인해서 화면이 쓰는 평평한 Product로 합쳐준다 — Supabase 모드에서
// event_products·products 테이블을 조인한 것과 같은 결과를 mock에서도
// 내기 위함(두 모드가 항상 같은 방식으로 동작하도록).
export interface EventProductSeed {
  id: string;
  eventId: string;
  catalogProductId: string;
  price: number;
  // 상품을 이 이벤트에 추가한 시점의 원가 스냅샷 — 이후 카탈로그 원가(기준
  // 원가)가 바뀌어도 이 값은 그대로 유지된다(가격 스냅샷과 같은 방식). mock
  // 모드에는 관리자/고객을 가르는 실제 접근 제어가 없어서(브라우저 localStorage
  // 하나뿐) 다른 모든 값처럼 그냥 이 안에 둔다 — 실 서비스(Supabase)에서는
  // event_product_costs라는 별도 admin-only 테이블에 저장된다.
  costPrice?: number;
  deliveryType?: EventType;
  visible?: boolean;
  // 이 이벤트 안에서 노출되는 순서(오름차순) — 이벤트마다 독립적. 관리자가
  // ▲▼로 바꾸며, 새로 추가된 리스팅은 기존 최댓값+1로 맨 뒤에 붙는다.
  sortOrder?: number;
  // 옵션 조합별 재고 스냅샷(comboKey -> stock) — event_option_stock 테이블의
  // mock 버전. 재고관리 그룹이 하나뿐이면 comboKey가 곧 그 값의 id라 예전과
  // 동일하게 동작하고, 두 개 이상이면 진짜 조합 키가 된다(lib/product-options.ts의
  // comboKey/generateStockCombos). 이 이벤트에 추가한 시점에 카탈로그 기준
  // defaultStock으로 조합별 초기값을 채워두고, 이후로는 이 값만 독립적으로
  // 차감/복구된다. 재고관리 대상이 아닌 조합은 여기 키가 없음(재고 제한 없음).
  optionStock?: Record<string, number>;
}

export interface MarketEventSeed {
  id: string;
  type: EventType;
  title: string;
  flashSale: boolean;
  status: EventStatus;
  deadlineAt: string;
  deliveryAt: string;
  notice: string;
  products: EventProductSeed[];
}

export interface Address {
  id: string;
  profileId: string | null;
  name: string;
  phone: string;
  zonecode: string;
  roadAddress: string;
  // Daum 주소검색 결과가 공동주택일 때만 채워짐(단독주택 등은 빈 문자열).
  // 사용자가 직접 입력하는 값이 아니라 검색 결과에서 추출한 값 — 관리자가
  // 아파트 단지별로 필터링/일괄 배송처리를 할 수 있도록 별도 컬럼으로 둔다.
  apartmentName: string;
  detailAddress: string;
  entranceMethod?: string;
  memo?: string;
  isDefault: boolean;
}

// 도로명주소/상세주소 + 선택 항목을 사람이 읽는 한 줄로 합친다 (주문 스냅샷, 관리자 화면 등에 사용).
export function formatAddress(a: Pick<Address, "roadAddress" | "detailAddress" | "entranceMethod" | "memo">): string {
  const parts = [`${a.roadAddress} ${a.detailAddress}`.trim()];
  if (a.entranceMethod) parts.push(`출입방법: ${a.entranceMethod}`);
  if (a.memo) parts.push(`배송메모: ${a.memo}`);
  return parts.join(" · ");
}

export interface Profile {
  id: string;
  username: string;
  // 실명 — 회원가입 시 필수 입력. 주문서/배송지의 받는 분 이름 기본값,
  // 관리자 고객 관리 화면 등 "진짜 이름"이 필요한 곳에 쓴다. 오픈채팅
  // 닉네임(nickname)과는 별개 값 — nickname은 화면 인사말/채팅용 표시
  // 이름이라 실명과 다를 수 있다.
  name: string;
  nickname: string;
  phone: string;
  isAdmin: boolean;
}

// 주문 시점에 고른 옵션 하나의 스냅샷 — 화면에 보여주는 이름/가격조정은
// 카탈로그가 나중에 바뀌거나 삭제돼도 영향받지 않도록 값 자체로 복사해
// 저장한다(price_snapshot과 동일한 이유). optionValueId는 표시엔 안 쓰이지만
// 값이 나중에 지워졌는지 등을 추적할 여지로 남겨둔다 — 실제 재고 복구는
// OrderItem.stockComboValueIds를 쓴다(이 값 하나만으로는 어떤 값들이
// 재고관리 대상이었는지 order 시점 기준으로 알 수 없어서 분리했다).
export interface OrderItemOption {
  optionValueId: string;
  groupName: string;
  valueName: string;
  priceDelta: number;
}

export interface OrderItem {
  productId: string;
  productName: string;
  productEmoji: string;
  price: number;
  quantity: number;
  // 이 주문 라인에서 고른 옵션들의 스냅샷(단가 price에 이미 priceDelta가
  // 반영돼 있음 — options는 표시용). 옵션이 없는 상품은 빈 배열이거나 undefined.
  options?: OrderItemOption[];
  // 주문 시점에 계산해둔 "재고 조합 키"용 옵션값 id 배열(정렬됨) — 선택된
  // 옵션 중 재고관리(hasStock) 대상만 골라 담아, 취소/환불 시 이 배열
  // 그대로로 event_option_stock의 어느 조합 행을 복구할지 찾는다. 주문 이후
  // 카탈로그의 hasStock 설정이 바뀌어도(그룹 삭제 등) 차감 때 쓴 키와 항상
  // 똑같은 값으로 복구할 수 있도록 카탈로그를 다시 보지 않고 이 스냅샷만 쓴다.
  // 재고관리 대상 값을 하나도 안 골랐으면 undefined.
  stockComboValueIds?: string[];
}

export interface Order {
  id: string;
  orderNumber: string;
  // 주문은 정확히 하나의 이벤트에만 속한다 — 장바구니에 여러 이벤트 상품이
  // 섞여 있으면 체크아웃이 이벤트별로 주문을 나눠서 만든다.
  eventId: string;
  // 한 번의 체크아웃(결제)에서 함께 생성된 주문들을 묶는 키. 이벤트가 하나뿐인
  // 보통의 체크아웃도 자기 자신만 담긴 배치로 취급된다.
  batchId: string;
  profileId: string | null;
  guestName: string | null;
  guestPhone: string | null;
  guestPin: string | null;
  addressSnapshot: string;
  // 주문 시점 배송지의 아파트명 스냅샷(없으면 null) — 관리자가 아파트 단지별로
  // 주문을 필터링/일괄 배송처리할 때 쓴다. addressSnapshot과 마찬가지로
  // 주문 이후 회원이 배송지를 바꿔도 이 값은 그대로 남는다.
  apartmentName: string | null;
  recipientName: string;
  recipientPhone: string;
  paymentMethod: PaymentMethod;
  status: OrderStatus;
  // 발주확인(confirmed) 이후 고객이 취소를 "요청"하면 true — 상태 자체는 그대로
  // 두고(배송 준비는 계속 진행) 이 플래그만 세워서, 관리자가 승인(취소 처리)
  // 하거나 거절(사유와 함께 알림)할 때까지 대기시킨다. wait/paid 단계의 셀프
  // 취소는 이 플래그 없이 바로 status를 cancelled로 바꾼다(cancelOrder()).
  cancelRequested: boolean;
  // 고객이 취소 요청 시 남긴 사유(선택) — 관리자가 승인/거절을 판단할 때 참고.
  cancelReason: string | null;
  // 배송중(ship) 처리 시 관리자가 입력 — 택배(PARCEL)가 아닌 문고리/사다드림
  // 주문은 항상 null.
  courierCode: string | null;
  trackingNumber: string | null;
  items: OrderItem[];
  total: number;
  // 이 주문에 포함된 택배 배송비 스냅샷(무료배송 적용 후 값) — total에 이미
  // 더해져 있다. 문고리/사다드림 주문이나 배송비 없는 택배 주문은 0.
  shippingFee: number;
  createdAt: string; // ISO
}

// PRODUCT/EVENT/ORDER carry linkId to the matching detail page; NONE is a
// plain announcement with nothing to navigate to.
export type NotificationLinkType = "PRODUCT" | "EVENT" | "ORDER" | "NONE";

export interface NotificationItem {
  id: string;
  icon: string;
  title: string;
  message: string;
  linkType: NotificationLinkType;
  linkId?: string;
  // null = broadcast to everyone (admin announcements); set = only that
  // member sees it (e.g. their own order shipped).
  profileId: string | null;
  createdAt: string; // ISO
}

// 브라우저 PushSubscription을 서버로 넘길 때 쓰는 형태 — PushSubscription.toJSON()과
// 동일한 모양이라 클라이언트에서 그대로 만들어 보낼 수 있다.
export interface PushSubscriptionPayload {
  endpoint: string;
  keys: { p256dh: string; auth: string };
}

// 앱 안 어디서 실제 웹 푸시를 보낼지 지정하는 최소한의 정보 —
// app/api/push/send가 이 셋 중 하나를 받아 처리한다.
export interface PushNotificationPayload {
  title: string;
  body: string;
  url?: string;
  icon?: string;
  tag?: string;
}

export const NOTIFICATION_LINK_LABEL: Record<NotificationLinkType, string> = {
  PRODUCT: "상품",
  EVENT: "이벤트",
  ORDER: "주문",
  NONE: "없음",
};

export const PAYMENT_METHOD_LABEL: Record<PaymentMethod, string> = {
  bank_transfer: "무통장 입금",
  card: "카드 결제",
  kakaopay: "카카오페이",
  incheon_eum: "인천 이음카드",
};

// 택배 배송비 부과 방식 — 상품(카탈로그) 단위 설정.
// "fixed": 항상 shippingFee만큼 고정 부과.
// "free_threshold": shippingFee를 부과하되, 이 상품의 주문 내 소계가
//   freeShippingThreshold 이상이면 0원(공동구매 대량 주문 시 무료배송 혜택).
// "per_quantity": shippingFeeQtyUnit개마다 shippingFee를 한 번씩 더 부과
//   (예: 5세트마다 배송비 1회 — 박스 단위 발송처럼 수량에 비례해 배송 건수가
//   느는 상품에 씀).
export type ShippingFeeType = "fixed" | "free_threshold" | "per_quantity";

export const SHIPPING_FEE_TYPE_LABEL: Record<ShippingFeeType, string> = {
  fixed: "고정 배송비",
  free_threshold: "금액별 무료배송",
  per_quantity: "수량별 배송비",
};

// 택배 상품의 출고 방식 — 상품(카탈로그) 단위 설정. "scheduled"일 때만
// CatalogProduct.shipsAt(출고예정일)이 의미를 가진다.
export type FulfillmentType = "same_day" | "rolling" | "scheduled";

export const FULFILLMENT_TYPE_LABEL: Record<FulfillmentType, string> = {
  same_day: "당일발송",
  rolling: "순차출고",
  scheduled: "출고예정일 지정",
};

// 스마트택배(SweetTracker) API의 택배사 코드(t_code) 기준 — 배송조회 API
// 연동 전에 실제 코드값을 스마트택배 콘솔의 companylist API로 재확인할 것.
export const COURIER_OPTIONS = [
  { code: "04", label: "CJ대한통운" },
  { code: "05", label: "한진택배" },
  { code: "08", label: "롯데택배" },
  { code: "01", label: "우체국택배" },
  { code: "06", label: "로젠택배" },
] as const;

export const COURIER_LABEL: Record<string, string> = Object.fromEntries(COURIER_OPTIONS.map((c) => [c.code, c.label]));

// 실시간 API 조회가 안 될 때(키 미설정/오류) 대신 열어주는 각 택배사 공식
// 배송조회 페이지 — 송장번호만 채워 넣으면 된다.
export const COURIER_TRACKING_URL: Record<string, (invoice: string) => string> = {
  "04": (inv) => `https://trace.cjlogistics.com/next/tracking.html?wblNo=${inv}`,
  "05": (inv) => `https://www.hanjin.com/kor/CMS/DeliveryMgr/WaybillResult.do?mCode=MN038&schLang=KR&wblnumText2=${inv}`,
  "08": (inv) => `https://www.lotteglogis.com/home/reservation/tracking/linkView?InvNo=${inv}`,
  "01": (inv) => `https://service.epost.go.kr/trace.RetrieveDomRigiTraceList.comm?displayHeader=N&sid1=${inv}`,
  "06": (inv) => `https://www.ilogen.com/m/personal/trace.pop/${inv}`,
};

export const ORDER_STATUS_LABEL: Record<OrderStatus, string> = {
  wait: "입금대기",
  paid: "입금완료",
  confirmed: "발주확인",
  ship: "배송중",
  done: "배송완료",
  refund_requested: "반품/환불 신청",
  refunded: "환불완료",
  cancelled: "취소",
};

export const EVENT_TYPE_LABEL: Record<EventType, string> = {
  DOOR: "문고리배송",
  GROUP_BUY: "사다드림",
  PARCEL: "택배",
};

// 무통장입금 안내용 계좌 정보. 매장 전체에 하나만 존재하는 설정값(싱글턴)이라
// 관리자만 수정할 수 있고, 체크아웃/주문상세에서 손님에게 그대로 노출된다.
export interface StoreSettings {
  bankName: string;
  accountNumber: string;
  accountHolder: string;
  // 운영 중 자주 바뀌는 안내/링크류 — 코드 배포 없이 관리자 설정(/admin/settings)에서
  // 바꾸면 바로 고객 화면에 반영된다. 전부 선택값이라 안 채우면 해당 버튼/문구가
  // 그냥 안 보인다. 항목을 더 늘리고 싶으면(사업자정보, 고객센터 운영시간, 배송/
  // 환불 안내 문구 등) 여기에 필드를 추가하고 schema.sql의 store_settings에 같은
  // 이름의 컬럼을 추가한 뒤 관리자 설정 폼에 입력란만 붙이면 된다 — 싱글턴 행 하나에
  // 컬럼만 늘리는 지금 구조 그대로 확장된다.
  inquiryChatUrl?: string;
  kakaoChannelUrl?: string;
  opentalkUrl?: string;
}

export const EMPTY_STORE_SETTINGS: StoreSettings = { bankName: "", accountNumber: "", accountHolder: "" };

export function hasBankAccountInfo(settings: StoreSettings): boolean {
  return Boolean(settings.bankName.trim() && settings.accountNumber.trim() && settings.accountHolder.trim());
}

export type BannerLinkType = "PRODUCT" | "EVENT" | "URL" | "NONE";

export const BANNER_LINK_LABEL: Record<BannerLinkType, string> = {
  PRODUCT: "상품",
  EVENT: "이벤트",
  URL: "외부 URL",
  NONE: "없음",
};

// 메인 홈 상단 슬라이드 배너. linkType이 PRODUCT면 linkId는 카탈로그 상품 id를
// 담는다(리스팅 id 아님) — 배너는 노출 기간이 길어서 클릭 시점에 그 상품이
// 걸린 리스팅 중 가장 적합한 걸로 그때그때 해석한다(lib/banner-link.ts).
export interface Banner {
  id: string;
  imageUrl: string;
  linkType: BannerLinkType;
  linkId: string | null;
  linkUrl: string | null;
  active: boolean;
  startsAt: string | null; // ISO
  endsAt: string | null; // ISO
  sortOrder: number;
}
