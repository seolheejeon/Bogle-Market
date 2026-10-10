-- 2026-10-11: 주문 생성 시 회차(이벤트) 마감 서버 검증
-- 개발(STG)·운영(prod) Supabase SQL 에디터에서 각각 한 번씩 실행한다. 여러 번 실행해도 안전.
-- lib/supabase/schema.sql에도 같은 내용이 반영되어 있다.
--
-- 예전엔 상품별 마감(수동 마감·상품별 마감시간)만 서버에서 막고, 회차 전체 마감은
-- 화면에서만 막았다. 인자는 그대로라 create or replace로 함수 본문만 바꾼다.
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
