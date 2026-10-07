-- 2026-10-07: 주문 후 배송지/연락처 수정 + 입금자명
-- 개발(STG)·운영(prod) Supabase SQL 에디터에서 각각 한 번씩 실행한다.
-- 여러 번 실행해도 안전하다(if not exists / drop if exists).
-- lib/supabase/schema.sql에도 같은 내용이 반영되어 있다.

-- 1) 입금자명 — 받는 분과 입금하는 사람이 다를 때(가족 계좌 등) 관리자가
--    입금 내역과 주문을 맞추기 위한 값. 비어 있으면 받는 분 이름으로 입금한 것.
alter table orders add column if not exists depositor_name text;

-- 2) create_order에 p_depositor_name 추가 — 인자 개수가 바뀌어 기존 22개짜리
--    시그니처가 별도 오버로드로 남지 않도록 먼저 지우고 다시 만든다.
drop function if exists create_order(uuid, text, uuid, uuid, uuid, text, text, text, text, text, text, text, text, integer, timestamptz, jsonb, integer, text, text, text, text, integer);
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
  p_depositor_name text default null
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
begin
  if p_profile_id is not null and p_profile_id <> auth.uid() then
    raise exception 'profile_id must match the authenticated user';
  end if;

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

  insert into orders (
    id, order_number, event_id, batch_id, profile_id, guest_name, guest_phone, guest_pin,
    recipient_name, recipient_phone, address_snapshot, road_address, detail_address, entrance_method, delivery_memo,
    apartment_name, payment_method, status, total, shipping_fee, discount_total, depositor_name, created_at
  ) values (
    p_id, p_order_number, p_event_id, p_batch_id, p_profile_id, p_guest_name, p_guest_phone, p_guest_pin,
    p_recipient_name, p_recipient_phone, p_address_snapshot, p_road_address, p_detail_address, p_entrance_method, p_delivery_memo,
    p_apartment_name, p_payment_method, 'wait', p_total, p_shipping_fee, p_discount_total, nullif(trim(p_depositor_name), ''), p_created_at
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

-- 3) 비회원 조회가 배송지 구성요소/입금자명/배송비/할인까지 돌려주도록 확장 —
--    주문 상세의 "배송지 수정" 폼을 기존 값으로 채우려면 필요하다. 반환
--    컬럼이 바뀌어 create or replace가 안 되므로 지우고 다시 만든다.
drop function if exists lookup_guest_orders(text, text);
create or replace function lookup_guest_orders(p_name text, p_pin text)
returns table (
  id uuid, order_number text, event_id uuid, batch_id uuid, profile_id uuid,
  guest_name text, guest_phone text, guest_pin text, recipient_name text, recipient_phone text,
  address_snapshot text, road_address text, detail_address text, entrance_method text, delivery_memo text,
  apartment_name text, depositor_name text, payment_method text, status text,
  cancel_requested boolean, cancel_reason text, courier_code text, tracking_number text,
  refund_reason text, refund_reason_detail text, refund_photo_url text, refund_requested_at timestamptz,
  refund_reject_reason text,
  total integer, shipping_fee integer, discount_total integer, created_at timestamptz, items jsonb
)
language sql
security definer
set search_path = public
as $$
  select
    o.id, o.order_number, o.event_id, o.batch_id, o.profile_id,
    o.guest_name, o.guest_phone, o.guest_pin, o.recipient_name, o.recipient_phone,
    o.address_snapshot, o.road_address, o.detail_address, o.entrance_method, o.delivery_memo,
    o.apartment_name, o.depositor_name, o.payment_method, o.status,
    o.cancel_requested, o.cancel_reason, o.courier_code, o.tracking_number,
    o.refund_reason, o.refund_reason_detail, o.refund_photo_url, o.refund_requested_at,
    o.refund_reject_reason,
    o.total, o.shipping_fee, o.discount_total, o.created_at,
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

-- 4) 홈 "인기상품" 순위용 — 취소 안 된 주문 수량 합계가 많은 리스팅 순서대로
--    id만 돌려준다(판매 수량 자체는 노출하지 않음). order_items는 RLS로 본인
--    주문만 보이므로 집계는 SECURITY DEFINER로 한다.
create or replace function popular_listing_ids()
returns table (event_product_id uuid)
language sql
security definer
stable
set search_path = public
as $$
  select oi.event_product_id
  from order_items oi
  join orders o on o.id = oi.order_id
  where o.status <> 'cancelled' and oi.event_product_id is not null
  group by oi.event_product_id
  order by sum(oi.quantity) desc
  limit 200;
$$;

-- 5) 고객이 주문 후 배송지/연락처/입금자명을 직접 고치는 RPC — 회원은 본인
--    주문(auth.uid()), 비회원은 이름+PIN으로 확인한다. 아직 발주확인 전
--    (wait/paid)이고 이벤트 마감 전일 때만 허용(택배는 마감 개념이 없어 발주확인
--    전까지). 회원 RLS 정책은 status 전환만 허용하므로 회원도 이 RPC를 쓴다.
--    guest_name은 건드리지 않아서 받는 분 이름을 바꿔도 기존 이름+PIN 조회는 그대로 된다.
create or replace function update_order_delivery(
  p_order_id uuid,
  p_name text,
  p_pin text,
  p_recipient_name text,
  p_recipient_phone text,
  p_address_snapshot text,
  p_road_address text,
  p_detail_address text,
  p_entrance_method text,
  p_delivery_memo text,
  p_apartment_name text,
  p_depositor_name text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
begin
  update orders o
  set recipient_name = p_recipient_name,
      recipient_phone = p_recipient_phone,
      address_snapshot = p_address_snapshot,
      road_address = p_road_address,
      detail_address = p_detail_address,
      entrance_method = nullif(trim(p_entrance_method), ''),
      delivery_memo = nullif(trim(p_delivery_memo), ''),
      apartment_name = nullif(trim(p_apartment_name), ''),
      depositor_name = nullif(trim(p_depositor_name), '')
  from events e
  where o.id = p_order_id
    and e.id = o.event_id
    and (
      (auth.uid() is not null and o.profile_id = auth.uid())
      or (o.profile_id is null and o.guest_pin = p_pin and lower(coalesce(o.guest_name, o.recipient_name)) = lower(p_name))
    )
    and o.status in ('wait', 'paid')
    and o.cancel_requested = false
    and e.status <> 'ended'
    and (e.type = 'PARCEL' or e.deadline_at > now())
  returning o.id into v_id;

  if v_id is null then
    raise exception '주문 마감이 지났거나 이미 발주가 확인된 주문이라 수정할 수 없어요. 변경이 필요하면 문의해 주세요.';
  end if;
end;
$$;
