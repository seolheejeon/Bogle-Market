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
-- 가격/재고/노출로 팔지 나타낸다. 장바구니/주문/재고는 전부 이 테이블의 id
-- 기준으로 돈다 — 같은 카탈로그 상품이 여러 이벤트에 동시에 걸려도 이벤트별로
-- 독립된 재고를 가져야 하기 때문. product_id는 삭제 방지(on delete restrict가
-- 기본 NO ACTION과 동일하게 동작) — 사용 중인 카탈로그 상품은 삭제가 막힌다.
create table if not exists event_products (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references events(id) on delete cascade,
  product_id uuid not null references products(id),
  price integer not null check (price >= 0),
  -- null means "inherit the parent event's delivery type" — most products
  -- don't need to override it, but a few (e.g. a mostly-문고리 event with one
  -- 택배-only item) can.
  delivery_type text check (delivery_type in ('DOOR', 'GROUP_BUY', 'PARCEL')),
  -- null = 재고 제한 없음(상시 판매). 정해두면 주문 시 차감되고, 취소/환불 시 복구된다.
  stock integer check (stock is null or stock >= 0),
  -- false면 고객 화면에서 숨김(삭제 없이 판매만 잠시 중단). 기본은 true.
  visible boolean not null default true,
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

-- 이벤트 리스팅별 옵션 재고 스냅샷 — event_products.stock과 같은 이유로 분리한다:
-- 같은 카탈로그 옵션값이라도 이벤트마다 독립된 재고를 가져야 하기 때문. 리스팅을
-- 이벤트에 추가하는 시점에 product_option_values.default_stock을 복사해
-- 초기화하고, 이후로는 이 값만 주문 시 차감/취소·환불 시 복구된다(has_stock=false인
-- 옵션값은 애초에 행이 없음 = 재고 제한 없음).
create table if not exists event_option_stock (
  event_product_id uuid not null references event_products(id) on delete cascade,
  option_value_id uuid not null references product_option_values(id) on delete cascade,
  stock integer not null check (stock >= 0),
  primary key (event_product_id, option_value_id)
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
  options jsonb not null default '[]'::jsonb
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
create or replace function lookup_guest_orders(p_name text, p_pin text)
returns setof orders
language sql
security definer
set search_path = public
as $$
  select * from orders
  where guest_pin = p_pin
    and lower(coalesce(guest_name, recipient_name)) = lower(p_name)
  order by created_at desc;
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
    update event_products ep
    set stock = ep.stock + oi.quantity
    from order_items oi
    where oi.order_id = v_cancelled_id
      and oi.event_product_id = ep.id
      and ep.stock is not null;

    -- 옵션값별 재고도 리스팅 재고와 마찬가지로 복구한다 — 주문 아이템의
    -- options 스냅샷에 담긴 optionValueId로 event_option_stock 행을 찾는다
    -- (has_stock=false였던 옵션값은 애초에 행이 없어 조용히 무시됨).
    update event_option_stock eos
    set stock = eos.stock + oi.quantity
    from order_items oi, jsonb_array_elements(oi.options) as opt
    where oi.order_id = v_cancelled_id
      and eos.event_product_id = oi.event_product_id
      and eos.option_value_id = (opt->>'optionValueId')::uuid;
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
  p_items jsonb
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

  insert into orders (
    id, order_number, event_id, batch_id, profile_id, guest_name, guest_phone, guest_pin,
    recipient_name, recipient_phone, address_snapshot, apartment_name, payment_method, status, total, created_at
  ) values (
    p_id, p_order_number, p_event_id, p_batch_id, p_profile_id, p_guest_name, p_guest_phone, p_guest_pin,
    p_recipient_name, p_recipient_phone, p_address_snapshot, p_apartment_name, p_payment_method, 'wait', p_total, p_created_at
  );

  insert into order_items (order_id, event_product_id, product_name, price_snapshot, quantity, options)
  select
    p_id,
    nullif(i->>'event_product_id', '')::uuid,
    i->>'product_name',
    (i->>'price_snapshot')::integer,
    (i->>'quantity')::integer,
    coalesce(i->'options', '[]'::jsonb)
  from jsonb_array_elements(p_items) as i;
end;
$$;

-- 재고 차감/복구: 주문 생성 시 차감, 취소/환불 시 복구. 리스팅(event_products)의
-- stock이 null인 경우(재고 제한 없음)는 그대로 null 유지. 0 밑으로는 안 내려감.
create or replace function decrement_stock(p_event_product_id uuid, p_qty integer)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  update event_products set stock = greatest(stock - p_qty, 0) where id = p_event_product_id and stock is not null;
end;
$$;

create or replace function increment_stock(p_event_product_id uuid, p_qty integer)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  update event_products set stock = stock + p_qty where id = p_event_product_id and stock is not null;
end;
$$;

-- 옵션값별 재고 차감/복구 — has_stock=false인 옵션값은 애초에 event_option_stock에
-- 행이 없으므로 update가 그냥 0 rows에 적용되고 조용히 아무 일도 안 한다(재고
-- 제한 없음과 동일한 동작).
create or replace function decrement_option_stock(p_event_product_id uuid, p_option_value_id uuid, p_qty integer)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  update event_option_stock set stock = greatest(stock - p_qty, 0)
  where event_product_id = p_event_product_id and option_value_id = p_option_value_id;
end;
$$;

create or replace function increment_option_stock(p_event_product_id uuid, p_option_value_id uuid, p_qty integer)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  update event_option_stock set stock = stock + p_qty
  where event_product_id = p_event_product_id and option_value_id = p_option_value_id;
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
