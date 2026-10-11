-- 2026-10-11: 쿠폰(코드 입력형)
-- 개발(STG)·운영(prod) Supabase SQL 에디터에서 각각 한 번씩 실행한다. 여러 번 실행해도 안전.
-- lib/supabase/schema.sql에도 같은 내용이 반영되어 있다.

-- 쿠폰 — 관리자가 만들고, 손님은 결제 화면에서 코드를 넣어 쓴다(비회원도 가능).
-- 할인 계산은 화면(lib/coupon.ts)이 하고, create_order가 같은 규칙으로 다시 검사한다.
create table if not exists coupons (
  id uuid primary key default gen_random_uuid(),
  code text not null,
  name text not null default '',
  discount_type text not null check (discount_type in ('fixed', 'percent')),
  amount integer not null check (amount > 0),           -- 정액이면 원, 정률이면 %
  max_discount integer check (max_discount is null or max_discount > 0), -- 정률일 때 최대 할인액
  min_order_amount integer not null default 0 check (min_order_amount >= 0),
  starts_at timestamptz,
  ends_at timestamptz,
  usage_limit integer check (usage_limit is null or usage_limit > 0),          -- 전체 선착순 수량(null = 무제한)
  per_customer_limit integer check (per_customer_limit is null or per_customer_limit > 0), -- 1인 사용 횟수(null = 무제한)
  delivery_types text[],                                 -- 사용 가능 배송방식(null/빈 배열 = 전부)
  stackable boolean not null default true,               -- 상품 구간 할인·여러 품목 할인과 같이 쓰기
  active boolean not null default true,
  created_at timestamptz not null default now()
);
create unique index if not exists coupons_code_upper_idx on coupons (upper(code));

-- 쿠폰을 쓴 주문 — 취소/환불된 주문의 사용분은 수량 계산에서 빠진다(다시 쓸 수 있음).
-- customer_key: 회원은 profile id, 비회원은 숫자만 남긴 연락처.
create table if not exists coupon_redemptions (
  id uuid primary key default gen_random_uuid(),
  coupon_id uuid not null references coupons(id) on delete cascade,
  order_id uuid not null references orders(id) on delete cascade,
  customer_key text not null,
  amount integer not null default 0,
  created_at timestamptz not null default now()
);
create index if not exists coupon_redemptions_coupon_idx on coupon_redemptions (coupon_id);

alter table orders add column if not exists coupon_code text;
alter table orders add column if not exists coupon_discount integer not null default 0;

alter table coupons enable row level security;
alter table coupon_redemptions enable row level security;
drop policy if exists "admins manage coupons" on coupons;
create policy "admins manage coupons" on coupons for all using (is_admin()) with check (is_admin());
drop policy if exists "admins read coupon redemptions" on coupon_redemptions;
create policy "admins read coupon redemptions" on coupon_redemptions for select using (is_admin());

-- 손님이 결제 화면에서 쿠폰 코드를 확인할 때 — 쿠폰 표는 손님이 직접 못 읽게(코드 목록
-- 노출 방지) 막고, 이 함수가 그 코드 하나의 사용 조건만 돌려준다. 실제 차감 금액
-- 계산은 화면이, 최종 검사는 create_order가 한다.
create or replace function validate_coupon(p_code text, p_phone text default null, p_event_type text default null)
returns jsonb
language plpgsql
security definer
stable
set search_path = public
as $$
declare
  v_coupon record;
  v_key text;
  v_used integer;
begin
  for v_coupon in select * from coupons where upper(code) = upper(trim(p_code)) loop
    if not v_coupon.active or (v_coupon.starts_at is not null and v_coupon.starts_at > now()) or (v_coupon.ends_at is not null and v_coupon.ends_at < now()) then
      return jsonb_build_object('ok', false, 'message', '사용 기간이 아니거나 종료된 쿠폰이에요.');
    end if;
    if p_event_type is not null and v_coupon.delivery_types is not null and array_length(v_coupon.delivery_types, 1) > 0
       and not (p_event_type = any(v_coupon.delivery_types)) then
      return jsonb_build_object('ok', false, 'message', '이 배송방식에는 쓸 수 없는 쿠폰이에요.');
    end if;
    if v_coupon.usage_limit is not null then
      v_used := (select count(*) from coupon_redemptions r join orders o on o.id = r.order_id
       where r.coupon_id = v_coupon.id and o.status not in ('cancelled', 'refunded'));
      if v_used >= v_coupon.usage_limit then
        return jsonb_build_object('ok', false, 'message', '선착순 쿠폰이 모두 소진됐어요.');
      end if;
    end if;
    v_key := coalesce(auth.uid()::text, nullif(regexp_replace(coalesce(p_phone, ''), '\D', '', 'g'), ''));
    if v_coupon.per_customer_limit is not null and v_key is not null then
      v_used := (select count(*) from coupon_redemptions r join orders o on o.id = r.order_id
       where r.coupon_id = v_coupon.id and r.customer_key = v_key and o.status not in ('cancelled', 'refunded'));
      if v_used >= v_coupon.per_customer_limit then
        return jsonb_build_object('ok', false, 'message', '이미 사용한 쿠폰이에요.');
      end if;
    end if;
    return jsonb_build_object(
      'ok', true, 'code', v_coupon.code, 'name', v_coupon.name, 'discountType', v_coupon.discount_type,
      'amount', v_coupon.amount, 'maxDiscount', v_coupon.max_discount, 'minOrderAmount', v_coupon.min_order_amount,
      'deliveryTypes', v_coupon.delivery_types, 'stackable', v_coupon.stackable
    );
  end loop;
  return jsonb_build_object('ok', false, 'message', '없는 쿠폰 코드예요.');
end;
$$;

-- create_order에 p_coupon_code/p_coupon_discount 추가 — 인자 개수가 바뀌어 예전 23개짜리를 지우고 다시 만든다.
drop function if exists create_order(uuid, text, uuid, uuid, uuid, text, text, text, text, text, text, text, text, integer, timestamptz, jsonb, integer, text, text, text, text, integer, text);
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
  p_shipping_fee integer default 0,
  p_road_address text default null,
  p_detail_address text default null,
  p_entrance_method text default null,
  p_delivery_memo text default null,
  p_discount_total integer default 0,
  p_depositor_name text default null,
  p_coupon_code text default null,
  p_coupon_discount integer default 0
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_bad_item record;
  v_closed_item record;
  v_item jsonb;
  v_event_product_id uuid;
  v_qty integer;
  v_stock_value_ids uuid[];
  v_coupon record;
  v_coupon_found boolean;
  v_coupon_id uuid;
  v_coupon_code text;
  v_coupon_key text;
  v_coupon_subtotal integer;
  v_coupon_max integer;
begin
  if p_profile_id is not null and p_profile_id <> auth.uid() then
    raise exception 'profile_id must match the authenticated user';
  end if;

  -- 회차(이벤트) 마감 서버 검증(2026-10-11) — 화면(장바구니/체크아웃)에서도 막지만
  -- RPC를 직접 부르는 경우까지 막는 최종 방어선. lib/order-policy.ts의
  -- isEventOrderable과 같은 기준: 관리자가 종료(status='ended')했으면 항상,
  -- 사다드림(GROUP_BUY)은 마감 시각이 지나면 주문 불가. 문고리(재고 있으면
  -- 마감 후에도 허용)/택배(상시 판매)는 마감 시각만으로는 막지 않는다.
  for v_closed_item in
    select e.title as name
    from events e
    where e.id = p_event_id
      and (e.status = 'ended' or (e.type = 'GROUP_BUY' and e.deadline_at <= now()))
  loop
    raise exception '"%"은(는) 주문이 마감되어 더 이상 주문할 수 없어요.', v_closed_item.name;
  end loop;

  for v_closed_item in
    select p.name
    from jsonb_array_elements(p_items) as i
    join event_products ep on ep.id = nullif(i->>'event_product_id', '')::uuid
    join products p on p.id = ep.product_id
    where ep.closed or (ep.order_deadline_at is not null and ep.order_deadline_at <= now())
    limit 1
  loop
    raise exception '%은(는) 마감되어 더 이상 주문할 수 없어요.', v_closed_item.name;
  end loop;

  for v_bad_item in
    select p.name as name, s.qty as qty, p.min_qty as min_qty
    from (
      select ep.product_id, sum((i->>'quantity')::integer) as qty
      from jsonb_array_elements(p_items) as i
      join event_products ep on ep.id = nullif(i->>'event_product_id', '')::uuid
      group by ep.product_id
    ) s
    join products p on p.id = s.product_id
    where s.qty < p.min_qty
    limit 1
  loop
    raise exception '%은(는) 최소 %개부터 주문할 수 있어요. (현재 %개)', v_bad_item.name, v_bad_item.min_qty, v_bad_item.qty;
  end loop;

  for v_item in select * from jsonb_array_elements(p_items) loop
    v_event_product_id := nullif(v_item->>'event_product_id', '')::uuid;
    if v_event_product_id is null then
      continue;
    end if;
    v_qty := (v_item->>'quantity')::integer;
    perform decrement_stock(v_event_product_id, v_qty);
    v_stock_value_ids := (select array_agg(x::uuid) from jsonb_array_elements_text(coalesce(v_item->'stock_value_ids', '[]'::jsonb)) x);
    if v_stock_value_ids is not null and array_length(v_stock_value_ids, 1) > 0 then
      perform decrement_option_stock(v_event_product_id, v_stock_value_ids, v_qty);
    end if;
  end loop;

  -- 쿠폰 서버 검증(2026-10-11) — 화면에서 계산한 쿠폰 할인이 규칙에 맞는지 다시 본다.
  -- 쿠폰 행을 for update로 잠가서, 선착순/1인 횟수 제한이 동시 주문에도 정확히 지켜진다.
  if nullif(trim(coalesce(p_coupon_code, '')), '') is not null then
    v_coupon_found := false;
    for v_coupon in select * from coupons where upper(code) = upper(trim(p_coupon_code)) for update loop
      v_coupon_found := true;
      if not v_coupon.active or (v_coupon.starts_at is not null and v_coupon.starts_at > now()) or (v_coupon.ends_at is not null and v_coupon.ends_at < now()) then
        raise exception '사용 기간이 아니거나 종료된 쿠폰이에요.';
      end if;
      if v_coupon.delivery_types is not null and array_length(v_coupon.delivery_types, 1) > 0
         and not ((select e.type from events e where e.id = p_event_id) = any(v_coupon.delivery_types)) then
        raise exception '이 배송방식에는 쓸 수 없는 쿠폰이에요.';
      end if;
      v_coupon_subtotal := (select coalesce(sum((i->>'price_snapshot')::integer * (i->>'quantity')::integer), 0) from jsonb_array_elements(p_items) as i);
      if v_coupon_subtotal < v_coupon.min_order_amount then
        raise exception '쿠폰 최소 주문금액(%원)을 채우지 못했어요.', v_coupon.min_order_amount;
      end if;
      v_coupon_max := case when v_coupon.discount_type = 'fixed' then v_coupon.amount
                           else least(floor(v_coupon_subtotal * v_coupon.amount / 100.0)::integer, coalesce(v_coupon.max_discount, 2147483647)) end;
      if coalesce(p_coupon_discount, 0) < 0 or coalesce(p_coupon_discount, 0) > v_coupon_max then
        raise exception '쿠폰 할인 금액이 맞지 않아요. 다시 시도해 주세요.';
      end if;
      if not v_coupon.stackable and coalesce(p_discount_total, 0) <> coalesce(p_coupon_discount, 0) then
        raise exception '이 쿠폰은 다른 할인과 함께 쓸 수 없어요.';
      end if;
      if v_coupon.usage_limit is not null and (
        select count(*) from coupon_redemptions r join orders o on o.id = r.order_id
         where r.coupon_id = v_coupon.id and o.status not in ('cancelled', 'refunded')) >= v_coupon.usage_limit then
        raise exception '선착순 쿠폰이 모두 소진됐어요.';
      end if;
      v_coupon_key := coalesce(p_profile_id::text, nullif(regexp_replace(coalesce(p_guest_phone, p_recipient_phone, ''), '\D', '', 'g'), ''), 'unknown');
      if v_coupon.per_customer_limit is not null and (
        select count(*) from coupon_redemptions r join orders o on o.id = r.order_id
         where r.coupon_id = v_coupon.id and r.customer_key = v_coupon_key and o.status not in ('cancelled', 'refunded')) >= v_coupon.per_customer_limit then
        raise exception '이미 사용한 쿠폰이에요.';
      end if;
      v_coupon_id := v_coupon.id;
      v_coupon_code := v_coupon.code;
    end loop;
    if not v_coupon_found then
      raise exception '없는 쿠폰 코드예요.';
    end if;
  end if;

  insert into orders (
    id, order_number, event_id, batch_id, profile_id, guest_name, guest_phone, guest_pin,
    recipient_name, recipient_phone, address_snapshot, road_address, detail_address, entrance_method, delivery_memo,
    apartment_name, payment_method, status, total, shipping_fee, discount_total, depositor_name, coupon_code, coupon_discount, created_at
  ) values (
    p_id, p_order_number, p_event_id, p_batch_id, p_profile_id, p_guest_name, p_guest_phone, p_guest_pin,
    p_recipient_name, p_recipient_phone, p_address_snapshot, p_road_address, p_detail_address, p_entrance_method, p_delivery_memo,
    p_apartment_name, p_payment_method, 'wait', p_total, p_shipping_fee, p_discount_total, nullif(trim(p_depositor_name), ''), v_coupon_code, case when v_coupon_id is null then 0 else coalesce(p_coupon_discount, 0) end, p_created_at
  );

  if v_coupon_id is not null then
    insert into coupon_redemptions (coupon_id, order_id, customer_key, amount)
    values (v_coupon_id, p_id, v_coupon_key, coalesce(p_coupon_discount, 0));
  end if;

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
