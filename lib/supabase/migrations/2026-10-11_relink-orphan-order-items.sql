-- 2026-10-11: 회차에서 상품을 뺐다 다시 넣어 끊긴 주문 상품 줄을 다시 잇기(데이터 복구, 1회성)
-- 운영(prod) Supabase SQL 에디터에서 실행. 여러 번 실행해도 안전(이미 이어진 줄은 안 건드림).
--
-- event_products를 지우면 order_items.event_product_id가 on delete set null로 비어서,
-- 그 주문들이 매출 원가·인기상품 집계에서 빠진다. 같은 회차(event_id)에 같은 이름의
-- 상품이 정확히 하나 있을 때만 그 리스팅으로 다시 잇는다(애매하면 건드리지 않음).
update order_items oi
set event_product_id = m.ep_id
from (
  select oi2.id as item_id, min(ep.id::text)::uuid as ep_id
  from order_items oi2
  join orders o on o.id = oi2.order_id
  join event_products ep on ep.event_id = o.event_id
  join products p on p.id = ep.product_id and p.name = oi2.product_name
  where oi2.event_product_id is null
  group by oi2.id
  having count(*) = 1
) m
where oi.id = m.item_id;
