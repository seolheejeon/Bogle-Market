-- 2026-10-11: 하루 방문자 수 기록(관리자만 조회)
-- 개발(STG)·운영(prod) Supabase SQL 에디터에서 각각 한 번씩 실행한다. 여러 번 실행해도 안전.
-- lib/supabase/schema.sql에도 같은 내용이 반영되어 있다.
--
-- 브라우저마다 임의로 만든 방문자 id(개인정보 아님, localStorage에 저장)로 하루
-- 한 줄씩 남기고, 같은 날 다시 들어오면 페이지뷰만 늘린다. 날짜는 한국 시간 기준.
-- 손님은 쓰기만(record_visit RPC) 가능하고 표를 직접 읽을 수 없다 — 조회는 관리자만.
create table if not exists site_visits (
  day date not null,
  visitor_id uuid not null,
  page_views integer not null default 1,
  first_seen_at timestamptz not null default now(),
  primary key (day, visitor_id)
);
alter table site_visits enable row level security;

drop policy if exists "admins read site visits" on site_visits;
create policy "admins read site visits" on site_visits for select using (is_admin());

create or replace function record_visit(p_visitor_id uuid)
returns void
language sql
security definer
set search_path = public
as $$
  insert into site_visits (day, visitor_id)
  values ((now() at time zone 'Asia/Seoul')::date, p_visitor_id)
  on conflict (day, visitor_id) do update set page_views = site_visits.page_views + 1;
$$;
