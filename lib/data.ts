"use client";

// Data-access facade: reads/writes Supabase when NEXT_PUBLIC_SUPABASE_URL /
// NEXT_PUBLIC_SUPABASE_ANON_KEY are set, otherwise falls back to a
// localStorage-backed mock store (see lib/local-store.ts) so the whole app,
// including the admin panel, is testable before a real backend exists.

import { getSupabaseBrowserClient, isSupabaseConfigured } from "@/lib/supabase/client";
import {
  loadEvents,
  saveEvents,
  loadCatalogProducts,
  saveCatalogProducts,
  loadOrders,
  saveOrders,
  loadNotifications,
  saveNotifications,
  loadAccounts,
  loadStoreSettings,
  saveStoreSettings,
  loadBanners,
  saveBanners,
  genId,
} from "@/lib/local-store";
import type {
  Address,
  Banner,
  CatalogProduct,
  EventProductSeed,
  EventType,
  MarketEvent,
  MarketEventSeed,
  NotificationItem,
  Order,
  OrderItem,
  OrderStatus,
  PaymentMethod,
  Product,
  Profile,
  StoreSettings,
} from "@/types";
import { EMPTY_STORE_SETTINGS } from "@/types";
import { isEventOrderable } from "@/lib/order-policy";

// 이벤트 리스팅(EventProductSeed/event_products 행)과 카탈로그 상품을 합쳐서
// 화면이 쓰는 평평한 Product로 만든다. mock/Supabase 두 모드 모두 최종적으로
// 이 모양으로 맞춰서 내려주므로, 화면 쪽 컴포넌트는 지금까지와 똑같이 상품을
// 하나의 평평한 객체로 다루면 된다.
function mergeListing(listing: EventProductSeed, catalog: CatalogProduct | undefined): Product {
  return {
    id: listing.id,
    eventId: listing.eventId,
    catalogProductId: listing.catalogProductId,
    name: catalog?.name ?? "(삭제된 상품)",
    price: listing.price,
    emoji: catalog?.emoji ?? "📦",
    photos: catalog?.photos,
    deliveryType: listing.deliveryType,
    origin: catalog?.origin,
    weight: catalog?.weight,
    storage: catalog?.storage,
    eat: catalog?.eat,
    description: catalog?.description,
    detailBlocks: catalog?.detailBlocks,
    stock: listing.stock,
    visible: listing.visible,
  };
}

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
    const { data, error } = await supabase.from("events").select("*, event_products(*, products(*))").order("deadline_at", { ascending: true });
    if (error) throw error;
    return (data ?? []).map(mapSupabaseEvent);
  }
  const catalogMap = new Map(loadCatalogProducts().map((c) => [c.id, c]));
  return loadEvents().map((e) => ({
    ...e,
    products: e.products.map((listing) => mergeListing(listing, catalogMap.get(listing.catalogProductId))),
  }));
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
    return { ...mapSupabaseEvent({ ...data, event_products: [] }) };
  }
  const events = loadEvents();
  const newEvent: MarketEventSeed = { ...input, id: genId("event"), products: [] };
  saveEvents([newEvent, ...events]);
  return { ...newEvent, products: [] };
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

// 같은 이벤트를 다음 회차로 복제 — 카탈로그 상품은 그대로 재사용하고(새로
// 안 늘어남), 리스팅(가격/재고/노출/배송방식)만 복사한다. 회차마다 바뀌는
// 제목/마감/배송일만 새로 받는다("이벤트 복제" UX의 핵심은 이 세 값만
// 입력하면 끝나는 것). 재고는 원본 값을 그대로 복사하므로 새 회차의 실제
// 재고에 맞게 admin이 따로 조정해야 한다.
export async function duplicateEvent(eventId: string, overrides: { title: string; deadlineAt: string; deliveryAt: string }): Promise<MarketEvent> {
  const source = await getEvent(eventId);
  if (!source) throw new Error("이벤트를 찾을 수 없어요.");
  const created = await createEvent({
    type: source.type,
    title: overrides.title,
    isFlash: source.isFlash,
    deadlineAt: overrides.deadlineAt,
    deliveryAt: overrides.deliveryAt,
    notice: source.notice,
  });
  for (const p of source.products) {
    await addEventProduct(created.id, {
      catalogProductId: p.catalogProductId,
      price: p.price,
      deliveryType: p.deliveryType,
      stock: p.stock,
      visible: p.visible,
    });
  }
  const full = await getEvent(created.id);
  return full!;
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

// ---------- 카탈로그 상품 (상품 관리 화면 전용) ----------
// 사진/설명/원산지 등 "내용물"만 다루고 이벤트와 무관 — 여러 이벤트가 같은
// 카탈로그 상품을 리스팅으로 재사용한다.

export async function listCatalogProducts(): Promise<CatalogProduct[]> {
  if (isSupabaseConfigured) {
    const supabase = getSupabaseBrowserClient()!;
    const { data, error } = await supabase.from("products").select("*").order("name", { ascending: true });
    if (error) throw error;
    return (data ?? []).map(mapSupabaseCatalogProduct);
  }
  return loadCatalogProducts()
    .slice()
    .sort((a, b) => a.name.localeCompare(b.name));
}

export async function createCatalogProduct(input: Omit<CatalogProduct, "id">): Promise<CatalogProduct> {
  console.log(`[lib/data] createCatalogProduct 시작 (${isSupabaseConfigured ? "supabase" : "mock"} 모드)`);
  if (isSupabaseConfigured) {
    const supabase = getSupabaseBrowserClient()!;
    const { data, error } = await supabase
      .from("products")
      .insert({
        name: input.name,
        emoji: input.emoji,
        photos: input.photos ?? [],
        detail_blocks: input.detailBlocks ?? [],
        origin: input.origin,
        weight: input.weight,
        storage: input.storage,
        eat: input.eat,
        description: input.description,
      })
      .select()
      .single();
    if (error) {
      console.error("[lib/data] createCatalogProduct supabase insert 실패", error);
      throw error;
    }
    console.log("[lib/data] createCatalogProduct supabase insert 완료");
    return mapSupabaseCatalogProduct(data);
  }
  const product: CatalogProduct = { ...input, id: genId("cat") };
  saveCatalogProducts([product, ...loadCatalogProducts()]);
  console.log("[lib/data] createCatalogProduct mock 저장 완료");
  return product;
}

export async function updateCatalogProduct(catalogProductId: string, patch: Partial<Omit<CatalogProduct, "id">>): Promise<void> {
  console.log(`[lib/data] updateCatalogProduct 시작 (${isSupabaseConfigured ? "supabase" : "mock"} 모드)`);
  if (isSupabaseConfigured) {
    const supabase = getSupabaseBrowserClient()!;
    const row: Record<string, unknown> = {};
    if (patch.name !== undefined) row.name = patch.name;
    if (patch.emoji !== undefined) row.emoji = patch.emoji;
    if (patch.photos !== undefined) row.photos = patch.photos;
    if (patch.detailBlocks !== undefined) row.detail_blocks = patch.detailBlocks;
    if (patch.origin !== undefined) row.origin = patch.origin;
    if (patch.weight !== undefined) row.weight = patch.weight;
    if (patch.storage !== undefined) row.storage = patch.storage;
    if (patch.eat !== undefined) row.eat = patch.eat;
    if (patch.description !== undefined) row.description = patch.description;
    const { error } = await supabase.from("products").update(row).eq("id", catalogProductId);
    if (error) {
      console.error("[lib/data] updateCatalogProduct supabase update 실패", error);
      throw error;
    }
    console.log("[lib/data] updateCatalogProduct supabase update 완료");
    return;
  }
  saveCatalogProducts(loadCatalogProducts().map((c) => (c.id === catalogProductId ? { ...c, ...patch } : c)));
  console.log("[lib/data] updateCatalogProduct mock 저장 완료");
}

// 사용 중인(어느 이벤트에라도 리스팅된) 카탈로그 상품은 삭제할 수 없다 —
// Supabase는 FK 제약(event_products.product_id, on delete 기본 NO ACTION)이
// 막아주고, mock 모드는 여기서 직접 확인해 같은 사용자 경험을 준다.
export async function deleteCatalogProduct(catalogProductId: string): Promise<void> {
  if (isSupabaseConfigured) {
    const supabase = getSupabaseBrowserClient()!;
    const { error } = await supabase.from("products").delete().eq("id", catalogProductId);
    if (error) {
      if (error.code === "23503") throw new Error("이 상품은 이벤트에서 사용 중이라 삭제할 수 없어요. 먼저 이벤트에서 제거해 주세요.");
      throw error;
    }
    return;
  }
  const inUse = loadEvents().some((e) => e.products.some((p) => p.catalogProductId === catalogProductId));
  if (inUse) throw new Error("이 상품은 이벤트에서 사용 중이라 삭제할 수 없어요. 먼저 이벤트에서 제거해 주세요.");
  saveCatalogProducts(loadCatalogProducts().filter((c) => c.id !== catalogProductId));
}

// ---------- 이벤트별 상품 등록(리스팅) ----------
// 카탈로그 상품 하나를 이번 이벤트에 어떤 가격/재고/노출로 팔지 나타낸다.

export interface NewEventProductInput {
  catalogProductId: string;
  price: number;
  deliveryType?: EventType;
  stock?: number;
  visible?: boolean;
}

export async function addEventProduct(eventId: string, input: NewEventProductInput): Promise<Product> {
  if (isSupabaseConfigured) {
    const supabase = getSupabaseBrowserClient()!;
    const { data, error } = await supabase
      .from("event_products")
      .insert({
        event_id: eventId,
        product_id: input.catalogProductId,
        price: input.price,
        delivery_type: input.deliveryType ?? null,
        stock: input.stock ?? null,
        visible: input.visible ?? true,
      })
      .select("*, products(*)")
      .single();
    if (error) throw error;
    return mapSupabaseEventProduct(data);
  }
  const catalog = loadCatalogProducts().find((c) => c.id === input.catalogProductId);
  if (!catalog) throw new Error("상품을 찾을 수 없어요.");
  const listing: EventProductSeed = {
    id: genId("lst"),
    eventId,
    catalogProductId: input.catalogProductId,
    price: input.price,
    deliveryType: input.deliveryType,
    stock: input.stock,
    visible: input.visible ?? true,
  };
  saveEvents(loadEvents().map((e) => (e.id === eventId ? { ...e, products: [...e.products, listing] } : e)));
  return mergeListing(listing, catalog);
}

export interface EventProductPatch {
  price?: number;
  deliveryType?: EventType;
  stock?: number;
  visible?: boolean;
}

export async function updateEventProduct(eventProductId: string, patch: EventProductPatch): Promise<void> {
  if (isSupabaseConfigured) {
    const supabase = getSupabaseBrowserClient()!;
    const row: Record<string, unknown> = {};
    if (patch.price !== undefined) row.price = patch.price;
    if (patch.deliveryType !== undefined) row.delivery_type = patch.deliveryType ?? null;
    // "stock" in patch (아닌 !== undefined)로 확인 — 재고 한도를 다시 "무제한"으로
    // 비우는 것도 유효한 값 변경이라, patch.stock이 undefined인 채로 명시적으로
    // 전달된 경우와 애초에 patch에 없는 경우를 구분해야 한다.
    if ("stock" in patch) row.stock = patch.stock ?? null;
    if (patch.visible !== undefined) row.visible = patch.visible;
    const { error } = await supabase.from("event_products").update(row).eq("id", eventProductId);
    if (error) throw error;
    return;
  }
  const events = loadEvents();
  saveEvents(events.map((e) => ({ ...e, products: e.products.map((p) => (p.id === eventProductId ? { ...p, ...patch } : p)) })));
}

export async function removeEventProduct(eventProductId: string): Promise<void> {
  if (isSupabaseConfigured) {
    const supabase = getSupabaseBrowserClient()!;
    const { error } = await supabase.from("event_products").delete().eq("id", eventProductId);
    if (error) throw error;
    return;
  }
  const events = loadEvents();
  saveEvents(events.map((e) => ({ ...e, products: e.products.filter((p) => p.id !== eventProductId) })));
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

// 사다드림/특가처럼 STRICT_DEADLINE 정책인 이벤트만 마감 후 주문을 막는다 — 문고리/
// 택배(비특가)는 재고만으로 계속 제어되므로 여기서 걸리지 않는다(lib/order-policy.ts).
async function assertEventOrderable(eventId: string): Promise<void> {
  const event = await getEvent(eventId);
  if (!event) throw new Error("이벤트를 찾을 수 없어요.");
  if (!isEventOrderable(event)) {
    throw new Error(`"${event.title}"은(는) 마감되어 더 이상 주문할 수 없어요.`);
  }
}

export async function createOrder(input: NewOrderInput): Promise<Order> {
  await assertEventOrderable(input.eventId);
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
      event_product_id: item.productId,
      product_name: item.productName,
      price_snapshot: item.price,
      quantity: item.quantity,
    }));
    const { error: itemError } = await supabase.from("order_items").insert(itemRows);
    if (itemError) throw itemError;
    for (const item of input.items) {
      await supabase.rpc("decrement_stock", { p_event_product_id: item.productId, p_qty: item.quantity });
    }
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
    cancelRequested: false,
    cancelReason: null,
    courierCode: null,
    trackingNumber: null,
    items: input.items,
    total: input.total,
    createdAt: new Date().toISOString(),
  };
  saveOrders([order, ...loadOrders()]);
  saveEvents(decrementProductStock(loadEvents(), input.items));
  return order;
}

// 재고가 있는 리스팅(stock이 정해진 리스팅)만 골라 주문 수량만큼 차감한다(0
// 밑으로는 안 내려감). stock이 undefined인 리스팅(재고 제한 없음)은 그대로 둔다.
function decrementProductStock(events: MarketEventSeed[], items: OrderItem[]): MarketEventSeed[] {
  const deltaByProduct = new Map(items.map((i) => [i.productId, i.quantity]));
  return events.map((e) => ({
    ...e,
    products: e.products.map((p) => {
      const qty = deltaByProduct.get(p.id);
      if (!qty || p.stock === undefined) return p;
      return { ...p, stock: Math.max(0, p.stock - qty) };
    }),
  }));
}

function restoreProductStock(events: MarketEventSeed[], items: OrderItem[]): MarketEventSeed[] {
  const deltaByProduct = new Map(items.map((i) => [i.productId, i.quantity]));
  return events.map((e) => ({
    ...e,
    products: e.products.map((p) => {
      const qty = deltaByProduct.get(p.id);
      if (!qty || p.stock === undefined) return p;
      return { ...p, stock: p.stock + qty };
    }),
  }));
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

// 취소/환불로 바뀔 때는 차감됐던 재고를 되돌려준다(재고 제한이 있는 상품만).
function isRestockingStatus(status: OrderStatus): boolean {
  return status === "cancelled" || status === "refunded";
}

export async function updateOrderStatus(
  orderId: string,
  status: OrderStatus,
  shipping?: { courierCode: string; trackingNumber: string },
): Promise<void> {
  if (isSupabaseConfigured) {
    const supabase = getSupabaseBrowserClient()!;
    if (isRestockingStatus(status)) {
      const { data: itemRows } = await supabase.from("order_items").select("event_product_id, quantity").eq("order_id", orderId);
      for (const item of itemRows ?? []) {
        if (item.event_product_id) await supabase.rpc("increment_stock", { p_event_product_id: item.event_product_id, p_qty: item.quantity });
      }
    }
    const patch: Record<string, unknown> = { status };
    if (shipping) {
      patch.courier_code = shipping.courierCode;
      patch.tracking_number = shipping.trackingNumber;
    }
    const { error } = await supabase.from("orders").update(patch).eq("id", orderId);
    if (error) throw error;
    return;
  }
  const orders = loadOrders();
  if (isRestockingStatus(status)) {
    const target = orders.find((o) => o.id === orderId);
    if (target) saveEvents(restoreProductStock(loadEvents(), target.items));
  }
  saveOrders(
    orders.map((o) =>
      o.id === orderId
        ? { ...o, status, ...(shipping ? { courierCode: shipping.courierCode, trackingNumber: shipping.trackingNumber } : {}) }
        : o,
    ),
  );
}

// 고객 셀프취소 — 발주확인(confirmed) 이전 단계(wait/paid)에서만 가능. 회원은
// RLS가, 게스트는 SECURITY DEFINER RPC(cancel_guest_order)가 이 조건을
// 서버 측에서도 강제한다. mock 모드는 별도 인증 계층이 없어 여기서 직접 확인.
export async function cancelOrder(orderId: string, opts: { profileId?: string | null; guestName?: string; guestPin?: string }): Promise<void> {
  if (isSupabaseConfigured) {
    const supabase = getSupabaseBrowserClient()!;
    if (opts.profileId) {
      await updateOrderStatus(orderId, "cancelled");
      return;
    }
    const { error } = await supabase.rpc("cancel_guest_order", { p_order_id: orderId, p_name: opts.guestName, p_pin: opts.guestPin });
    if (error) throw error;
    return;
  }
  const target = loadOrders().find((o) => o.id === orderId);
  if (!target || (target.status !== "wait" && target.status !== "paid")) {
    throw new Error("이미 발주가 확인된 주문이에요. 취소가 필요하면 관리자에게 문의해 주세요.");
  }
  await updateOrderStatus(orderId, "cancelled");
}

// 발주확인(confirmed)/배송중(ship) 단계의 취소는 즉시 처리하지 않고 "요청"만
// 남긴다 — status는 그대로 두어 배송 준비가 계속 진행되게 하고, 관리자가
// 승인(실제 취소 + 재고 복구)하거나 거절(사유와 함께 알림)할 때까지 기다린다.
export async function requestCancellation(
  orderId: string,
  opts: { profileId?: string | null; guestName?: string; guestPin?: string; reason?: string },
): Promise<void> {
  if (isSupabaseConfigured) {
    const supabase = getSupabaseBrowserClient()!;
    if (opts.profileId) {
      const { error } = await supabase.from("orders").update({ cancel_requested: true, cancel_reason: opts.reason || null }).eq("id", orderId);
      if (error) throw error;
      return;
    }
    const { error } = await supabase.rpc("request_guest_cancel", {
      p_order_id: orderId,
      p_name: opts.guestName,
      p_pin: opts.guestPin,
      p_reason: opts.reason || null,
    });
    if (error) throw error;
    return;
  }
  const target = loadOrders().find((o) => o.id === orderId);
  if (!target || (target.status !== "confirmed" && target.status !== "ship")) {
    throw new Error("지금 상태에서는 취소를 요청할 수 없어요.");
  }
  saveOrders(loadOrders().map((o) => (o.id === orderId ? { ...o, cancelRequested: true, cancelReason: opts.reason || null } : o)));
}

// 관리자가 취소 요청을 승인 — 실제로 주문을 취소 처리하고(재고 복구는
// updateOrderStatus가 처리) 요청 플래그를 내린다.
export async function approveCancelRequest(orderId: string): Promise<void> {
  await updateOrderStatus(orderId, "cancelled");
  if (isSupabaseConfigured) {
    const supabase = getSupabaseBrowserClient()!;
    const { error } = await supabase.from("orders").update({ cancel_requested: false }).eq("id", orderId);
    if (error) throw error;
    return;
  }
  saveOrders(loadOrders().map((o) => (o.id === orderId ? { ...o, cancelRequested: false } : o)));
}

// 관리자가 취소 요청을 거절 — 주문 상태(발주확인/배송중)는 그대로 두고 요청
// 플래그만 내린다. 거절 사유는 고객 알림에 담아 보내는 쪽(호출부)에서 처리.
export async function rejectCancelRequest(orderId: string): Promise<void> {
  if (isSupabaseConfigured) {
    const supabase = getSupabaseBrowserClient()!;
    const { error } = await supabase.from("orders").update({ cancel_requested: false }).eq("id", orderId);
    if (error) throw error;
    return;
  }
  saveOrders(loadOrders().map((o) => (o.id === orderId ? { ...o, cancelRequested: false } : o)));
}

// 고객이 배송완료 후 반품/환불을 신청 — 관리자가 확인 후 수동으로 환불완료
// 처리한다(입금확인 등 다른 상태 전환과 같은 패턴).
export async function requestRefund(orderId: string): Promise<void> {
  if (isSupabaseConfigured) {
    const supabase = getSupabaseBrowserClient()!;
    const { error } = await supabase.from("orders").update({ status: "refund_requested" }).eq("id", orderId);
    if (error) throw error;
    return;
  }
  saveOrders(loadOrders().map((o) => (o.id === orderId ? { ...o, status: "refund_requested" as OrderStatus } : o)));
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

// ---------- Banners (메인 홈 상단 배너) ----------
// 노출 여부(active)와 기간(startsAt/endsAt)은 서버가 아니라 화면 쪽에서
// isBannerLive로 판단한다 — RLS는 active만 걸러줄 뿐 날짜 범위는 모르고,
// 관리자 화면에서는 비활성/예약 배너도 그대로 다 보여줘야 하기 때문.

export async function listBanners(): Promise<Banner[]> {
  if (isSupabaseConfigured) {
    const supabase = getSupabaseBrowserClient()!;
    const { data, error } = await supabase.from("banners").select("*").order("sort_order", { ascending: true });
    if (error) throw error;
    return (data ?? []).map(mapSupabaseBanner);
  }
  return loadBanners()
    .slice()
    .sort((a, b) => a.sortOrder - b.sortOrder);
}

export function isBannerLive(banner: Banner, now: Date = new Date()): boolean {
  if (!banner.active) return false;
  if (banner.startsAt && new Date(banner.startsAt).getTime() > now.getTime()) return false;
  if (banner.endsAt && new Date(banner.endsAt).getTime() < now.getTime()) return false;
  return true;
}

export async function createBanner(input: Omit<Banner, "id" | "sortOrder">): Promise<Banner> {
  const banners = await listBanners();
  const sortOrder = banners.length > 0 ? Math.max(...banners.map((b) => b.sortOrder)) + 1 : 0;
  if (isSupabaseConfigured) {
    const supabase = getSupabaseBrowserClient()!;
    const { data, error } = await supabase
      .from("banners")
      .insert({
        image_url: input.imageUrl,
        link_type: input.linkType,
        link_id: input.linkId,
        link_url: input.linkUrl,
        active: input.active,
        starts_at: input.startsAt,
        ends_at: input.endsAt,
        sort_order: sortOrder,
      })
      .select()
      .single();
    if (error) throw error;
    return mapSupabaseBanner(data);
  }
  const banner: Banner = { ...input, id: genId("banner"), sortOrder };
  saveBanners([...banners, banner]);
  return banner;
}

export async function updateBanner(id: string, patch: Partial<Omit<Banner, "id">>): Promise<void> {
  if (isSupabaseConfigured) {
    const supabase = getSupabaseBrowserClient()!;
    const row: Record<string, unknown> = {};
    if (patch.imageUrl !== undefined) row.image_url = patch.imageUrl;
    if (patch.linkType !== undefined) row.link_type = patch.linkType;
    if ("linkId" in patch) row.link_id = patch.linkId ?? null;
    if ("linkUrl" in patch) row.link_url = patch.linkUrl ?? null;
    if (patch.active !== undefined) row.active = patch.active;
    if ("startsAt" in patch) row.starts_at = patch.startsAt ?? null;
    if ("endsAt" in patch) row.ends_at = patch.endsAt ?? null;
    if (patch.sortOrder !== undefined) row.sort_order = patch.sortOrder;
    const { error } = await supabase.from("banners").update(row).eq("id", id);
    if (error) throw error;
    return;
  }
  saveBanners(loadBanners().map((b) => (b.id === id ? { ...b, ...patch } : b)));
}

export async function deleteBanner(id: string): Promise<void> {
  if (isSupabaseConfigured) {
    const supabase = getSupabaseBrowserClient()!;
    const { error } = await supabase.from("banners").delete().eq("id", id);
    if (error) throw error;
    return;
  }
  saveBanners(loadBanners().filter((b) => b.id !== id));
}

// 드래그로 바꾼 순서를 그대로 sort_order(0, 1, 2, ...)로 저장한다.
export async function reorderBanners(orderedIds: string[]): Promise<void> {
  if (isSupabaseConfigured) {
    const supabase = getSupabaseBrowserClient()!;
    await Promise.all(orderedIds.map((id, index) => supabase.from("banners").update({ sort_order: index }).eq("id", id)));
    return;
  }
  const banners = loadBanners();
  const byId = new Map(banners.map((b) => [b.id, b]));
  saveBanners(orderedIds.map((id, index) => ({ ...byId.get(id)!, sortOrder: index })));
}

// ---------- Supabase row mappers ----------

function mapSupabaseStoreSettings(row: Record<string, any>): StoreSettings {
  return { bankName: row.bank_name ?? "", accountNumber: row.account_number ?? "", accountHolder: row.account_holder ?? "" };
}

function mapSupabaseBanner(row: Record<string, any>): Banner {
  return {
    id: row.id,
    imageUrl: row.image_url,
    linkType: row.link_type,
    linkId: row.link_id ?? null,
    linkUrl: row.link_url ?? null,
    active: row.active,
    startsAt: row.starts_at ?? null,
    endsAt: row.ends_at ?? null,
    sortOrder: row.sort_order,
  };
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

function mapSupabaseCatalogProduct(row: Record<string, any>): CatalogProduct {
  return {
    id: row.id,
    name: row.name,
    emoji: row.emoji ?? "📦",
    photos: row.photos && row.photos.length > 0 ? row.photos : undefined,
    origin: row.origin ?? undefined,
    weight: row.weight ?? undefined,
    storage: row.storage ?? undefined,
    eat: row.eat ?? undefined,
    description: row.description ?? undefined,
    detailBlocks: row.detail_blocks && row.detail_blocks.length > 0 ? row.detail_blocks : undefined,
  };
}

// event_products 행(+ 중첩된 products(*) 카탈로그 조인)을 화면이 쓰는 평평한
// Product로 합친다. mock 모드의 mergeListing과 같은 역할.
function mapSupabaseEventProduct(row: Record<string, any>): Product {
  const catalog = row.products ?? {};
  return {
    id: row.id,
    eventId: row.event_id,
    catalogProductId: row.product_id,
    name: catalog.name ?? "(삭제된 상품)",
    price: row.price,
    emoji: catalog.emoji ?? "📦",
    photos: catalog.photos && catalog.photos.length > 0 ? catalog.photos : undefined,
    deliveryType: row.delivery_type ?? undefined,
    origin: catalog.origin ?? undefined,
    weight: catalog.weight ?? undefined,
    storage: catalog.storage ?? undefined,
    eat: catalog.eat ?? undefined,
    description: catalog.description ?? undefined,
    detailBlocks: catalog.detail_blocks && catalog.detail_blocks.length > 0 ? catalog.detail_blocks : undefined,
    stock: row.stock ?? undefined,
    visible: row.visible ?? true,
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
    products: (row.event_products ?? []).map(mapSupabaseEventProduct),
  };
}

function mapSupabaseOrderItem(row: Record<string, any>): OrderItem {
  return { productId: row.event_product_id, productName: row.product_name, productEmoji: "📦", price: row.price_snapshot, quantity: row.quantity };
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
    cancelRequested: row.cancel_requested ?? false,
    cancelReason: row.cancel_reason ?? null,
    courierCode: row.courier_code ?? null,
    trackingNumber: row.tracking_number ?? null,
    items,
    total: row.total,
    createdAt: row.created_at,
  };
}
