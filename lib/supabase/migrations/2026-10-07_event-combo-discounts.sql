-- 2026-10-07: 함께 구매 할인(이벤트 단위)
-- 개발(STG)·운영(prod) Supabase SQL 에디터에서 각각 한 번씩 실행한다. 여러 번 실행해도 안전.
-- lib/supabase/schema.sql에도 같은 내용이 반영되어 있다.

-- 같은 회차에서 여러 상품을 같이 사면 주문 총액에서 추가로 깎아주는 규칙 목록.
-- [{ "id": "...", "items": [{ "catalogProductId": "...", "qty": 1 }, ...], "amountOff": 1000 }]
-- 계산은 lib/discount.ts(calculateComboDiscounts)가 하고, 결과는 주문의
-- discount_total 스냅샷에 상품 수량 할인과 합쳐서 기록된다.
alter table events add column if not exists combo_discounts jsonb not null default '[]'::jsonb;
