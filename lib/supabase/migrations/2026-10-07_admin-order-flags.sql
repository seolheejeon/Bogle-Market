-- 2026-10-07: 배송지 수정 "관리자 허용제" + 취소 거절 사유 저장 + 관리자 신규/확인 주문 구분
-- 개발(STG)·운영(prod) Supabase SQL 에디터에서 각각 한 번씩 실행한다.
-- lib/supabase/schema.sql에도 같은 내용이 반영되어 있다.

-- 1) 배송지/연락처 수정은 관리자가 그 주문에 한해 열어줬을 때만 — 손님이 중간에
--    마음대로 바꾸면 안 되므로. 손님이 한 번 수정하면 다시 잠긴다(delivery_edit_open=false),
--    수정 시각은 delivery_edited_at에 남겨 관리자 화면에 "배송지 수정됨"으로 표시.
alter table orders add column if not exists delivery_edit_open boolean not null default false;
alter table orders add column if not exists delivery_edited_at timestamptz;

-- 2) 취소 요청 거절 사유 — 예전엔 알림에만 담기고 주문엔 안 남아서, 알림을 안 본
--    손님은 주문 내역에서 이유를 알 수 없었다.
alter table orders add column if not exists cancel_reject_reason text;

-- 3) 관리자가 이 주문을 확인했는지 — null이면 "신규". 관리자가 주문 상세를 열거나
--    상태를 바꾸면 채워지고, 손님이 배송지를 고치면 다시 비워져 신규로 올라온다.
alter table orders add column if not exists admin_checked_at timestamptz;
-- 이 컬럼이 생기기 전 주문 중 입금대기가 아닌 건 이미 처리 중이므로 확인한 것으로 둔다
-- (입금대기 주문만 신규로 남는다). 컬럼이 처음 생길 때 한 번만 의미가 있다.
update orders set admin_checked_at = now() where admin_checked_at is null and status <> 'wait';

-- 비회원 조회가 위 값들(수정 허용 여부, 거절 사유 등)도 돌려주도록 — 반환 컬럼이
-- 바뀌어 지우고 다시 만든다.
drop function if exists lookup_guest_orders(text, text);
create or replace function lookup_guest_orders(p_name text, p_pin text)
returns table (
  id uuid, order_number text, event_id uuid, batch_id uuid, profile_id uuid,
  guest_name text, guest_phone text, guest_pin text, recipient_name text, recipient_phone text,
  address_snapshot text, road_address text, detail_address text, entrance_method text, delivery_memo text,
  apartment_name text, depositor_name text, payment_method text, status text,
  cancel_requested boolean, cancel_reason text, cancel_reject_reason text, courier_code text, tracking_number text,
  refund_reason text, refund_reason_detail text, refund_photo_url text, refund_requested_at timestamptz,
  refund_reject_reason text, delivery_edit_open boolean, delivery_edited_at timestamptz,
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
    o.cancel_requested, o.cancel_reason, o.cancel_reject_reason, o.courier_code, o.tracking_number,
    o.refund_reason, o.refund_reason_detail, o.refund_photo_url, o.refund_requested_at,
    o.refund_reject_reason, o.delivery_edit_open, o.delivery_edited_at,
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

-- 손님의 배송지/연락처/입금자명 수정 — 이제 마감 시각이 아니라 관리자가 열어준
-- 주문(delivery_edit_open)만, 배송 시작 전(wait/paid/confirmed)까지 허용한다.
-- 한 번 고치면 다시 잠그고, 관리자 화면에 신규로 다시 올라오게 확인 표시를 비운다.
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
      depositor_name = nullif(trim(p_depositor_name), ''),
      delivery_edit_open = false,
      delivery_edited_at = now(),
      admin_checked_at = null
  where o.id = p_order_id
    and (
      (auth.uid() is not null and o.profile_id = auth.uid())
      or (o.profile_id is null and o.guest_pin = p_pin and lower(coalesce(o.guest_name, o.recipient_name)) = lower(p_name))
    )
    and o.delivery_edit_open
    and o.status in ('wait', 'paid', 'confirmed')
    and o.cancel_requested = false
  returning o.id into v_id;

  if v_id is null then
    raise exception '지금은 배송지를 수정할 수 없어요. 변경이 필요하면 문의하기로 요청해 주세요.';
  end if;
end;
$$;
