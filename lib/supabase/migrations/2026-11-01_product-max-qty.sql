-- 2026-11-01: 상품별 최대 구매 수량(주문 1건당, 옵션 합계)
-- 개발(STG)·운영(prod) Supabase SQL 에디터에서 각각 한 번씩 실행한다. 여러 번 실행해도 안전.
-- ⚠️ 코드 배포보다 먼저 실행해야 한다(목록 화면이 max_qty 컬럼을 조회함).
-- lib/supabase/schema.sql에도 같은 내용이 반영되어 있다.
alter table products add column if not exists max_qty integer check (max_qty is null or max_qty >= 1);

-- create_order에 최대 구매 수량 서버 검증 추가(인자는 그대로라 create or replace).
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

  -- 개별 상품 마감(event_products.closed, 즉시 수동 마감) + 리스팅별 예약
  -- 마감시간(order_deadline_at, 지났으면 자동 마감) 서버 검증 — 관리자가
  -- 예약상품처럼 이벤트 전체보다 먼저 마감해야 하는 상품 하나만 처리했을
  -- 때, RPC를 직접 호출하는 경로까지 대비해 여기서 막는다. `select ... into`
  -- 대신 `for ... in (...) loop`를 쓰는 이유: Supabase Studio SQL 에디터가
  -- 최상위 `select ... into <이름>`을 "새 테이블 생성"으로 잘못 인식해 RLS
  -- 활성화 문구를 쿼리 중간에 끼워 넣어 실행 자체를 깨뜨리는 문제가 있었음
  -- (`for ... in`은 이 오탐을 트리거하지 않음).
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

  -- 최소 구매 수량 서버 검증 — 상품상세/장바구니에서 이미 막지만, RPC를 직접
  -- 호출하는 경우까지 대비해 여기서 한 번 더 막는다(체크아웃의 "서버 검증").
  -- 옵션 조합(주문 라인) 하나하나가 아니라 같은 상품(리스팅)에 담은 모든
  -- 조합의 합계로 따진다(예: 1번 옵션 1개 + 2번 옵션 2개 = 3개로 충족) —
  -- 그래서 라인별로 보지 않고 event_product_id(=상품)별로 합산한 뒤 비교한다.
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

  -- 최대 구매 수량(주문 1건당) 서버 검증 — 최소 수량과 같은 방식(상품별 합계).
  for v_bad_item in
    select p.name as name, s.qty as qty, p.max_qty as max_qty
    from (
      select ep.product_id, sum((i->>'quantity')::integer) as qty
      from jsonb_array_elements(p_items) as i
      join event_products ep on ep.id = nullif(i->>'event_product_id', '')::uuid
      group by ep.product_id
    ) s
    join products p on p.id = s.product_id
    where p.max_qty is not null and s.qty > p.max_qty
    limit 1
  loop
    raise exception '%은(는) 한 번에 최대 %개까지 주문할 수 있어요. (현재 %개)', v_bad_item.name, v_bad_item.max_qty, v_bad_item.qty;
  end loop;

  -- 재고 차감을 주문 생성과 같은 트랜잭션 안에서 수행한다 — decrement_stock/
  -- decrement_option_stock이 재고 부족 시 예외를 던지면 이 함수 전체가
  -- (지금까지 insert한 것 없이) 롤백되므로, "재고 없이 만들어진 주문"이나
  -- "차감은 됐는데 주문은 실패" 같은 불일치가 생길 수 없다. 여러 상품을 한
  -- 번에 주문할 때 뒤쪽 상품의 재고가 부족해 실패하면 앞쪽 상품에서 이미
  -- 차감한 것도 함께 되돌아간다.
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
