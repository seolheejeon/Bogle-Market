-- 보글마켓 Supabase schema
-- Run this in the Supabase SQL editor after creating your project.

create extension if not exists "pgcrypto";

-- Profiles (1:1 with auth.users). No email is ever shown to the user — signup
-- collects a username, and auth-context.tsx synthesizes `${username}@bogle.internal`
-- purely so Supabase Auth (which requires an email-shaped identifier) has
-- something to key on. The real email lives only in auth.users, never here.
create table if not exists profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  username text not null unique,
  nickname text not null default '',
  phone text not null unique,
  is_admin boolean not null default false,
  created_at timestamptz not null default now()
);

-- Saved addresses. profile_id is null for guest orders (snapshot lives on the
-- order itself). Only ever one row per member for now (the member's single
-- 기본 배송지), but modeled as its own table with is_default from the start
-- so multiple saved addresses per member is a UI change, not a schema change.
-- 주소는 Daum(카카오) 주소검색으로만 입력받는다 — road_address/zonecode는
-- 검색 결과 그대로, apartment_name은 검색 결과가 공동주택일 때만 채워지는
-- 값(사용자가 입력하는 항목이 아님)으로, 관리자가 아파트 단지별로 주문을
-- 필터링/일괄 배송처리할 때 쓴다. detail_address(동/호 등)만 사용자가 직접 입력.
create table if not exists addresses (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid references profiles(id) on delete cascade,
  name text not null,
  phone text not null,
  zonecode text not null default '',
  road_address text not null,
  apartment_name text not null default '',
  detail_address text not null,
  entrance_method text,
  memo text,
  is_default boolean not null default false,
  created_at timestamptz not null default now()
);

create table if not exists events (
  id uuid primary key default gen_random_uuid(),
  type text not null check (type in ('DOOR', 'GROUP_BUY', 'PARCEL')),
  title text not null,
  -- 이벤트 카드에 붙는 판매용 뱃지 — 관리자가 이벤트 수정 화면에서 직접 고른다.
  -- SALE(특가)만 예외적으로 lib/order-policy.ts의 마감 정책(STRICT_DEADLINE)에도
  -- 영향을 준다. 예전엔 is_flash(boolean)였는데, HOT/NEW/예약상품/마감임박처럼
  -- 더 다양한 뱃지를 지원하려고 badge(text enum)로 바꿨다.
  badge text not null default 'NONE' check (badge in ('NONE', 'SALE', 'HOT', 'NEW', 'RESERVE', 'DEADLINE')),
  deadline_at timestamptz not null,
  delivery_at timestamptz not null,
  notice text not null default '',
  -- 관리자가 "종료" 버튼으로 세우는 명시적 상태 — deadline_at과는 별개로,
  -- 배송방식별 마감 정책(lib/order-policy.ts의 STRICT/SOFT/ALWAYS_OPEN)보다
  -- 항상 우선해서 주문을 막는다. 'ended'가 되면 배송일 당일까지는 고객 화면에
  -- "마감"으로만 노출되고, 배송일 다음날 00:00부터는 고객 화면에서 완전히
  -- 숨겨진다(관리자 화면에는 계속 남아 "재시작"으로 되돌릴 수 있음).
  status text not null default 'open' check (status in ('open', 'ended')),
  created_at timestamptz not null default now()
);

-- 카탈로그 상품 — 사진/설명/원산지 등 "내용물"만 담고 이벤트와 무관하게 하나만
-- 존재한다. 여러 이벤트가 event_products를 통해 같은 카탈로그 상품을 그대로
-- 재사용한다("상품 관리"에서 한 번 고치면 어디서 팔든 다 반영됨).
create table if not exists products (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  emoji text not null default '📦',
  image_url text,
  photos jsonb not null default '[]'::jsonb,
  detail_blocks jsonb not null default '[]'::jsonb,
  origin text,
  weight text,
  storage text,
  eat text,
  description text,
  -- 새 이벤트에 이 상품을 추가할 때 기본값으로 복사되는 기준 판매가. 공개
  -- 정보라(고객도 결국 event_products.price로 실제 판매가를 보게 됨) 다른
  -- 컬럼처럼 그냥 products에 둔다 — 원가와 달리 숨길 필요가 없다.
  base_price integer not null default 0 check (base_price >= 0),
  -- 상품 중심 재고 — 이 상품을 쓰는 모든 이벤트 리스팅(event_products)이 이
  -- 값 하나를 공유한다(리스팅마다 따로 재고를 갖던 예전 구조와 반대). null =
  -- 재고 제한 없음(상시 판매). 한 이벤트에서 주문이 들어가면 이 값이 줄어들고,
  -- 같은 상품을 파는 다른 이벤트에도 다음 조회부터 즉시 반영된다. 입력/수정은
  -- "상품 관리"(/admin/products) 화면에서만 하고, 이벤트 관리 화면에서는
  -- 손대지 않는다(Epic 1 Phase 3).
  stock integer check (stock is null or stock >= 0),
  -- 최소 구매 수량 — 상품 상세/빠른 담기는 항상 이 수량으로 시작하고, 장바구니
  -- 등에서 수량을 줄여도 이 밑으로는 못 내려간다(완전히 빼려면 삭제해야 함).
  min_qty integer not null default 1 check (min_qty >= 1),
  -- 택배 배송비 — 상품(카탈로그) 단위로 관리한다(리스팅/이벤트 단위가 아님).
  -- 같은 상품이 여러 이벤트에 걸려도 배송비 정책은 하나. shipping_fee_type이
  -- 실제로 어떻게 부과할지를 정하고, 나머지 세 컬럼은 그 정책에 필요한 값만
  -- 골라서 쓴다: 'fixed'는 shipping_fee만, 'free_threshold'는 shipping_fee +
  -- free_shipping_threshold(주문 내 이 상품 소계가 이 금액 이상이면 0원),
  -- 'per_quantity'는 shipping_fee + shipping_fee_qty_unit(이 수량마다 배송비를
  -- 한 번씩 더 부과 — 예: 5개마다 4,000원이면 12개 주문 시 ceil(12/5)*4000).
  -- courier_code는 기본 목록(COURIER_OPTIONS, types/index.ts)의 코드값이거나
  -- 관리자가 목록에 없는 택배사를 직접 입력한 자유 텍스트일 수 있다 — 이 값은
  -- 상품 상세 화면 안내용일 뿐, 실제 송장 조회(주문의 courier_code/스마트택배
  -- API)와는 무관해서 자유 텍스트를 허용해도 안전하다. fulfillment_type이
  -- 'scheduled'일 때만 ships_at이 의미를 가진다.
  shipping_fee integer not null default 0 check (shipping_fee >= 0),
  shipping_fee_type text not null default 'fixed' check (shipping_fee_type in ('fixed', 'free_threshold', 'per_quantity')),
  free_shipping_threshold integer not null default 0 check (free_shipping_threshold >= 0),
  shipping_fee_qty_unit integer check (shipping_fee_qty_unit is null or shipping_fee_qty_unit >= 1),
  courier_code text,
  fulfillment_type text not null default 'same_day' check (fulfillment_type in ('same_day', 'rolling', 'scheduled')),
  ships_at date,
  created_at timestamptz not null default now()
);

-- 카탈로그 상품의 기준 원가 — 관리자만 봐야 하는 값이라 products와 분리된
-- 별도 테이블에 둔다. RLS를 is_admin()으로만 걸어서, 고객 화면이 쓰는 공개
-- 쿼리(products/event_products)에는 이 값이 절대 섞여 들어올 수 없다(같은
-- select 문에 join하지 않는 한 애초에 노출될 방법이 없음).
create table if not exists product_costs (
  product_id uuid primary key references products(id) on delete cascade,
  cost_price integer not null default 0 check (cost_price >= 0),
  updated_at timestamptz not null default now()
);

-- 이벤트별 상품 등록(리스팅) — 카탈로그 상품 하나를 이번 회차에 어떤
-- 가격/노출로 팔지 나타낸다. 재고는 여기 없다 — products.stock 하나를 이
-- 상품을 쓰는 모든 리스팅이 공유해서, 같은 상품을 여러 이벤트에 걸어도
-- 한쪽에서 주문이 들어가면 다른 회차 재고도 즉시 함께 줄어든다(Epic 1
-- Phase 3, 예전엔 리스팅마다 독립 재고였음). product_id는 삭제 방지(on
-- delete restrict가 기본 NO ACTION과 동일하게 동작) — 사용 중인 카탈로그
-- 상품은 삭제가 막힌다.
create table if not exists event_products (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references events(id) on delete cascade,
  product_id uuid not null references products(id),
  price integer not null check (price >= 0),
  -- null means "inherit the parent event's delivery type" — most products
  -- don't need to override it, but a few (e.g. a mostly-문고리 event with one
  -- 택배-only item) can.
  delivery_type text check (delivery_type in ('DOOR', 'GROUP_BUY', 'PARCEL')),
  -- false면 고객 화면에서 숨김(삭제 없이 판매만 잠시 중단). 기본은 true.
  visible boolean not null default true,
  -- 이 이벤트 안에서 상품이 노출되는 순서(오름차순) — 이벤트마다 독립적으로
  -- 관리자가 ▲▼로 바꿀 수 있다. 새로 추가되는 리스팅은 맨 뒤로 붙도록 그
  -- 시점의 최댓값+1로 채워진다.
  sort_order integer not null default 0,
  created_at timestamptz not null default now()
);

-- 이벤트 리스팅의 원가 스냅샷 — 상품을 이 이벤트에 추가한 시점의
-- product_costs.cost_price를 복사해두고, 이후 카탈로그 원가가 바뀌어도 이
-- 값은 그대로 유지된다(event_products.price가 이미 하는 것과 같은 스냅샷
-- 방식). product_costs와 마찬가지로 관리자만 조회 가능한 별도 테이블.
create table if not exists event_product_costs (
  event_product_id uuid primary key references event_products(id) on delete cascade,
  cost_price integer not null default 0 check (cost_price >= 0)
);

-- 상품 옵션 그룹(색상/사이즈/중량/추가옵션 등) — 카탈로그 상품에 속하며, 이
-- 상품을 파는 모든 이벤트가 그대로 공유한다. required/multi/순서 같은 "구조"는
-- origin/weight/storage와 동일하게 카탈로그 전용 값이라 이벤트별로 달라지지
-- 않는다(재고만 이벤트별로 달라짐 — event_option_stock 참고).
create table if not exists product_option_groups (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references products(id) on delete cascade,
  name text not null,
  required boolean not null default true,
  multi boolean not null default false,
  sort_order integer not null default 0,
  created_at timestamptz not null default now()
);

-- 옵션 그룹에 속한 각 선택지(예: 색상 그룹의 "빨강"/"파랑"). price_delta는 이
-- 값을 고를 때 기준 판매가에 더해지는 금액(음수 가능). has_stock=false면 이
-- 옵션값은 재고 제한이 없다는 뜻 — 이 경우 event_option_stock에는 행을 아예
-- 만들지 않는다. default_stock은 새 이벤트에 리스팅을 추가할 때
-- event_option_stock의 초기값으로 복사되는 기본 재고 수량.
create table if not exists product_option_values (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references product_option_groups(id) on delete cascade,
  name text not null,
  price_delta integer not null default 0,
  has_stock boolean not null default false,
  default_stock integer check (default_stock is null or default_stock >= 0),
  sort_order integer not null default 0,
  created_at timestamptz not null default now()
);

-- 이벤트 리스팅별 "옵션 조합" 재고 스냅샷 — event_products.stock과 같은 이유로
-- 분리한다: 같은 카탈로그 옵션값이라도 이벤트마다 독립된 재고를 가져야 하기
-- 때문. value_ids는 재고관리(has_stock=true) 대상 옵션값 id들을 오름차순
-- 정렬해 담은 배열이다 — 재고관리 그룹이 하나뿐이면 배열 길이가 항상 1이라
-- 예전(옵션값 하나 = 재고 하나)과 동일하게 동작하고, 두 개 이상이면 진짜
-- 조합(예: [블랙id, 260id])이 된다. 예전엔 값 하나하나의 재고를 각각
-- 차감해서, 옵션이 2개 이상일 때 서로 다른 조합끼리 재고가 잘못 간섭했다
-- (예: 블랙+260 주문이 블랙+270 재고까지 깎음). value_ids는 여러 값을
-- 가리키므로 단일 컬럼 FK를 못 걸어 has_stock=false로 옵션값이 지워져도
-- 자동 정리는 안 된다(정리 안 돼도 그냥 안 쓰이는 행으로 남을 뿐 문제 없음).
-- 리스팅을 이벤트에 추가하는 시점에 각 조합을 구성하는 옵션값들의
-- default_stock 중 최솟값으로 초기화하고, 이후로는 이 값만 주문 시
-- 차감/취소·환불 시 복구된다(재고관리 대상이 아닌 조합은 애초에 행이 없음 =
-- 재고 제한 없음).
create table if not exists event_option_stock (
  id uuid primary key default gen_random_uuid(),
  event_product_id uuid not null references event_products(id) on delete cascade,
  value_ids uuid[] not null,
  stock integer not null check (stock >= 0),
  unique (event_product_id, value_ids)
);

-- 주문은 정확히 하나의 이벤트에만 속한다 — 장바구니에 마감일/배송일이 다른
-- 여러 이벤트 상품이 섞여 있으면, 체크아웃이 이벤트별로 주문을 나눠서 여러
-- row를 만든다(lib/data.ts의 createOrder는 항상 단일 이벤트 기준으로 호출됨).
-- event_id에 on delete 절을 일부러 안 줘서(기본 NO ACTION), 실제 주문이 걸린
-- 이벤트는 삭제가 막힌다 — 예전엔 이벤트를 지우면 소속 상품이 cascade로
-- 같이 지워지면서 과거 주문의 상품 연결이 조용히 끊겼는데, 이제는 DB가 막아준다.
create table if not exists orders (
  id uuid primary key default gen_random_uuid(),
  order_number text not null unique,
  event_id uuid not null references events(id),
  -- 체크아웃 한 번에 여러 이벤트로 나뉘어 생성된 주문들을 묶는 키. 별도
  -- 테이블이 아니라 그냥 같은 값을 공유하는 uuid — "한 번에 결제된 묶음"이라는
  -- 뜻일 뿐, FK 참조 대상이 없다. 이벤트가 하나뿐인 보통의 체크아웃도 자기
  -- 자신만 담긴 배치로 취급되도록 기본값을 둔다.
  batch_id uuid not null default gen_random_uuid(),
  profile_id uuid references profiles(id) on delete set null,
  guest_name text,
  guest_phone text,
  guest_pin text,
  recipient_name text not null,
  recipient_phone text not null,
  address_snapshot text not null,
  -- 주문 시점 배송지의 아파트명 스냅샷(공동주택이 아니면 null) — 관리자가
  -- 아파트 단지별로 주문을 필터링/일괄 배송처리할 때 쓴다.
  apartment_name text,
  payment_method text not null check (payment_method in ('bank_transfer', 'card', 'kakaopay', 'incheon_eum')),
  -- wait(입금대기) -> paid(입금완료) -> confirmed(발주확인, 사장님이 실제 발주를
  -- 넣은 시점 — 이후로는 고객 셀프취소 불가) -> ship(배송중) -> done(배송완료).
  -- refund_requested/refunded는 done 이후 반품/환불 요청이 있을 때만 곁가지로
  -- 붙는 상태. cancelled는 wait/paid 단계에서만 고객이 스스로 취소하거나
  -- 관리자가 언제든 취소할 때.
  status text not null default 'wait' check (status in ('wait', 'paid', 'confirmed', 'ship', 'done', 'refund_requested', 'refunded', 'cancelled')),
  -- 발주확인(confirmed) 이후 고객이 취소를 "요청"하면 true — status는 그대로 두고
  -- (배송 준비는 계속 진행) 이 플래그만 세워서, 관리자가 승인(cancelled로 전환 +
  -- 재고 복구) 하거나 거절(플래그만 해제 + 사유와 함께 알림)할 때까지 대기시킨다.
  cancel_requested boolean not null default false,
  cancel_reason text,
  -- 배송중(ship) 처리 시 관리자가 입력하는 택배사 코드(스마트택배 API 기준,
  -- types/index.ts의 COURIER_LABEL 참고)와 송장번호. 문고리/사다드림처럼 직접
  -- 배송하는 주문은 비어있다.
  courier_code text,
  tracking_number text,
  total integer not null check (total >= 0),
  -- 이 주문에 포함된 택배 배송비 합계 스냅샷(상품별 배송비 - 무료배송 적용
  -- 후) — total에 이미 더해져 있는 값이지만, 나중에 상품의 배송비 정책이
  -- 바뀌어도 과거 주문 내역이 영향받지 않도록 따로 기록해둔다(price_snapshot과
  -- 같은 이유). 문고리/사다드림 주문이나 배송비가 없는 택배 주문은 0.
  shipping_fee integer not null default 0 check (shipping_fee >= 0),
  created_at timestamptz not null default now()
);

create table if not exists order_items (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references orders(id) on delete cascade,
  -- 카탈로그 상품(products)이 아니라 이벤트별 리스팅(event_products)을 가리킨다
  -- — 재고 차감/복구가 이벤트별 리스팅 단위로 동작해야 하기 때문.
  event_product_id uuid references event_products(id) on delete set null,
  product_name text not null,
  price_snapshot integer not null,
  quantity integer not null check (quantity > 0),
  -- 주문 시점에 고른 옵션의 스냅샷(그룹명/선택값/가격조정) — 카탈로그의
  -- product_option_groups/values가 나중에 바뀌거나 삭제돼도 과거 주문 내역
  -- 표시는 영향받지 않도록 값 자체를 복사해 저장한다. 예:
  -- [{"groupName":"색상","valueName":"빨강","priceDelta":0}, ...]
  options jsonb not null default '[]'::jsonb,
  -- 주문 시점에 계산해둔 "재고 조합 키" — options 중 재고관리(has_stock)
  -- 대상이었던 값들만 정렬해 담아, 취소/환불 시 event_option_stock의 어느
  -- 조합 행을 복구할지 이 배열 그대로 찾는다. 나중에 카탈로그의 has_stock
  -- 설정이 바뀌어도(그룹 삭제 등) 차감 때 쓴 키와 항상 똑같이 복구할 수
  -- 있도록 카탈로그를 다시 보지 않고 이 스냅샷만 쓴다. 재고관리 대상 값을
  -- 하나도 안 골랐으면 null.
  stock_value_ids uuid[]
);

-- profile_id null = broadcast to everyone (admin announcements, flash sales,
-- event openings); set = personal notification only that member sees (e.g.
-- their own order shipped). Read/dismissed state is tracked client-side
-- (see lib/notification-state.ts) rather than here, since it's a per-viewer
-- concern and this way works the same whether or not Supabase is configured.
create table if not exists notifications (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid references profiles(id) on delete cascade,
  icon text not null default '📢',
  title text not null,
  message text not null,
  link_type text not null default 'NONE' check (link_type in ('PRODUCT', 'EVENT', 'ORDER', 'NONE')),
  link_id uuid,
  created_at timestamptz not null default now()
);

-- 웹 푸시(Web Push) 구독 — 브라우저의 PushManager.subscribe() 결과(endpoint +
-- 공개키 2종)를 저장해뒀다가, 발송 시점에 이걸로 web-push 라이브러리가 실제
-- 브라우저 푸시 서비스(FCM/Mozilla 등)에 요청을 보낸다. profile_id가 있으면
-- 그 회원의 주문 상태 변경 알림(배송시작/완료 등)을 나중에 받을 수 있고,
-- null이면 로그인 없이 구독한 기기 — 그 순간(예: 주문 완료 직후) 딱 한 번의
-- 발송에만 쓰이고 그 뒤로는 다시 찾아갈 방법이 없다(guest_pin 같은 별도
-- 식별자가 없어서). endpoint는 브라우저/기기별로 유일해서 재구독해도 같은
-- 행을 덮어쓴다(on conflict). 구독/해제는 save_push_subscription/
-- delete_push_subscription RPC로만 하고(다른 guest RPC들과 동일한 이유 —
-- auth.uid()가 null인 비회원 요청은 평범한 RLS로 자기 것만 건드리게 만들기
-- 까다롭다), 테이블 자체는 관리자만 조회 가능하게 잠근다. 발송 API는
-- 서비스 롤 키로 RLS를 우회해서 이 정책과 무관하게 전체를 읽는다.
create table if not exists push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid references profiles(id) on delete cascade,
  endpoint text not null unique,
  p256dh text not null,
  auth text not null,
  user_agent text,
  created_at timestamptz not null default now()
);

-- 무통장입금 안내용 계좌 정보. 매장 전체에 하나뿐인 설정값이라 진짜 싱글턴으로
-- 강제한다 — boolean PK는 값이 true 하나뿐이라 두 번째 행을 만들 수 없다.
-- 최초 값은 관리자가 설정 화면에서 저장할 때 upsert로 생성된다.
create table if not exists store_settings (
  id boolean primary key default true check (id),
  bank_name text not null default '',
  account_number text not null default '',
  account_holder text not null default '',
  updated_at timestamptz not null default now()
);

-- 메인 홈 상단 배너. link_type=PRODUCT일 때 link_id는 카탈로그 상품(products) id를
-- 담아둔다(리스팅 id가 아님) — 배너는 알림과 달리 며칠~몇 주씩 노출되는데, 그 사이
-- 걸려 있던 이벤트가 끝나버리면 저장 시점에 고정한 리스팅 링크는 죽어버리기
-- 때문에, 클릭 시점에 그 상품이 걸린 리스팅 중 가장 적합한 것으로 그때그때
-- 해석한다(lib/banner-link.ts, notifications의 상품 연결과 같은 방식).
create table if not exists banners (
  id uuid primary key default gen_random_uuid(),
  image_url text not null,
  link_type text not null default 'NONE' check (link_type in ('PRODUCT', 'EVENT', 'URL', 'NONE')),
  link_id uuid,
  link_url text,
  active boolean not null default true,
  starts_at timestamptz,
  ends_at timestamptz,
  sort_order integer not null default 0,
  created_at timestamptz not null default now()
);

-- Row Level Security --------------------------------------------------

alter table profiles enable row level security;
alter table addresses enable row level security;
alter table events enable row level security;
alter table products enable row level security;
alter table event_products enable row level security;
alter table orders enable row level security;
alter table order_items enable row level security;
alter table notifications enable row level security;
alter table store_settings enable row level security;
alter table banners enable row level security;
alter table product_costs enable row level security;
alter table event_product_costs enable row level security;
alter table product_option_groups enable row level security;
alter table product_option_values enable row level security;
alter table event_option_stock enable row level security;

-- SECURITY DEFINER helper: checks admin status while bypassing RLS itself.
-- Policies must call this instead of subquerying `profiles` directly — a
-- policy on `profiles` that subqueries `profiles` (or any policy elsewhere
-- that does, combined with a policy back on `profiles`) causes Postgres to
-- report "infinite recursion detected in policy for relation profiles",
-- which PostgREST surfaces as a 500 on the *calling* query (e.g. /events).
create or replace function is_admin()
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select coalesce((select p.is_admin from profiles p where p.id = auth.uid()), false);
$$;

-- All policies are dropped-and-recreated so this whole file can be re-run
-- safely against a database that already has tables/policies from a
-- previous run (Postgres has no "create policy if not exists").

-- Anyone can read event/product catalog. 카탈로그 상품(products) 자체는
-- 내용물(사진/설명)이라 민감할 게 없어 공개 조회, 실제로 지금 사길 수
-- 있는지는 event_products의 visible로 따로 가린다.
drop policy if exists "events are publicly readable" on events;
create policy "events are publicly readable" on events for select using (true);
drop policy if exists "products are publicly readable" on products;
create policy "products are publicly readable" on products for select using (true);
drop policy if exists "event_products are publicly readable" on event_products;
create policy "event_products are publicly readable" on event_products for select using (visible or is_admin());
-- 옵션 그룹/값도 상품 내용물의 일부라 products와 동일하게 공개 조회.
-- event_option_stock은 실제 판매 재고라 event_products와 같은 공개 조회.
drop policy if exists "product_option_groups are publicly readable" on product_option_groups;
create policy "product_option_groups are publicly readable" on product_option_groups for select using (true);
drop policy if exists "product_option_values are publicly readable" on product_option_values;
create policy "product_option_values are publicly readable" on product_option_values for select using (true);
drop policy if exists "event_option_stock are publicly readable" on event_option_stock;
create policy "event_option_stock are publicly readable" on event_option_stock for select using (true);

-- Only admins can write the catalog
drop policy if exists "admins manage events" on events;
create policy "admins manage events" on events for all
  using (is_admin())
  with check (is_admin());
drop policy if exists "admins manage products" on products;
create policy "admins manage products" on products for all
  using (is_admin())
  with check (is_admin());
drop policy if exists "admins manage event_products" on event_products;
create policy "admins manage event_products" on event_products for all
  using (is_admin())
  with check (is_admin());
drop policy if exists "admins manage product option groups" on product_option_groups;
create policy "admins manage product option groups" on product_option_groups for all
  using (is_admin())
  with check (is_admin());
drop policy if exists "admins manage product option values" on product_option_values;
create policy "admins manage product option values" on product_option_values for all
  using (is_admin())
  with check (is_admin());
-- event_option_stock은 관리자 외에 decrement_option_stock/increment_option_stock
-- SECURITY DEFINER 함수를 통해서도 갱신된다(주문 생성/취소 시 일반 고객 요청으로
-- 호출됨) — 함수가 RLS를 우회하므로 이 정책은 관리자 직접 수정 UI만 커버한다.
drop policy if exists "admins manage event option stock" on event_option_stock;
create policy "admins manage event option stock" on event_option_stock for all
  using (is_admin())
  with check (is_admin());

-- 원가는 관리자만 조회/수정 가능 — select using까지 is_admin()으로 걸어서
-- 고객(비로그인 포함)은 이 테이블에 아예 접근할 수 없다(다른 공개 테이블과
-- 달리 "누구나 읽기" 정책이 없음).
drop policy if exists "admins manage product costs" on product_costs;
create policy "admins manage product costs" on product_costs for all
  using (is_admin())
  with check (is_admin());
drop policy if exists "admins manage event product costs" on event_product_costs;
create policy "admins manage event product costs" on event_product_costs for all
  using (is_admin())
  with check (is_admin());

-- Profiles: user manages their own row; admins can read all
-- signUp() creates the auth.users row first, then inserts the matching
-- profiles row as that same (now-authenticated) user — RLS defaults to
-- deny-all on insert without an explicit policy, which silently broke every
-- signup with a 403 until this was added (never caught before because this
-- flow only ever ran against mock-mode local storage, never a real Supabase
-- project, until 2026-07-30).
drop policy if exists "user creates own profile" on profiles;
create policy "user creates own profile" on profiles for insert with check (auth.uid() = id);
drop policy if exists "user reads own profile" on profiles;
create policy "user reads own profile" on profiles for select using (auth.uid() = id);
-- with check도 "auth.uid() = id"만 있으면 자기 자신의 is_admin을 true로 바꿔서
-- 셀프 관리자 승격을 할 수 있다(실제로 재현해서 확인함) — is_admin()이 이 UPDATE
-- 문 시작 시점의(즉 이 요청 이전) 값을 보게 되므로, 원래 관리자가 아니었다면
-- is_admin을 true로 바꾸는 건 항상 막히고, 원래 관리자였던 사람은 그대로 유지된다.
drop policy if exists "user updates own profile" on profiles;
create policy "user updates own profile" on profiles for update
  using (auth.uid() = id)
  with check (auth.uid() = id and (is_admin = false or is_admin()));
drop policy if exists "admins read all profiles" on profiles;
create policy "admins read all profiles" on profiles for select
  using (is_admin());

-- Addresses: owner only
drop policy if exists "user manages own addresses" on addresses;
create policy "user manages own addresses" on addresses for all
  using (profile_id = auth.uid())
  with check (profile_id = auth.uid());

-- Orders: signed-in users see their own orders; admins see everything.
-- Guest orders (profile_id is null) are looked up via name + PIN through
-- a dedicated RPC (see below) rather than direct table access.
drop policy if exists "user reads own orders" on orders;
create policy "user reads own orders" on orders for select using (profile_id = auth.uid());
drop policy if exists "user creates own orders" on orders;
create policy "user creates own orders" on orders for insert with check (profile_id = auth.uid() or profile_id is null);
-- 발주확인(confirmed) 전 단계(wait/paid)에서만 회원 본인이 셀프취소 가능 —
-- 발주가 들어간 뒤엔 관리자에게 문의해야 한다(앱에서 버튼 자체를 숨김).
-- 게스트 주문의 셀프취소는 인증이 없어 이 정책이 아니라 별도 RPC(cancel_guest_order)로 처리.
drop policy if exists "user cancels own order" on orders;
create policy "user cancels own order" on orders for update
  using (profile_id = auth.uid() and status in ('wait', 'paid'))
  with check (status = 'cancelled');
-- 발주확인(confirmed) 이후엔 즉시 취소 대신 "취소 요청"만 회원 스스로 남길 수
-- 있다 — status는 안 건드리고 cancel_requested/cancel_reason만 바꾸도록 강제.
-- 승인/거절(플래그를 다시 false로 되돌리는 것 포함)은 관리자 전용 정책으로 처리.
drop policy if exists "user requests cancel" on orders;
create policy "user requests cancel" on orders for update
  using (profile_id = auth.uid() and status in ('confirmed', 'ship') and cancel_requested = false)
  with check (status in ('confirmed', 'ship') and cancel_requested = true);
drop policy if exists "admins manage orders" on orders;
create policy "admins manage orders" on orders for all
  using (is_admin())
  with check (is_admin());

drop policy if exists "user reads own order items" on order_items;
create policy "user reads own order items" on order_items for select
  using (exists (select 1 from orders o where o.id = order_id and o.profile_id = auth.uid()));
drop policy if exists "user creates own order items" on order_items;
create policy "user creates own order items" on order_items for insert
  with check (exists (select 1 from orders o where o.id = order_id));
drop policy if exists "admins manage order items" on order_items;
create policy "admins manage order items" on order_items for all
  using (is_admin())
  with check (is_admin());

-- Notifications: anyone can read broadcasts (profile_id null); a signed-in
-- member can also read their own personal ones. Only admins send.
drop policy if exists "read broadcast or own notifications" on notifications;
create policy "read broadcast or own notifications" on notifications for select
  using (profile_id is null or profile_id = auth.uid());
drop policy if exists "admins send notifications" on notifications;
create policy "admins send notifications" on notifications for insert
  with check (is_admin());

-- Push subscriptions: 구독/해제는 save_push_subscription/delete_push_subscription
-- RPC로만 하고(SECURITY DEFINER라 이 정책들을 우회함), 테이블 직접 조회는
-- 관리자만 — 발송 API(서비스 롤 키)는 RLS 자체를 건너뛰므로 이 정책과 무관하다.
alter table push_subscriptions enable row level security;
drop policy if exists "push subscriptions are admin-only readable" on push_subscriptions;
create policy "push subscriptions are admin-only readable" on push_subscriptions for select using (is_admin());

-- Store settings (입금 계좌 정보): everyone needs to read it at checkout,
-- including guests, so select is public; only admins can write it.
drop policy if exists "store settings are publicly readable" on store_settings;
create policy "store settings are publicly readable" on store_settings for select using (true);
drop policy if exists "admins manage store settings" on store_settings;
create policy "admins manage store settings" on store_settings for all
  using (is_admin())
  with check (is_admin());

-- Banners: 활성 배너는 누구나 읽을 수 있고(홈 화면), 비활성/예약 배너는 관리자만
-- 미리 볼 수 있다. 노출 기간(starts_at/ends_at) 필터링은 앱 코드에서 처리.
drop policy if exists "active banners are publicly readable" on banners;
create policy "active banners are publicly readable" on banners for select using (active or is_admin());
drop policy if exists "admins manage banners" on banners;
create policy "admins manage banners" on banners for all
  using (is_admin())
  with check (is_admin());

-- Username/phone availability checks for the signup form's 중복확인 — plain
-- SELECT on profiles is scoped to the caller's own row (see RLS above), so
-- these SECURITY DEFINER functions exist purely to answer "is this taken?"
-- as a boolean without exposing whose it is.
create or replace function is_username_taken(p_username text)
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select exists(select 1 from profiles where username = p_username);
$$;

create or replace function is_phone_taken(p_phone text)
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select exists(select 1 from profiles where phone = p_phone);
$$;

-- Guest order lookup: name + a 4-digit PIN the guest chose at checkout, no
-- auth required. Returns every order under that name+PIN (a guest may have
-- placed more than one), unlike the old order-number lookup which only ever
-- matched a single order.
-- order_items를 jsonb로 같이 실어서 반환한다 — 예전엔 이 함수가 orders 행만
-- 반환하고 클라이언트가 order_items를 별도로 select했는데, order_items의
-- SELECT 정책(`exists (select 1 from orders where id=order_id and
-- profile_id=auth.uid())`)이 게스트 주문(profile_id가 null, auth.uid()도 null이라
-- 결코 매치 안 됨)을 절대 통과 못 해서 게스트는 자기 주문의 상품 목록을 영원히
-- 빈 배열로만 보게 되는 버그가 있었다(체크아웃 직후 리다이렉트되는 주문상세,
-- 마이페이지의 비회원 주문조회 둘 다 영향받음). SECURITY DEFINER인 이 함수
-- 안에서 order_items까지 함께 조회해 RLS를 우회한다.
create or replace function lookup_guest_orders(p_name text, p_pin text)
returns table (
  id uuid, order_number text, event_id uuid, batch_id uuid, profile_id uuid,
  guest_name text, guest_phone text, guest_pin text, recipient_name text, recipient_phone text,
  address_snapshot text, apartment_name text, payment_method text, status text,
  cancel_requested boolean, cancel_reason text, courier_code text, tracking_number text,
  total integer, created_at timestamptz, items jsonb
)
language sql
security definer
set search_path = public
as $$
  select
    o.id, o.order_number, o.event_id, o.batch_id, o.profile_id,
    o.guest_name, o.guest_phone, o.guest_pin, o.recipient_name, o.recipient_phone,
    o.address_snapshot, o.apartment_name, o.payment_method, o.status,
    o.cancel_requested, o.cancel_reason, o.courier_code, o.tracking_number,
    o.total, o.created_at,
    coalesce(
      (select jsonb_agg(jsonb_build_object(
        'event_product_id', oi.event_product_id,
        'product_name', oi.product_name,
        'price_snapshot', oi.price_snapshot,
        'quantity', oi.quantity,
        'options', oi.options
      ) order by oi.id)
      from order_items oi where oi.order_id = o.id),
      '[]'::jsonb
    ) as items
  from orders o
  where o.guest_pin = p_pin
    and lower(coalesce(o.guest_name, o.recipient_name)) = lower(p_name)
  order by o.created_at desc;
$$;

-- 게스트 주문 셀프취소: 이름+PIN이 맞고, 아직 발주확인 전(wait/paid) 단계일
-- 때만 취소로 전환한다. lookup_guest_orders와 같은 방식으로 인증 없이 호출되므로
-- SECURITY DEFINER + 조건을 함수 안에서 직접 검증. 실제로 취소됐을 때만
-- (조건이 안 맞아 0행이 바뀐 경우는 제외) 차감됐던 재고를 복구한다.
create or replace function cancel_guest_order(p_order_id uuid, p_name text, p_pin text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_cancelled_id uuid;
begin
  update orders
  set status = 'cancelled'
  where id = p_order_id
    and guest_pin = p_pin
    and lower(coalesce(guest_name, recipient_name)) = lower(p_name)
    and status in ('wait', 'paid')
  returning id into v_cancelled_id;

  if v_cancelled_id is not null then
    -- 재고는 리스팅이 아니라 카탈로그 상품(products.stock)에 있으므로
    -- event_products를 거쳐 어느 상품인지 찾아 복구한다(Epic 1 Phase 3).
    update products p
    set stock = p.stock + oi.quantity
    from order_items oi
    join event_products ep on ep.id = oi.event_product_id
    where oi.order_id = v_cancelled_id
      and ep.product_id = p.id
      and p.stock is not null;

    -- 옵션 조합 재고도 리스팅 재고와 마찬가지로 복구한다 — 주문 시점에 이미
    -- 정규화해 저장해둔 stock_value_ids를 그대로 키로 써서 어느 조합 행인지
    -- 찾는다(카탈로그의 has_stock 설정이 그 사이 바뀌었어도 영향받지 않음).
    update event_option_stock eos
    set stock = eos.stock + oi.quantity
    from order_items oi
    where oi.order_id = v_cancelled_id
      and eos.event_product_id = oi.event_product_id
      and eos.value_ids = oi.stock_value_ids
      and oi.stock_value_ids is not null;
  end if;
end;
$$;

-- 게스트의 발주확인 이후 취소 요청: 즉시 취소가 아니라 cancel_requested만
-- 세운다(status는 그대로 둬서 배송 준비가 계속 진행됨). 승인/거절은 관리자가
-- 관리자 세션으로 직접 orders를 업데이트하므로 별도 RPC가 필요 없다.
create or replace function request_guest_cancel(p_order_id uuid, p_name text, p_pin text, p_reason text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  update orders
  set cancel_requested = true, cancel_reason = p_reason
  where id = p_order_id
    and guest_pin = p_pin
    and lower(coalesce(guest_name, recipient_name)) = lower(p_name)
    and status in ('confirmed', 'ship')
    and cancel_requested = false;
end;
$$;

-- 주문 생성(orders + order_items를 한 트랜잭션으로) — 클라이언트에서 각각
-- insert하던 방식은 게스트 주문에서 항상 실패했다: order_items의 INSERT
-- 정책(`exists (select 1 from orders where id = order_id)`)이 검사하는
-- orders 서브쿼리도 orders의 SELECT 정책(profile_id = auth.uid())을 그대로
-- 타는데, 게스트 주문은 profile_id가 null이라 auth.uid()(역시 null)와
-- "NULL = NULL"이 SQL에서 true가 아니라서 서브쿼리가 방금 만든 자기 자신의
-- 주문조차 "안 보이는" 것처럼 취급해 매번 막혔다. SECURITY DEFINER로 RLS를
-- 완전히 우회해서 이 문제를 근본적으로 없앤다. 회원 주문의 profile_id
-- 검증(자기 자신 것만 만들 수 있어야 함)은 기존 INSERT 정책이 하던 일을
-- 함수 안에서 그대로 재현한다.
-- p_shipping_fee가 새로 추가된 파라미터라 인자 개수가 달라져서 create or
-- replace만으로는 기존 16개짜리 시그니처가 별도 오버로드로 남을 수 있다 —
-- 먼저 지우고 새로 만든다(schema.sql 히스토리의 다른 함수들과 동일한 패턴).
drop function if exists create_order(uuid, text, uuid, uuid, uuid, text, text, text, text, text, text, text, text, integer, timestamptz, jsonb);
create or replace function create_order(
  p_id uuid,
  p_order_number text,
  p_event_id uuid,
  p_batch_id uuid,
  p_profile_id uuid,
  p_guest_name text,
  p_guest_phone text,
  p_guest_pin text,
  p_recipient_name text,
  p_recipient_phone text,
  p_address_snapshot text,
  p_apartment_name text,
  p_payment_method text,
  p_total integer,
  p_created_at timestamptz,
  p_items jsonb,
  p_shipping_fee integer default 0
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_bad_item record;
begin
  if p_profile_id is not null and p_profile_id <> auth.uid() then
    raise exception 'profile_id must match the authenticated user';
  end if;

  -- 최소 구매 수량 서버 검증 — 상품상세/장바구니에서 이미 막지만, RPC를 직접
  -- 호출하는 경우까지 대비해 여기서 한 번 더 막는다(체크아웃의 "서버 검증").
  select i->>'product_name' as name, (i->>'quantity')::integer as qty, p.min_qty as min_qty
  into v_bad_item
  from jsonb_array_elements(p_items) as i
  join event_products ep on ep.id = nullif(i->>'event_product_id', '')::uuid
  join products p on p.id = ep.product_id
  where (i->>'quantity')::integer < p.min_qty
  limit 1;

  if v_bad_item.name is not null then
    raise exception '%은(는) 최소 %개부터 주문할 수 있어요.', v_bad_item.name, v_bad_item.min_qty;
  end if;

  insert into orders (
    id, order_number, event_id, batch_id, profile_id, guest_name, guest_phone, guest_pin,
    recipient_name, recipient_phone, address_snapshot, apartment_name, payment_method, status, total, shipping_fee, created_at
  ) values (
    p_id, p_order_number, p_event_id, p_batch_id, p_profile_id, p_guest_name, p_guest_phone, p_guest_pin,
    p_recipient_name, p_recipient_phone, p_address_snapshot, p_apartment_name, p_payment_method, 'wait', p_total, p_shipping_fee, p_created_at
  );

  insert into order_items (order_id, event_product_id, product_name, price_snapshot, quantity, options, stock_value_ids)
  select
    p_id,
    nullif(i->>'event_product_id', '')::uuid,
    i->>'product_name',
    (i->>'price_snapshot')::integer,
    (i->>'quantity')::integer,
    coalesce(i->'options', '[]'::jsonb),
    (select array_agg(x::uuid) from jsonb_array_elements_text(coalesce(i->'stock_value_ids', '[]'::jsonb)) x)
  from jsonb_array_elements(p_items) as i;
end;
$$;

-- 재고 차감/복구: 주문 생성 시 차감, 취소/환불 시 복구. 재고는 리스팅이 아니라
-- 카탈로그 상품(products.stock)에서 관리되어 같은 상품을 파는 모든 이벤트가
-- 하나의 재고를 실시간으로 공유한다(Epic 1 Phase 3) — 호출부는 그대로
-- event_product_id(리스팅)를 넘기고, 이 함수가 그 리스팅이 가리키는
-- product_id를 찾아 그 상품의 재고를 갱신한다. stock이 null인 경우(재고
-- 제한 없음)는 그대로 null 유지. 0 밑으로는 안 내려감.
create or replace function decrement_stock(p_event_product_id uuid, p_qty integer)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  update products
  set stock = greatest(stock - p_qty, 0)
  where id = (select product_id from event_products where id = p_event_product_id)
    and stock is not null;
end;
$$;

create or replace function increment_stock(p_event_product_id uuid, p_qty integer)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  update products
  set stock = stock + p_qty
  where id = (select product_id from event_products where id = p_event_product_id)
    and stock is not null;
end;
$$;

-- 옵션 "조합" 재고 차감/복구 — p_value_ids는 재고관리(has_stock) 대상 값들의
-- id 배열이다(정렬 여부와 무관하게 함수 안에서 항상 오름차순으로 다시
-- 정규화해서 비교/저장하므로 호출부가 정렬을 안 해도 안전하다). 재고관리
-- 대상 값을 하나도 안 고른 주문(p_value_ids가 비었거나 null)은 애초에
-- 아무 일도 안 한다(재고 제한 없음과 동일한 동작).
--
-- 해당 조합에 대한 행이 아직 없는 경우(리스팅을 이벤트에 추가한 *이후*에
-- 관리자가 뒤늦게 재고관리를 켰거나, 처음 나오는 조합인 경우 —
-- addEventProduct의 자동 초기화는 추가 시점에만 한 번 실행되므로 이미
-- 존재하는 리스팅엔 소급 적용되지 않음)에는 그냥 무시하지 않고, 조합을
-- 구성하는 값들의 카탈로그 default_stock 중 최솟값을 기준으로 행을 새로
-- 만들면서 이번 차감분까지 한 번에 반영한다.
create or replace function decrement_option_stock(p_event_product_id uuid, p_value_ids uuid[], p_qty integer)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_ids uuid[] := (select array_agg(x order by x) from unnest(p_value_ids) x);
begin
  if v_ids is null or array_length(v_ids, 1) is null then
    return;
  end if;

  update event_option_stock set stock = greatest(stock - p_qty, 0)
  where event_product_id = p_event_product_id and value_ids = v_ids;

  if not found then
    insert into event_option_stock (event_product_id, value_ids, stock)
    select p_event_product_id, v_ids, greatest(coalesce(min(pov.default_stock), 0) - p_qty, 0)
    from product_option_values pov
    where pov.id = any(v_ids) and pov.has_stock
    having count(*) > 0
    on conflict (event_product_id, value_ids) do update set stock = excluded.stock;
  end if;
end;
$$;

create or replace function increment_option_stock(p_event_product_id uuid, p_value_ids uuid[], p_qty integer)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_ids uuid[] := (select array_agg(x order by x) from unnest(p_value_ids) x);
begin
  update event_option_stock set stock = stock + p_qty
  where event_product_id = p_event_product_id and value_ids = v_ids;
end;
$$;

-- 웹 푸시 구독 저장 — 로그인 상태면 p_profile_id를 함께 저장해서 나중에 그
-- 회원 앞으로 오는 주문 상태 알림(배송시작/완료 등)을 이 기기로도 보낼 수
-- 있고, 비로그인이면 null로 저장돼 그 순간 한 번(예: 주문 완료 직후)만 쓰인다.
-- 같은 endpoint로 다시 구독하면(브라우저가 만료된 구독을 자동 갱신하는 경우
-- 등) 새 값으로 덮어쓴다.
create or replace function save_push_subscription(
  p_profile_id uuid, p_endpoint text, p_p256dh text, p_auth text, p_user_agent text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if p_profile_id is not null and p_profile_id <> auth.uid() then
    raise exception 'profile_id must match the authenticated user';
  end if;
  insert into push_subscriptions (profile_id, endpoint, p256dh, auth, user_agent)
  values (p_profile_id, p_endpoint, p_p256dh, p_auth, p_user_agent)
  on conflict (endpoint) do update set
    profile_id = excluded.profile_id, p256dh = excluded.p256dh, auth = excluded.auth, user_agent = excluded.user_agent;
end;
$$;

-- 푸시 구독 해제 — endpoint는 브라우저가 발급하는 사실상 유추 불가능한 값이라,
-- guest_pin처럼 "이걸 아는 것 자체가 본인 기기라는 증거"로 취급해 별도
-- 로그인 확인 없이 endpoint 일치만으로 삭제한다.
create or replace function delete_push_subscription(p_endpoint text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  delete from push_subscriptions where endpoint = p_endpoint;
end;
$$;

-- Storage: public bucket for product photos uploaded from the admin panel.
insert into storage.buckets (id, name, public)
values ('product-photos', 'product-photos', true)
on conflict (id) do nothing;

drop policy if exists "product photos are publicly readable" on storage.objects;
create policy "product photos are publicly readable" on storage.objects for select
  using (bucket_id = 'product-photos');

drop policy if exists "admins upload product photos" on storage.objects;
create policy "admins upload product photos" on storage.objects for insert
  with check (bucket_id = 'product-photos' and is_admin());

drop policy if exists "admins update product photos" on storage.objects;
create policy "admins update product photos" on storage.objects for update
  using (bucket_id = 'product-photos' and is_admin())
  with check (bucket_id = 'product-photos' and is_admin());

drop policy if exists "admins delete product photos" on storage.objects;
create policy "admins delete product photos" on storage.objects for delete
  using (bucket_id = 'product-photos' and is_admin());

-- Create the first admin manually after signing up, e.g.:
-- update profiles set is_admin = true where username = 'bogle123';
