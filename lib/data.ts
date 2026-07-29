"use client";

// Data-access facade: reads/writes Supabase when NEXT_PUBLIC_SUPABASE_URL /
// NEXT_PUBLIC_SUPABASE_ANON_KEY are set, otherwise falls back to a
// localStorage-backed mock store (see lib/local-store.ts) so the whole app,
// including the admin panel, is testable before a real backend exists.

import { getSupabaseBrowserClient, isSupabaseConfigured } from "@/lib/supabase/client";
import { loadEvents, saveEvents, loadOrders, saveOrders, loadNotifications, saveNotifications, loadAccounts, loadStoreSettings, saveStoreSettings, genId } from "@/lib/local-store";
import type { Address, MarketEvent, NotificationItem, Order, OrderItem, OrderStatus, PaymentMethod, Product, Profile, StoreSettings } from "@/types";
import { EMPTY_STORE_SETTINGS } from "@/types";

function orderNumber(): string {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, "0");
  const d = String(now.getDate()).padStart(2, "0");
  const suffix = Date.now().toString().slice(-6);
  return `${y}${m}${d}-${suffix}`;
}

// ---------- Events / Products ----------

export async function listEvents(): Promise<MarketEvent[]> {
  if (isSupabaseConfigured) {
    const supabase = getSupabaseBrowserClient()!;
    const { data, error } = await supabase.from("events").select("*, products(*)").order("deadline_at", { ascending: true });
    if (error) throw error;
    return (data ?? []).map(mapSupabaseEvent);
  }
  return loadEvents();
}

export async function getEvent(id: string): Promise<MarketEvent | null> {
  const events = await listEvents();
  return events.find((e) => e.id === id) ?? null;
}

export async function findProductWithEvent(productId: string): Promise<{ product: Product; event: MarketEvent } | null> {
  const events = await listEvents();
  for (const event of events) {
    const product = event.products.find((p) => p.id === productId);
    if (product) return { product, event };
  }
  return null;
}

export async function createEvent(input: Omit<MarketEvent, "id" | "products">): Promise<MarketEvent> {
  if (isSupabaseConfigured) {
    const supabase = getSupabaseBrowserClient()!;
    const { data, error } = await supabase
      .from("events")
      .insert({ type: input.type, title: input.title, is_flash: input.isFlash ?? false, deadline_at: input.deadlineAt, delivery_at: input.deliveryAt, notice: input.notice })
      .select()
      .single();
    if (error) throw error;
    return { ...mapSupabaseEvent({ ...data, products: [] }) };
  }
  const events = loadEvents();
  const newEvent: MarketEvent = { ...input, id: genId("event"), products: [] };
  saveEvents([newEvent, ...events]);
  return newEvent;
}

export async function updateEvent(id: string, patch: Partial<Omit<MarketEvent, "id" | "products">>): Promise<void> {
  if (isSupabaseConfigured) {
    const supabase = getSupabaseBrowserClient()!;
    const row: Record<string, unknown> = {};
    if (patch.type !== undefined) row.type = patch.type;
    if (patch.title !== undefined) row.title = patch.title;
    if (patch.isFlash !== undefined) row.is_flash = patch.isFlash;
    if (patch.deadlineAt !== undefined) row.deadline_at = patch.deadlineAt;
    if (patch.deliveryAt !== undefined) row.delivery_at = patch.deliveryAt;
    if (patch.notice !== undefined) row.notice = patch.notice;
    const { error } = await supabase.from("events").update(row).eq("id", id);
    if (error) throw error;
    return;
  }
  const events = loadEvents();
  saveEvents(events.map((e) => (e.id === id ? { ...e, ...patch } : e)));
}

export async function deleteEvent(id: string): Promise<void> {
  if (isSupabaseConfigured) {
    const supabase = getSupabaseBrowserClient()!;
    const { error } = await supabase.from("events").delete().eq("id", id);
    if (error) throw error;
    return;
  }
  saveEvents(loadEvents().filter((e) => e.id !== id));
}

export async function addProduct(eventId: string, input: Omit<Product, "id" | "eventId">): Promise<Product> {
  if (isSupabaseConfigured) {
    const supabase = getSupabaseBrowserClient()!;
    const { data, error } = await supabase
      .from("products")
      .insert({
        event_id: eventId,
        name: input.name,
        price: input.price,
        emoji: input.emoji,
        photos: input.photos ?? [],
        detail_blocks: input.detailBlocks ?? [],
        delivery_type: input.deliveryType ?? null,
        origin: input.origin,
        weight: input.weight,
        storage: input.storage,
        description: input.description,
      })
      .select()
      .single();
    if (error) throw error;
    return mapSupabaseProduct(data);
  }
  const events = loadEvents();
  const product: Product = { ...input, id: genId("prod"), eventId };
  saveEvents(events.map((e) => (e.id === eventId ? { ...e, products: [...e.products, product] } : e)));
  return product;
}

export async function updateProduct(productId: string, patch: Partial<Product>): Promise<void> {
  if (isSupabaseConfigured) {
    const supabase = getSupabaseBrowserClient()!;
    const row: Record<string, unknown> = {};
    if (patch.name !== undefined) row.name = patch.name;
    if (patch.price !== undefined) row.price = patch.price;
    if (patch.emoji !== undefined) row.emoji = patch.emoji;
    if (patch.photos !== undefined) row.photos = patch.photos;
    if (patch.detailBlocks !== undefined) row.detail_blocks = patch.detailBlocks;
    if (patch.deliveryType !== undefined) row.delivery_type = patch.deliveryType ?? null;
    if (patch.origin !== undefined) row.origin = patch.origin;
    if (patch.weight !== undefined) row.weight = patch.weight;
    if (patch.storage !== undefined) row.storage = patch.storage;
    if (patch.description !== undefined) row.description = patch.description;
    const { error } = await supabase.from("products").update(row).eq("id", productId);
    if (error) throw error;
    return;
  }
  const events = loadEvents();
  saveEvents(events.map((e) => ({ ...e, products: e.products.map((p) => (p.id === productId ? { ...p, ...patch } : p)) })));
}

export async function deleteProduct(productId: string): Promise<void> {
  if (isSupabaseConfigured) {
    const supabase = getSupabaseBrowserClient()!;
    const { error } = await supabase.from("products").delete().eq("id", productId);
    if (error) throw error;
    return;
  }
  const events = loadEvents();
  saveEvents(events.map((e) => ({ ...e, products: e.products.filter((p) => p.id !== productId) })));
}

// ---------- Notifications ----------
// profileId null (viewer not logged in) only ever returns broadcasts;
// logged-in viewers get broadcasts plus whatever's personally addressed to them.

export async function listNotifications(profileId: string | null): Promise<NotificationItem[]> {
  if (isSupabaseConfigured) {
    const supabase = getSupabaseBrowserClient()!;
    let query = supabase.from("notifications").select("*").order("created_at", { ascending: false });
    query = profileId ? query.or(`profile_id.is.null,profile_id.eq.${profileId}`) : query.is("profile_id", null);
    const { data, error } = await query;
    if (error) throw error;
    return (data ?? []).map(mapSupabaseNotification);
  }
  return loadNotifications().filter((n) => !n.profileId || n.profileId === profileId);
}

export interface NewNotificationInput {
  title: string;
  message: string;
  icon: string;
  linkType: NotificationItem["linkType"];
  linkId?: string;
  profileId: string | null;
}

export async function createNotification(input: NewNotificationInput): Promise<void> {
  if (isSupabaseConfigured) {
    const supabase = getSupabaseBrowserClient()!;
    const { error } = await supabase.from("notifications").insert({
      profile_id: input.profileId,
      icon: input.icon,
      title: input.title,
      message: input.message,
      link_type: input.linkType,
      link_id: input.linkId ?? null,
    });
    if (error) throw error;
    return;
  }
  const notification: NotificationItem = {
    id: genId("notif"),
    icon: input.icon,
    title: input.title,
    message: input.message,
    linkType: input.linkType,
    linkId: input.linkId,
    profileId: input.profileId,
    createdAt: new Date().toISOString(),
  };
  saveNotifications([notification, ...loadNotifications()]);
}

// ---------- Orders ----------

export interface NewOrderInput {
  eventId: string;
  batchId: string;
  profileId: string | null;
  guestName?: string;
  guestPhone?: string;
  guestPin?: string;
  recipientName: string;
  recipientPhone: string;
  addressSnapshot: string;
  apartmentName?: string;
  paymentMethod: PaymentMethod;
  items: OrderItem[];
  total: number;
}

export async function createOrder(input: NewOrderInput): Promise<Order> {
  const number = orderNumber();
  if (isSupabaseConfigured) {
    const supabase = getSupabaseBrowserClient()!;
    const { data: orderRow, error } = await supabase
      .from("orders")
      .insert({
        order_number: number,
        event_id: input.eventId,
        batch_id: input.batchId,
        profile_id: input.profileId,
        guest_name: input.guestName ?? null,
        guest_phone: input.guestPhone ?? null,
        guest_pin: input.guestPin ?? null,
        recipient_name: input.recipientName,
        recipient_phone: input.recipientPhone,
        address_snapshot: input.addressSnapshot,
        apartment_name: input.apartmentName || null,
        payment_method: input.paymentMethod,
        status: "wait",
        total: input.total,
      })
      .select()
      .single();
    if (error) throw error;
    const itemRows = input.items.map((item) => ({
      order_id: orderRow.id,
      product_id: item.productId,
      product_name: item.productName,
      price_snapshot: item.price,
      quantity: item.quantity,
    }));
    const { error: itemError } = await supabase.from("order_items").insert(itemRows);
    if (itemError) throw itemError;
    return mapSupabaseOrder(orderRow, input.items);
  }
  const order: Order = {
    id: genId("order"),
    orderNumber: number,
    eventId: input.eventId,
    batchId: input.batchId,
    profileId: input.profileId,
    guestName: input.guestName ?? null,
    guestPhone: input.guestPhone ?? null,
    guestPin: input.guestPin ?? null,
    addressSnapshot: input.addressSnapshot,
    apartmentName: input.apartmentName || null,
    recipientName: input.recipientName,
    recipientPhone: input.recipientPhone,
    paymentMethod: input.paymentMethod,
    status: "wait",
    items: input.items,
    total: input.total,
    createdAt: new Date().toISOString(),
  };
  saveOrders([order, ...loadOrders()]);
  return order;
}

export async function listOrdersForProfile(profileId: string): Promise<Order[]> {
  if (isSupabaseConfigured) {
    const supabase = getSupabaseBrowserClient()!;
    const { data, error } = await supabase.from("orders").select("*, order_items(*)").eq("profile_id", profileId).order("created_at", { ascending: false });
    if (error) throw error;
    return (data ?? []).map((row) => mapSupabaseOrder(row, (row.order_items ?? []).map(mapSupabaseOrderItem)));
  }
  return loadOrders()
    .filter((o) => o.profileId === profileId)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export async function listAllOrders(): Promise<Order[]> {
  if (isSupabaseConfigured) {
    const supabase = getSupabaseBrowserClient()!;
    const { data, error } = await supabase.from("orders").select("*, order_items(*)").order("created_at", { ascending: false });
    if (error) throw error;
    return (data ?? []).map((row) => mapSupabaseOrder(row, (row.order_items ?? []).map(mapSupabaseOrderItem)));
  }
  return loadOrders().sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

// Returns every guest order under this name+PIN, newest first — a guest may
// have placed more than one, unlike the old order-number lookup which only
// ever matched a single order.
export async function lookupGuestOrders(name: string, pin: string): Promise<Order[]> {
  if (isSupabaseConfigured) {
    const supabase = getSupabaseBrowserClient()!;
    const { data, error } = await supabase.rpc("lookup_guest_orders", { p_name: name, p_pin: pin });
    if (error) throw error;
    const rows = data ?? [];
    return Promise.all(
      rows.map(async (row: Record<string, any>) => {
        const { data: items } = await supabase.from("order_items").select("*").eq("order_id", row.id);
        return mapSupabaseOrder(row, (items ?? []).map(mapSupabaseOrderItem));
      }),
    );
  }
  const nameLower = name.trim().toLowerCase();
  return loadOrders()
    .filter((o) => o.guestPin === pin && (o.guestName ?? o.recipientName).trim().toLowerCase() === nameLower)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export async function updateOrderStatus(orderId: string, status: OrderStatus): Promise<void> {
  if (isSupabaseConfigured) {
    const supabase = getSupabaseBrowserClient()!;
    const { error } = await supabase.from("orders").update({ status }).eq("id", orderId);
    if (error) throw error;
    return;
  }
  saveOrders(loadOrders().map((o) => (o.id === orderId ? { ...o, status } : o)));
}

// ---------- Profiles (admin customer lookup) ----------

export async function listAllProfiles(): Promise<Profile[]> {
  if (isSupabaseConfigured) {
    const supabase = getSupabaseBrowserClient()!;
    const { data, error } = await supabase.from("profiles").select("*").order("created_at", { ascending: false });
    if (error) throw error;
    return (data ?? []).map((row) => ({ id: row.id, username: row.username, nickname: row.nickname, phone: row.phone, isAdmin: row.is_admin }));
  }
  return Object.values(loadAccounts()).map((a) => a.profile);
}

// ---------- Addresses ----------
// Only ever one address per member for now (their 기본 배송지) — modeled as
// its own table with is_default from the start so adding multiple saved
// addresses later is a UI change, not a schema change.

export async function listAddresses(profileId: string): Promise<Address[]> {
  if (isSupabaseConfigured) {
    const supabase = getSupabaseBrowserClient()!;
    const { data, error } = await supabase.from("addresses").select("*").eq("profile_id", profileId).order("is_default", { ascending: false });
    if (error) throw error;
    return (data ?? []).map(mapSupabaseAddress);
  }
  const raw = typeof window !== "undefined" ? window.localStorage.getItem(`bogle_addresses_${profileId}`) : null;
  return raw ? (JSON.parse(raw) as Address[]) : [];
}

export async function getDefaultAddress(profileId: string): Promise<Address | null> {
  const addresses = await listAddresses(profileId);
  return addresses.find((a) => a.isDefault) ?? addresses[0] ?? null;
}

export async function saveAddress(input: Omit<Address, "id">): Promise<Address> {
  if (isSupabaseConfigured) {
    const supabase = getSupabaseBrowserClient()!;
    const { data, error } = await supabase
      .from("addresses")
      .insert({
        profile_id: input.profileId,
        name: input.name,
        phone: input.phone,
        zonecode: input.zonecode,
        road_address: input.roadAddress,
        apartment_name: input.apartmentName || "",
        detail_address: input.detailAddress,
        entrance_method: input.entranceMethod || null,
        memo: input.memo || null,
        is_default: input.isDefault,
      })
      .select()
      .single();
    if (error) throw error;
    return mapSupabaseAddress(data);
  }
  const address: Address = { ...input, id: genId("addr") };
  if (typeof window !== "undefined" && input.profileId) {
    const existing = await listAddresses(input.profileId);
    window.localStorage.setItem(`bogle_addresses_${input.profileId}`, JSON.stringify([address, ...existing]));
  }
  return address;
}

// Updates the member's saved default address in place (used when checkout's
// "기본 배송지로 저장" option is chosen instead of creating another row —
// there's only ever the one address per member right now).
export async function updateAddress(addressId: string, profileId: string, patch: Partial<Omit<Address, "id" | "profileId">>): Promise<void> {
  if (isSupabaseConfigured) {
    const supabase = getSupabaseBrowserClient()!;
    const row: Record<string, unknown> = {};
    if (patch.name !== undefined) row.name = patch.name;
    if (patch.phone !== undefined) row.phone = patch.phone;
    if (patch.zonecode !== undefined) row.zonecode = patch.zonecode;
    if (patch.roadAddress !== undefined) row.road_address = patch.roadAddress;
    if (patch.apartmentName !== undefined) row.apartment_name = patch.apartmentName || "";
    if (patch.detailAddress !== undefined) row.detail_address = patch.detailAddress;
    if (patch.entranceMethod !== undefined) row.entrance_method = patch.entranceMethod || null;
    if (patch.memo !== undefined) row.memo = patch.memo || null;
    const { error } = await supabase.from("addresses").update(row).eq("id", addressId);
    if (error) throw error;
    return;
  }
  if (typeof window === "undefined") return;
  const existing = await listAddresses(profileId);
  const next = existing.map((a) => (a.id === addressId ? { ...a, ...patch } : a));
  window.localStorage.setItem(`bogle_addresses_${profileId}`, JSON.stringify(next));
}

// ---------- Store settings (입금 계좌 정보) ----------
// 매장 전체에 하나뿐인 설정값 — 체크아웃/주문상세에서 게스트도 읽어야 해서
// 조회는 공개, 수정은 관리자만 가능하도록 RLS로 분리돼 있다 (schema.sql 참고).

export async function getStoreSettings(): Promise<StoreSettings> {
  if (isSupabaseConfigured) {
    const supabase = getSupabaseBrowserClient()!;
    const { data, error } = await supabase.from("store_settings").select("*").eq("id", true).maybeSingle();
    if (error) throw error;
    return data ? mapSupabaseStoreSettings(data) : EMPTY_STORE_SETTINGS;
  }
  return loadStoreSettings();
}

export async function updateStoreSettings(input: StoreSettings): Promise<void> {
  if (isSupabaseConfigured) {
    const supabase = getSupabaseBrowserClient()!;
    const { error } = await supabase.from("store_settings").upsert({
      id: true,
      bank_name: input.bankName,
      account_number: input.accountNumber,
      account_holder: input.accountHolder,
      updated_at: new Date().toISOString(),
    });
    if (error) throw error;
    return;
  }
  saveStoreSettings(input);
}

// ---------- Supabase row mappers ----------

function mapSupabaseStoreSettings(row: Record<string, any>): StoreSettings {
  return { bankName: row.bank_name ?? "", accountNumber: row.account_number ?? "", accountHolder: row.account_holder ?? "" };
}

function mapSupabaseNotification(row: Record<string, any>): NotificationItem {
  return {
    id: row.id,
    icon: row.icon,
    title: row.title,
    message: row.message,
    linkType: row.link_type,
    linkId: row.link_id ?? undefined,
    profileId: row.profile_id,
    createdAt: row.created_at,
  };
}

function mapSupabaseAddress(row: Record<string, any>): Address {
  return {
    id: row.id,
    profileId: row.profile_id,
    name: row.name,
    phone: row.phone,
    zonecode: row.zonecode ?? "",
    roadAddress: row.road_address,
    apartmentName: row.apartment_name ?? "",
    detailAddress: row.detail_address,
    entranceMethod: row.entrance_method ?? undefined,
    memo: row.memo ?? undefined,
    isDefault: row.is_default,
  };
}

function mapSupabaseProduct(row: Record<string, any>): Product {
  return {
    id: row.id,
    eventId: row.event_id,
    name: row.name,
    price: row.price,
    emoji: row.emoji ?? "📦",
    photos: row.photos && row.photos.length > 0 ? row.photos : undefined,
    deliveryType: row.delivery_type ?? undefined,
    origin: row.origin ?? undefined,
    weight: row.weight ?? undefined,
    storage: row.storage ?? undefined,
    description: row.description ?? undefined,
    detailBlocks: row.detail_blocks && row.detail_blocks.length > 0 ? row.detail_blocks : undefined,
  };
}

function mapSupabaseEvent(row: Record<string, any>): MarketEvent {
  return {
    id: row.id,
    type: row.type,
    title: row.title,
    isFlash: row.is_flash,
    deadlineAt: row.deadline_at,
    deliveryAt: row.delivery_at,
    notice: row.notice ?? "",
    products: (row.products ?? []).map(mapSupabaseProduct),
  };
}

function mapSupabaseOrderItem(row: Record<string, any>): OrderItem {
  return { productId: row.product_id, productName: row.product_name, productEmoji: "📦", price: row.price_snapshot, quantity: row.quantity };
}

function mapSupabaseOrder(row: Record<string, any>, items: OrderItem[]): Order {
  return {
    id: row.id,
    orderNumber: row.order_number,
    eventId: row.event_id,
    batchId: row.batch_id,
    profileId: row.profile_id,
    guestName: row.guest_name,
    guestPhone: row.guest_phone,
    guestPin: row.guest_pin,
    addressSnapshot: row.address_snapshot,
    apartmentName: row.apartment_name ?? null,
    recipientName: row.recipient_name,
    recipientPhone: row.recipient_phone,
    paymentMethod: row.payment_method,
    status: row.status,
    items,
    total: row.total,
    createdAt: row.created_at,
  };
}
