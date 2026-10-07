-- 2026-10-07: 예전 create_order 오버로드(21개 인자, p_discount_total 이전 버전) 정리
-- 개발 DB에만 남아 있던 것으로, 일부 인자를 생략한 호출이 "어느 함수를 쓸지
-- 모르겠다(PGRST203)"로 실패하게 만든다. 앱은 항상 모든 인자를 넘겨서 실제
-- 주문엔 영향이 없었지만 혼란을 막기 위해 지운다. 없는 DB에서 실행해도 안전.
drop function if exists create_order(uuid, text, uuid, uuid, uuid, text, text, text, text, text, text, text, text, integer, timestamptz, jsonb, integer, text, text, text, text);
