-- 보글마켓 Supabase schema
-- Run this in the Supabase SQL editor after creating your project.

create extension if not exists "pgcrypto";

-- Profiles (1:1 with auth.users)
create table if not exists profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text not null,
  name text not null default '',
  phone text not null default '',
  is_admin boolean not null default false,
  created_at timestamptz not null default now()
);

-- Saved addresses. profile_id is null for guest orders (snapshot lives on the order itself).
create table if not exists addresses (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid references profiles(id) on delete cascade,
  name text not null,
  phone text not null,
  address text not null,
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

-- Anyone can read event/product catalog
create policy "events are publicly readable" on events for select using (true);
create policy "products are publicly readable" on products for select using (true);

-- Only admins can write the catalog
create policy "admins manage events" on events for all
  using (exists (select 1 from profiles where id = auth.uid() and is_admin))
  with check (exists (select 1 from profiles where id = auth.uid() and is_admin));
create policy "admins manage products" on products for all
  using (exists (select 1 from profiles where id = auth.uid() and is_admin))
  with check (exists (select 1 from profiles where id = auth.uid() and is_admin));

-- Profiles: user manages their own row; admins can read all
create policy "user reads own profile" on profiles for select using (auth.uid() = id);
create policy "user updates own profile" on profiles for update using (auth.uid() = id);
create policy "admins read all profiles" on profiles for select
  using (exists (select 1 from profiles p where p.id = auth.uid() and p.is_admin));

-- Addresses: owner only
create policy "user manages own addresses" on addresses for all
  using (profile_id = auth.uid())
  with check (profile_id = auth.uid());

-- Orders: signed-in users see their own orders; admins see everything.
-- Guest orders (profile_id is null) are looked up via order number + phone through
-- a dedicated RPC (see below) rather than direct table access.
create policy "user reads own orders" on orders for select using (profile_id = auth.uid());
create policy "user creates own orders" on orders for insert with check (profile_id = auth.uid() or profile_id is null);
create policy "admins manage orders" on orders for all
  using (exists (select 1 from profiles where id = auth.uid() and is_admin))
  with check (exists (select 1 from profiles where id = auth.uid() and is_admin));

create policy "user reads own order items" on order_items for select
  using (exists (select 1 from orders o where o.id = order_id and o.profile_id = auth.uid()));
create policy "user creates own order items" on order_items for insert
  with check (exists (select 1 from orders o where o.id = order_id));
create policy "admins manage order items" on order_items for all
  using (exists (select 1 from profiles where id = auth.uid() and is_admin))
  with check (exists (select 1 from profiles where id = auth.uid() and is_admin));

-- Guest order lookup: order number + last 4 digits of phone, no auth required.
create or replace function lookup_guest_order(p_order_number text, p_phone_last4 text)
returns setof orders
language sql
security definer
set search_path = public
as $$
  select * from orders
  where order_number = p_order_number
    and right(coalesce(guest_phone, recipient_phone), 4) = p_phone_last4;
$$;

-- Create the first admin manually after signing up, e.g.:
-- update profiles set is_admin = true where email = 'you@example.com';
