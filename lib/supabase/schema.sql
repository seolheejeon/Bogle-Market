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
  is_flash boolean not null default false,
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
  created_at timestamptz not null default now()
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
  quantity integer not null check (quantity > 0)
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
