-- 2026-10-11: 관리자가 회원 배송지를 읽을 수 있게
-- 개발(STG)·운영(prod) Supabase SQL 에디터에서 각각 한 번씩 실행한다. 여러 번 실행해도 안전.
-- lib/supabase/schema.sql에도 같은 내용이 반영되어 있다.
--
-- addresses에는 "본인만 읽기/쓰기" 정책만 있어서, 관리자 고객 관리 화면/고객 상세
-- 모달의 기본 배송지가 항상 "등록된 배송지 없음"으로 보였다(회원은 제대로 저장돼
-- 있었음). 주문/회원 정보처럼 관리자는 읽을 수 있게 한다(수정은 여전히 본인만).
drop policy if exists "admins read addresses" on addresses;
create policy "admins read addresses" on addresses for select using (is_admin());
