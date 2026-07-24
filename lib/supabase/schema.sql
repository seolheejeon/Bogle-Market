-- 보글마켓 Supabase schema
-- Run this in the Supabase SQL editor after creating your project.

create extension if not exists "pgcrypto";

-- Profiles (1:1 with auth.users). No email is ever shown to the user — signup
-- collects a username, and auth-context.tsx synthesizes `${username}@bogle.internal`
-- purely so Supabase Auth (which requires an email-shaped identifier) has
-- something to key on. The real email lives only in auth.users, never here.
create table if not exists profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  username text not null unique,
  nickname text not null default '',
  phone text not null unique,
  is_admin boolean not null default false,
  created_at timestamptz not null default now()
);

-- Saved addresses. profile_id is null for guest orders (snapshot lives on the
-- order itself). Only ever one row per member for now (the member's single
-- 기본 배송지), but modeled as its own table with is_default from the start
-- so multiple saved addresses per member is a UI change, not a schema change.
create table if not exists addresses (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid references profiles(id) on delete cascade,
  name text not null,
  phone text not null,
  apartment text not null,
  dong text not null,
  ho text not null,
  entrance_method text,
  memo text,
  is_default boolean not null default false,
  created_at timestamptz not null default now()
);

create table if not exists events (
  id uuid primary key default gen_random_uuid(),
  type text not null check (type in ('DOOR', 'GROUP_BUY', 'PARCEL')),
  title text not null,
  is_flash boolean not null default false,
  deadline_at timestamptz not null,
  delivery_at timestamptz not null,
  notice text not null default '',
  created_at timestamptz not null default now()
);

create table if not exists products (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references events(id) on delete cascade,
  name text not null,
  price integer not null check (price >= 0),
  emoji text not null default '📦',
  image_url text,
  photos jsonb not null default '[]'::jsonb,
  detail_blocks jsonb not null default '[]'::jsonb,
  -- null means "inherit the parent event's delivery type" — most products
  -- don't need to override it, but a few (e.g. a mostly-문고리 event with one
  -- 택배-only item) can.
  delivery_type text check (delivery_type in ('DOOR', 'GROUP_BUY', 'PARCEL')),
  origin text,
  weight text,
  storage text,
  description text,
  created_at timestamptz not null default now()
);

create table if not exists orders (
  id uuid primary key default gen_random_uuid(),
  order_number text not null unique,
  profile_id uuid references profiles(id) on delete set null,
  guest_name text,
  guest_phone text,
  guest_pin text,
  recipient_name text not null,
  recipient_phone text not null,
  address_snapshot text not null,
  payment_method text not null check (payment_method in ('bank_transfer', 'card', 'kakaopay', 'incheon_eum')),
  status text not null default 'wait' check (status in ('wait', 'paid', 'ship', 'done', 'cancelled')),
  total integer not null check (total >= 0),
  created_at timestamptz not null default now()
);

create table if not exists order_items (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references orders(id) on delete cascade,
  product_id uuid references products(id) on delete set null,
  product_name text not null,
  price_snapshot integer not null,
  quantity integer not null check (quantity > 0)
);

-- Row Level Security --------------------------------------------------

alter table profiles enable row level security;
alter table addresses enable row level security;
alter table events enable row level security;
alter table products enable row level security;
alter table orders enable row level security;
alter table order_items enable row level security;

-- SECURITY DEFINER helper: checks admin status while bypassing RLS itself.
-- Policies must call this instead of subquerying `profiles` directly — a
-- policy on `profiles` that subqueries `profiles` (or any policy elsewhere
-- that does, combined with a policy back on `profiles`) causes Postgres to
-- report "infinite recursion detected in policy for relation profiles",
-- which PostgREST surfaces as a 500 on the *calling* query (e.g. /events).
create or replace function is_admin()
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select coalesce((select p.is_admin from profiles p where p.id = auth.uid()), false);
$$;

-- All policies are dropped-and-recreated so this whole file can be re-run
-- safely against a database that already has tables/policies from a
-- previous run (Postgres has no "create policy if not exists").

-- Anyone can read event/product catalog
drop policy if exists "events are publicly readable" on events;
create policy "events are publicly readable" on events for select using (true);
drop policy if exists "products are publicly readable" on products;
create policy "products are publicly readable" on products for select using (true);

-- Only admins can write the catalog
drop policy if exists "admins manage events" on events;
create policy "admins manage events" on events for all
  using (is_admin())
  with check (is_admin());
drop policy if exists "admins manage products" on products;
create policy "admins manage products" on products for all
  using (is_admin())
  with check (is_admin());

-- Profiles: user manages their own row; admins can read all
drop policy if exists "user reads own profile" on profiles;
create policy "user reads own profile" on profiles for select using (auth.uid() = id);
drop policy if exists "user updates own profile" on profiles;
create policy "user updates own profile" on profiles for update using (auth.uid() = id);
drop policy if exists "admins read all profiles" on profiles;
create policy "admins read all profiles" on profiles for select
  using (is_admin());

-- Addresses: owner only
drop policy if exists "user manages own addresses" on addresses;
create policy "user manages own addresses" on addresses for all
  using (profile_id = auth.uid())
  with check (profile_id = auth.uid());

-- Orders: signed-in users see their own orders; admins see everything.
-- Guest orders (profile_id is null) are looked up via name + PIN through
-- a dedicated RPC (see below) rather than direct table access.
drop policy if exists "user reads own orders" on orders;
create policy "user reads own orders" on orders for select using (profile_id = auth.uid());
drop policy if exists "user creates own orders" on orders;
create policy "user creates own orders" on orders for insert with check (profile_id = auth.uid() or profile_id is null);
drop policy if exists "admins manage orders" on orders;
create policy "admins manage orders" on orders for all
  using (is_admin())
  with check (is_admin());

drop policy if exists "user reads own order items" on order_items;
create policy "user reads own order items" on order_items for select
  using (exists (select 1 from orders o where o.id = order_id and o.profile_id = auth.uid()));
drop policy if exists "user creates own order items" on order_items;
create policy "user creates own order items" on order_items for insert
  with check (exists (select 1 from orders o where o.id = order_id));
drop policy if exists "admins manage order items" on order_items;
create policy "admins manage order items" on order_items for all
  using (is_admin())
  with check (is_admin());

-- Username/phone availability checks for the signup form's 중복확인 — plain
-- SELECT on profiles is scoped to the caller's own row (see RLS above), so
-- these SECURITY DEFINER functions exist purely to answer "is this taken?"
-- as a boolean without exposing whose it is.
create or replace function is_username_taken(p_username text)
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select exists(select 1 from profiles where username = p_username);
$$;

create or replace function is_phone_taken(p_phone text)
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select exists(select 1 from profiles where phone = p_phone);
$$;

-- Guest order lookup: name + a 4-digit PIN the guest chose at checkout, no
-- auth required. Returns every order under that name+PIN (a guest may have
-- placed more than one), unlike the old order-number lookup which only ever
-- matched a single order.
create or replace function lookup_guest_orders(p_name text, p_pin text)
returns setof orders
language sql
security definer
set search_path = public
as $$
  select * from orders
  where guest_pin = p_pin
    and lower(coalesce(guest_name, recipient_name)) = lower(p_name)
  order by created_at desc;
$$;

-- Storage: public bucket for product photos uploaded from the admin panel.
insert into storage.buckets (id, name, public)
values ('product-photos', 'product-photos', true)
on conflict (id) do nothing;

drop policy if exists "product photos are publicly readable" on storage.objects;
create policy "product photos are publicly readable" on storage.objects for select
  using (bucket_id = 'product-photos');

drop policy if exists "admins upload product photos" on storage.objects;
create policy "admins upload product photos" on storage.objects for insert
  with check (bucket_id = 'product-photos' and is_admin());

drop policy if exists "admins update product photos" on storage.objects;
create policy "admins update product photos" on storage.objects for update
  using (bucket_id = 'product-photos' and is_admin())
  with check (bucket_id = 'product-photos' and is_admin());

drop policy if exists "admins delete product photos" on storage.objects;
create policy "admins delete product photos" on storage.objects for delete
  using (bucket_id = 'product-photos' and is_admin());

-- Create the first admin manually after signing up, e.g.:
-- update profiles set is_admin = true where username = 'bogle123';
