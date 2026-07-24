"use client";

// Data-access facade: reads/writes Supabase when NEXT_PUBLIC_SUPABASE_URL /
// NEXT_PUBLIC_SUPABASE_ANON_KEY are set, otherwise falls back to a
// localStorage-backed mock store (see lib/local-store.ts) so the whole app,
// including the admin panel, is testable before a real backend exists.

import { getSupabaseBrowserClient, isSupabaseConfigured } from "@/lib/supabase/client";
import { loadEvents, saveEvents, loadOrders, saveOrders, loadNotifications, genId } from "@/lib/local-store";
import type { Address, MarketEvent, NotificationItem, Order, OrderItem, OrderStatus, PaymentMethod, Product } from "@/types";

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
      .insert({ event_id: eventId, name: input.name, price: input.price, emoji: input.emoji, photos: input.photos ?? [], origin: input.origin, weight: input.weight, storage: input.storage, description: input.description })
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

export async function listNotifications(): Promise<NotificationItem[]> {
  if (isSupabaseConfigured) return []; // notifications aren't modeled in Supabase yet
  return loadNotifications();
}

// ---------- Orders ----------

export interface NewOrderInput {
  profileId: string | null;
  guestName?: string;
  guestPhone?: string;
  recipientName: string;
  recipientPhone: string;
  addressSnapshot: string;
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
        profile_id: input.profileId,
        guest_name: input.guestName ?? null,
        guest_phone: input.guestPhone ?? null,
        recipient_name: input.recipientName,
        recipient_phone: input.recipientPhone,
        address_snapshot: input.addressSnapshot,
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
    profileId: input.profileId,
    guestName: input.guestName ?? null,
    guestPhone: input.guestPhone ?? null,
    addressSnapshot: input.addressSnapshot,
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

export async function lookupGuestOrder(orderNum: string, phoneLast4: string): Promise<Order | null> {
  if (isSupabaseConfigured) {
    const supabase = getSupabaseBrowserClient()!;
    const { data, error } = await supabase.rpc("lookup_guest_order", { p_order_number: orderNum, p_phone_last4: phoneLast4 });
    if (error) throw error;
    const row = data?.[0];
    if (!row) return null;
    const { data: items } = await supabase.from("order_items").select("*").eq("order_id", row.id);
    return mapSupabaseOrder(row, (items ?? []).map(mapSupabaseOrderItem));
  }
  const order = loadOrders().find((o) => o.orderNumber === orderNum && (o.guestPhone ?? o.recipientPhone).slice(-4) === phoneLast4);
  return order ?? null;
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

// ---------- Addresses (mock mode keeps it simple: last-used address per profile) ----------

export async function listAddresses(profileId: string): Promise<Address[]> {
  if (isSupabaseConfigured) {
    const supabase = getSupabaseBrowserClient()!;
    const { data, error } = await supabase.from("addresses").select("*").eq("profile_id", profileId).order("is_default", { ascending: false });
    if (error) throw error;
    return (data ?? []).map((row) => ({ id: row.id, profileId: row.profile_id, name: row.name, phone: row.phone, address: row.address, isDefault: row.is_default }));
  }
  const raw = typeof window !== "undefined" ? window.localStorage.getItem(`bogle_addresses_${profileId}`) : null;
  return raw ? (JSON.parse(raw) as Address[]) : [];
}

export async function saveAddress(input: Omit<Address, "id">): Promise<Address> {
  if (isSupabaseConfigured) {
    const supabase = getSupabaseBrowserClient()!;
    const { data, error } = await supabase
      .from("addresses")
      .insert({ profile_id: input.profileId, name: input.name, phone: input.phone, address: input.address, is_default: input.isDefault })
      .select()
      .single();
    if (error) throw error;
    return { id: data.id, profileId: data.profile_id, name: data.name, phone: data.phone, address: data.address, isDefault: data.is_default };
  }
  const address: Address = { ...input, id: genId("addr") };
  if (typeof window !== "undefined" && input.profileId) {
    const existing = await listAddresses(input.profileId);
    window.localStorage.setItem(`bogle_addresses_${input.profileId}`, JSON.stringify([address, ...existing]));
  }
  return address;
}

// ---------- Supabase row mappers ----------

function mapSupabaseProduct(row: Record<string, any>): Product {
  return {
    id: row.id,
    eventId: row.event_id,
    name: row.name,
    price: row.price,
    emoji: row.emoji ?? "📦",
    photos: row.photos && row.photos.length > 0 ? row.photos : undefined,
    origin: row.origin ?? undefined,
    weight: row.weight ?? undefined,
    storage: row.storage ?? undefined,
    description: row.description ?? undefined,
    // Not a column yet — read through once products.detail_blocks (jsonb) exists.
    detailBlocks: row.detail_blocks ?? undefined,
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
    profileId: row.profile_id,
    guestName: row.guest_name,
    guestPhone: row.guest_phone,
    addressSnapshot: row.address_snapshot,
    recipientName: row.recipient_name,
    recipientPhone: row.recipient_phone,
    paymentMethod: row.payment_method,
    status: row.status,
    items,
    total: row.total,
    createdAt: row.created_at,
  };
}
