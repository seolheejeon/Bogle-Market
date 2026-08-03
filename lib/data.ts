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
  ProductOptionGroup,
  ProductOptionValue,
  Profile,
  StoreSettings,
} from "@/types";
import { EMPTY_STORE_SETTINGS } from "@/types";
import { isEventOrderable } from "@/lib/order-policy";
import { generateStockCombos, comboValueIds } from "@/lib/product-options";

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
    // 카탈로그 상품의 공유 재고를 그대로 내려준다 — 리스팅 자체엔 재고가 없다.
    stock: catalog?.stock,
    minQty: catalog?.minQty,
    badge: catalog?.badge ?? "NONE",
    shippingFee: catalog?.shippingFee,
    shippingFeeType: catalog?.shippingFeeType,
    freeShippingThreshold: catalog?.freeShippingThreshold,
    shippingFeeQtyUnit: catalog?.shippingFeeQtyUnit,
    courierCode: catalog?.courierCode,
    fulfillmentType: catalog?.fulfillmentType,
    shipsAt: catalog?.shipsAt,
    visible: listing.visible,
    optionGroups: mergeOptionStock(catalog?.optionGroups, listing.optionStock),
    // listing.optionStock은 이미 comboKey -> stock 맵이라 그대로 내려주면 된다.
    optionStockByCombo: listing.optionStock,
  };
}

// 카탈로그의 옵션 그룹/값(구조)에 이 리스팅의 옵션값별 재고 스냅샷을 채워
// 넣는다. hasStock=false인 옵션값은 재고 제한이 없어 stock을 아예 안 채운다.
function mergeOptionStock(groups: ProductOptionGroup[] | undefined, optionStock: Record<string, number> | undefined): ProductOptionGroup[] | undefined {
  if (!groups) return undefined;
  return groups.map((g) => ({
    ...g,
    values: g.values.map((v) => (v.hasStock ? { ...v, stock: optionStock?.[v.id] ?? v.defaultStock ?? 0 } : v)),
  }));
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
    const { data, error } = await supabase
      .from("events")
      .select("*, event_products(*, products(*, product_option_groups(*, product_option_values(*))), event_option_stock(*))")
      .order("deadline_at", { ascending: true });
    if (error) throw error;
    return (data ?? []).map(mapSupabaseEvent);
  }
  const catalogMap = new Map(loadCatalogProducts().map((c) => [c.id, c]));
  return loadEvents().map((e) => ({
    ...e,
    products: e.products
      .slice()
      .sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0))
      .map((listing) => mergeListing(listing, catalogMap.get(listing.catalogProductId))),
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
      .insert({ type: input.type, title: input.title, flash_sale: input.flashSale, deadline_at: input.deadlineAt, delivery_at: input.deliveryAt, notice: input.notice })
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
    if (patch.flashSale !== undefined) row.flash_sale = patch.flashSale;
    if (patch.status !== undefined) row.status = patch.status;
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
// 안 늘어남), 리스팅(가격/노출/배송방식)만 복사한다. 회차마다 바뀌는
// 제목/마감/배송일만 새로 받는다("이벤트 복제" UX의 핵심은 이 세 값만
// 입력하면 끝나는 것). 재고는 카탈로그 상품 쪽에 이미 있어 복제할 게 없다 —
// 새 리스팅도 자동으로 같은 공유 재고를 본다.
export async function duplicateEvent(eventId: string, overrides: { title: string; deadlineAt: string; deliveryAt: string }): Promise<MarketEvent> {
  const source = await getEvent(eventId);
  if (!source) throw new Error("이벤트를 찾을 수 없어요.");
  const created = await createEvent({
    type: source.type,
    title: overrides.title,
    flashSale: source.flashSale,
    // 원본이 종료 상태였어도 복제본은 항상 새 회차로 진행중 시작.
    status: "open",
    deadlineAt: overrides.deadlineAt,
    deliveryAt: overrides.deliveryAt,
    notice: source.notice,
  });
  // 원가도 가격/재고와 마찬가지로 "원본 이벤트의 스냅샷"을 그대로 복사한다 —
  // 마스터(카탈로그) 기준 원가가 아니라, 이 회차에서 실제로 쓰던 값을 이어받음.
  const costs = await getEventProductCosts(source.products.map((p) => p.id));
  for (const p of source.products) {
    // 옵션 조합 재고도 가격/원가와 마찬가지로 "원본 회차에서 실제로 쓰던 값"을
    // 그대로 이어받는다 — 카탈로그의 기본 재고로 새로 초기화하지 않는다.
    await addEventProduct(created.id, {
      catalogProductId: p.catalogProductId,
      price: p.price,
      costPrice: costs[p.id],
      deliveryType: p.deliveryType,
      visible: p.visible,
      optionStock: p.optionStockByCombo,
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
    // product_costs를 함께 embed — 이 함수는 관리자 화면에서만 호출되므로
    // 안전하다(RLS가 어차피 비관리자에게는 이 조인을 null로 돌려준다).
    const { data, error } = await supabase
      .from("products")
      .select("*, product_costs(cost_price), product_option_groups(*, product_option_values(*))")
      .order("name", { ascending: true });
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
        base_price: input.basePrice ?? 0,
        stock: input.stock ?? null,
        min_qty: input.minQty ?? 1,
        badge: input.badge ?? "NONE",
        shipping_fee: input.shippingFee ?? 0,
        shipping_fee_type: input.shippingFeeType ?? "fixed",
        free_shipping_threshold: input.freeShippingThreshold ?? 0,
        shipping_fee_qty_unit: input.shippingFeeQtyUnit ?? null,
        courier_code: input.courierCode ?? null,
        fulfillment_type: input.fulfillmentType ?? "same_day",
        ships_at: input.shipsAt ?? null,
      })
      .select()
      .single();
    if (error) {
      console.error("[lib/data] createCatalogProduct supabase insert 실패", error);
      throw error;
    }
    // 원가는 별도 admin-only 테이블에 저장 — products insert가 끝난 뒤 새로
    // 생긴 id로 upsert한다(값이 없으면 건드리지 않고 기본 0으로 남겨둠).
    if (input.costPrice !== undefined) {
      const { error: costError } = await supabase.from("product_costs").upsert({ product_id: data.id, cost_price: input.costPrice });
      if (costError) {
        console.error("[lib/data] createCatalogProduct 원가 저장 실패", costError);
        throw costError;
      }
    }
    if (input.optionGroups !== undefined && input.optionGroups.length > 0) {
      await saveOptionGroupsForProduct(supabase, data.id, input.optionGroups);
    }
    console.log("[lib/data] createCatalogProduct supabase insert 완료");
    return { ...mapSupabaseCatalogProduct(data), costPrice: input.costPrice, optionGroups: input.optionGroups };
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
    if (patch.basePrice !== undefined) row.base_price = patch.basePrice;
    // "stock" in patch (아닌 !== undefined)로 확인 — 재고 한도를 다시
    // "무제한"으로 비우는 것도 유효한 값 변경이라, patch.stock이 undefined인
    // 채로 명시적으로 전달된 경우와 애초에 patch에 없는 경우를 구분해야 한다.
    if ("stock" in patch) row.stock = patch.stock ?? null;
    if (patch.minQty !== undefined) row.min_qty = patch.minQty;
    if (patch.badge !== undefined) row.badge = patch.badge;
    if (patch.shippingFee !== undefined) row.shipping_fee = patch.shippingFee;
    if (patch.shippingFeeType !== undefined) row.shipping_fee_type = patch.shippingFeeType;
    if (patch.freeShippingThreshold !== undefined) row.free_shipping_threshold = patch.freeShippingThreshold;
    if ("shippingFeeQtyUnit" in patch) row.shipping_fee_qty_unit = patch.shippingFeeQtyUnit ?? null;
    if ("courierCode" in patch) row.courier_code = patch.courierCode ?? null;
    if (patch.fulfillmentType !== undefined) row.fulfillment_type = patch.fulfillmentType;
    if ("shipsAt" in patch) row.ships_at = patch.shipsAt ?? null;
    if (Object.keys(row).length > 0) {
      const { error } = await supabase.from("products").update(row).eq("id", catalogProductId);
      if (error) {
        console.error("[lib/data] updateCatalogProduct supabase update 실패", error);
        throw error;
      }
    }
    if (patch.costPrice !== undefined) {
      const { error: costError } = await supabase
        .from("product_costs")
        .upsert({ product_id: catalogProductId, cost_price: patch.costPrice, updated_at: new Date().toISOString() });
      if (costError) {
        console.error("[lib/data] updateCatalogProduct 원가 저장 실패", costError);
        throw costError;
      }
    }
    if (patch.optionGroups !== undefined) {
      await saveOptionGroupsForProduct(supabase, catalogProductId, patch.optionGroups);
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

// ---------- 카탈로그 상품 옵션 그룹/값 (Supabase 전용 저장 로직) ----------
// upsert-then-prune 패턴: 화면(관리자 옵션 에디터)이 넘긴 그룹/값 배열의 id를
// 그대로 DB id로 써서(신규 항목도 화면에서 crypto.randomUUID()로 미리 uuid를
// 만들어 넘김) 기존 id는 갱신, 새 id는 삽입되게 하고, 넘어오지 않은(=삭제된)
// id만 지운다. 그래야 값 자체를 지웠다 새로 만들지 않아 event_option_stock의
// FK(on delete cascade)가 안 바뀐 옵션값의 기존 재고를 실수로 날리지 않는다.
async function saveOptionGroupsForProduct(supabase: ReturnType<typeof getSupabaseBrowserClient>, productId: string, groups: ProductOptionGroup[]): Promise<void> {
  const sb = supabase!;
  const keepGroupIds = groups.map((g) => g.id);
  if (groups.length > 0) {
    const { error } = await sb.from("product_option_groups").upsert(
      groups.map((g, i) => ({ id: g.id, product_id: productId, name: g.name, required: g.required, multi: g.multi, sort_order: g.sortOrder ?? i })),
    );
    if (error) throw error;
  }
  const delGroups = sb.from("product_option_groups").delete().eq("product_id", productId);
  const { error: delGroupError } = await (keepGroupIds.length > 0 ? delGroups.not("id", "in", `(${keepGroupIds.join(",")})`) : delGroups);
  if (delGroupError) throw delGroupError;

  const allValues = groups.flatMap((g) =>
    g.values.map((v, i) => ({
      id: v.id,
      group_id: g.id,
      name: v.name,
      price_delta: v.priceDelta,
      has_stock: v.hasStock,
      default_stock: v.defaultStock ?? null,
      sort_order: v.sortOrder ?? i,
    })),
  );
  if (allValues.length > 0) {
    const { error } = await sb.from("product_option_values").upsert(allValues);
    if (error) throw error;
  }
  if (keepGroupIds.length > 0) {
    const keepValueIds = allValues.map((v) => v.id);
    const delValues = sb.from("product_option_values").delete().in("group_id", keepGroupIds);
    const { error: delValueError } = await (keepValueIds.length > 0 ? delValues.not("id", "in", `(${keepValueIds.join(",")})`) : delValues);
    if (delValueError) throw delValueError;
  }
}

// 카탈로그 상품의 옵션 그룹/값(구조)만 조회 — addEventProduct가 새 리스팅의
// event_option_stock 초기값(default_stock)을 계산할 때 쓴다.
async function fetchOptionGroupsForProduct(supabase: ReturnType<typeof getSupabaseBrowserClient>, productId: string): Promise<ProductOptionGroup[]> {
  const { data, error } = await supabase!
    .from("product_option_groups")
    .select("*, product_option_values(*)")
    .eq("product_id", productId);
  if (error) throw error;
  return mapSupabaseOptionGroups(data) ?? [];
}

// ---------- 이벤트별 상품 등록(리스팅) ----------
// 카탈로그 상품 하나를 이번 이벤트에 어떤 가격/노출로 팔지 나타낸다. 재고는
// 여기서 정하지 않는다 — 상품 자체(카탈로그)의 재고를 그대로 공유한다.

export interface NewEventProductInput {
  catalogProductId: string;
  price: number;
  // 이 이벤트에 추가하는 시점의 원가 스냅샷 — 보통 카탈로그 기준 원가를 그대로
  // 넘기지만, 2+1/묶음 판매 등으로 이 회차만 원가가 다르면 호출부(화면)에서
  // 미리 값을 바꿔 넘기면 된다. undefined면 원가를 기록하지 않는다(0으로 남음).
  costPrice?: number;
  deliveryType?: EventType;
  visible?: boolean;
  // 옵션 조합별 초기 재고(comboKey -> stock)를 명시적으로 주면 카탈로그
  // 기본값(각 조합을 구성하는 값들의 defaultStock 중 최솟값) 대신 이 값으로
  // event_option_stock을 초기화한다 — duplicateEvent가 원본 회차의 실제
  // 재고를 그대로 이어받을 때 쓰는 용도. 안 주면(보통의 "이벤트에 상품 추가"
  // 흐름) 카탈로그 기본값으로 채워진다.
  optionStock?: Record<string, number>;
}

export async function addEventProduct(eventId: string, input: NewEventProductInput): Promise<Product> {
  if (isSupabaseConfigured) {
    const supabase = getSupabaseBrowserClient()!;
    // 새 리스팅은 이 이벤트 안에서 항상 맨 뒤로 붙는다 — 기존 최댓값+1.
    const { data: existing } = await supabase.from("event_products").select("sort_order").eq("event_id", eventId).order("sort_order", { ascending: false }).limit(1);
    const nextSortOrder = (existing?.[0]?.sort_order ?? -1) + 1;
    const { data, error } = await supabase
      .from("event_products")
      .insert({
        event_id: eventId,
        product_id: input.catalogProductId,
        price: input.price,
        delivery_type: input.deliveryType ?? null,
        visible: input.visible ?? true,
        sort_order: nextSortOrder,
      })
      .select("*, products(*)")
      .single();
    if (error) throw error;
    if (input.costPrice !== undefined) {
      const { error: costError } = await supabase.from("event_product_costs").upsert({ event_product_id: data.id, cost_price: input.costPrice });
      if (costError) throw costError;
    }
    const catalogGroups = await fetchOptionGroupsForProduct(supabase, input.catalogProductId);
    const optionStockRows = generateStockCombos(catalogGroups).map((c) => ({
      event_product_id: data.id,
      value_ids: c.valueIds,
      stock: input.optionStock?.[c.valueIds.join(",")] ?? c.defaultStock,
    }));
    if (optionStockRows.length > 0) {
      const { error: stockError } = await supabase.from("event_option_stock").insert(optionStockRows);
      if (stockError) throw stockError;
    }
    const { data: full, error: fullError } = await supabase
      .from("event_products")
      .select("*, products(*, product_option_groups(*, product_option_values(*))), event_option_stock(*)")
      .eq("id", data.id)
      .single();
    if (fullError) throw fullError;
    return mapSupabaseEventProduct(full);
  }
  const catalog = loadCatalogProducts().find((c) => c.id === input.catalogProductId);
  if (!catalog) throw new Error("상품을 찾을 수 없어요.");
  const optionStock: Record<string, number> = {};
  for (const c of generateStockCombos(catalog.optionGroups ?? [])) {
    const key = c.valueIds.join(",");
    optionStock[key] = input.optionStock?.[key] ?? c.defaultStock;
  }
  const events = loadEvents();
  const targetEvent = events.find((e) => e.id === eventId);
  const nextSortOrder = Math.max(-1, ...(targetEvent?.products.map((p) => p.sortOrder ?? 0) ?? [-1])) + 1;
  const listing: EventProductSeed = {
    id: genId("lst"),
    eventId,
    catalogProductId: input.catalogProductId,
    price: input.price,
    costPrice: input.costPrice,
    deliveryType: input.deliveryType,
    visible: input.visible ?? true,
    sortOrder: nextSortOrder,
    optionStock: Object.keys(optionStock).length > 0 ? optionStock : undefined,
  };
  saveEvents(events.map((e) => (e.id === eventId ? { ...e, products: [...e.products, listing] } : e)));
  return mergeListing(listing, catalog);
}

export interface EventProductPatch {
  price?: number;
  costPrice?: number;
  deliveryType?: EventType;
  visible?: boolean;
}

export async function updateEventProduct(eventProductId: string, patch: EventProductPatch): Promise<void> {
  if (isSupabaseConfigured) {
    const supabase = getSupabaseBrowserClient()!;
    const row: Record<string, unknown> = {};
    if (patch.price !== undefined) row.price = patch.price;
    if (patch.deliveryType !== undefined) row.delivery_type = patch.deliveryType ?? null;
    if (patch.visible !== undefined) row.visible = patch.visible;
    if (Object.keys(row).length > 0) {
      const { error } = await supabase.from("event_products").update(row).eq("id", eventProductId);
      if (error) throw error;
    }
    if (patch.costPrice !== undefined) {
      const { error: costError } = await supabase.from("event_product_costs").upsert({ event_product_id: eventProductId, cost_price: patch.costPrice });
      if (costError) throw costError;
    }
    return;
  }
  const events = loadEvents();
  saveEvents(events.map((e) => ({ ...e, products: e.products.map((p) => (p.id === eventProductId ? { ...p, ...patch } : p)) })));
}

// 리스팅의 옵션 조합 하나의 재고를 직접 고쳐쓴다(관리자가 "이 회차엔 블랙+260이
// 5개밖에 없어" 하고 조정하는 용도) — event_option_stock 스냅샷만 바뀌고
// 카탈로그의 기본 재고(defaultStock)는 그대로 둔다. valueIds는 재고관리
// 대상 그룹이 하나뿐이면 길이 1(그 값 자체), 두 개 이상이면 진짜 조합이다.
export async function updateEventOptionStock(eventProductId: string, valueIds: string[], stock: number): Promise<void> {
  const sortedIds = [...valueIds].sort();
  if (isSupabaseConfigured) {
    const supabase = getSupabaseBrowserClient()!;
    const { error } = await supabase
      .from("event_option_stock")
      .upsert({ event_product_id: eventProductId, value_ids: sortedIds, stock }, { onConflict: "event_product_id,value_ids" });
    if (error) throw error;
    return;
  }
  const key = sortedIds.join(",");
  const events = loadEvents();
  saveEvents(
    events.map((e) => ({
      ...e,
      products: e.products.map((p) => (p.id === eventProductId ? { ...p, optionStock: { ...p.optionStock, [key]: stock } } : p)),
    })),
  );
}

// 이벤트 안 상품 노출 순서를 통째로 다시 정한다 — orderedEventProductIds의
// 배열 순서 그대로 0,1,2...를 sort_order로 채운다. 관리자 화면의 ▲▼ 버튼이
// 현재 화면 순서에서 두 개를 스왑한 새 배열을 통째로 넘기는 방식으로 쓴다.
export async function reorderEventProducts(eventId: string, orderedEventProductIds: string[]): Promise<void> {
  if (isSupabaseConfigured) {
    const supabase = getSupabaseBrowserClient()!;
    await Promise.all(
      orderedEventProductIds.map((id, index) => supabase.from("event_products").update({ sort_order: index }).eq("id", id)),
    );
    return;
  }
  const sortOrderById = new Map(orderedEventProductIds.map((id, index) => [id, index]));
  const events = loadEvents();
  saveEvents(
    events.map((e) =>
      e.id === eventId ? { ...e, products: e.products.map((p) => (sortOrderById.has(p.id) ? { ...p, sortOrder: sortOrderById.get(p.id) } : p)) } : e,
    ),
  );
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

// ---------- 원가/수익 (관리자 전용) ----------
// product_costs/event_product_costs는 RLS가 is_admin()으로만 걸려 있어서
// listEvents()/getEvent()/listCatalogProducts()가 쓰는 공개 쿼리에는 아예
// 섞여 들어오지 않는다 — 관리자 화면에서 이 함수들을 따로 호출해서 이미
// 불러온 이벤트 리스팅/카탈로그 상품에 화면 쪽에서 직접 매칭해 붙인다.

// eventProductId -> 원가 스냅샷.
export async function getEventProductCosts(eventProductIds: string[]): Promise<Record<string, number>> {
  if (eventProductIds.length === 0) return {};
  if (isSupabaseConfigured) {
    const supabase = getSupabaseBrowserClient()!;
    const { data, error } = await supabase.from("event_product_costs").select("*").in("event_product_id", eventProductIds);
    if (error) throw error;
    return Object.fromEntries((data ?? []).map((r: Record<string, any>) => [r.event_product_id, r.cost_price]));
  }
  const result: Record<string, number> = {};
  for (const e of loadEvents()) {
    for (const p of e.products) {
      if (eventProductIds.includes(p.id) && p.costPrice !== undefined) result[p.id] = p.costPrice;
    }
  }
  return result;
}

// eventProductId -> 취소 제외 총 판매 수량("예상 수익" 계산용 — 발주확인 전
// 주문도 포함해서 지금까지 들어온 주문 기준으로 미리 보여준다. done 이후
// refund_requested/refunded도 실제로는 반품될 수 있어 포함 여부가 갈릴 수
// 있는데, 여기서는 "예상"이라는 표현에 맞춰 취소된 주문만 제외한다).
export async function getSoldQuantities(eventId: string): Promise<Record<string, number>> {
  const result: Record<string, number> = {};
  if (isSupabaseConfigured) {
    const supabase = getSupabaseBrowserClient()!;
    const { data, error } = await supabase
      .from("order_items")
      .select("event_product_id, quantity, orders!inner(event_id, status)")
      .eq("orders.event_id", eventId)
      .neq("orders.status", "cancelled");
    if (error) throw error;
    for (const row of data ?? []) {
      if (!row.event_product_id) continue;
      result[row.event_product_id] = (result[row.event_product_id] ?? 0) + row.quantity;
    }
    return result;
  }
  const orders = loadOrders().filter((o) => o.eventId === eventId && o.status !== "cancelled");
  for (const o of orders) {
    for (const item of o.items) {
      result[item.productId] = (result[item.productId] ?? 0) + item.quantity;
    }
  }
  return result;
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
  // 이 주문에 포함된 택배 배송비(무료배송 적용 후) — 이미 total에 더해진
  // 값을 그대로 스냅샷으로 저장해둔다. 안 주면 0(문고리/사다드림, 또는
  // 배송비 없는 택배).
  shippingFee?: number;
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

// 체크아웃 화면에서 이미 막지만, createOrder를 거치는 모든 경로(다른 화면이
// 생기거나 실수로 검증을 건너뛰어도)에서 한 번 더 최소 구매 수량을 검증한다.
// Supabase 모드는 create_order RPC 안에서도 같은 검증을 한 번 더 한다(진짜
// "서버" 검증) — 여기 있는 건 어느 모드든 공통으로 도는 클라이언트 쪽 방어선.
async function assertMinQuantities(items: OrderItem[]): Promise<void> {
  const events = await listEvents();
  for (const item of items) {
    for (const event of events) {
      const product = event.products.find((p) => p.id === item.productId);
      if (!product) continue;
      const minQty = product.minQty ?? 1;
      if (item.quantity < minQty) {
        throw new Error(`${product.name}은(는) 최소 ${minQty}개부터 주문할 수 있어요.`);
      }
      break;
    }
  }
}

export async function createOrder(input: NewOrderInput): Promise<Order> {
  await assertEventOrderable(input.eventId);
  await assertMinQuantities(input.items);
  const number = orderNumber();
  if (isSupabaseConfigured) {
    const supabase = getSupabaseBrowserClient()!;
    // orders/order_items를 클라이언트에서 각각 insert하던 방식은 게스트 주문에서
    // 항상 실패했다 — order_items의 INSERT 정책이 검사하는 "orders에 이 id가
    // 있는지" 서브쿼리도 orders의 SELECT 정책(profile_id = auth.uid())을 그대로
    // 타는데, 게스트 주문은 profile_id가 null이라 "NULL = auth.uid()(역시 null)"가
    // SQL에서 true가 아니라서 서브쿼리가 방금 만든 자기 주문조차 못 봄 → RLS 위반
    // 에러. SECURITY DEFINER RPC(create_order)로 이 둘을 한 번에 처리해서 이
    // 문제를 근본적으로 피한다(schema.sql 참고).
    const id = crypto.randomUUID();
    const createdAt = new Date().toISOString();
    const { error } = await supabase.rpc("create_order", {
      p_id: id,
      p_order_number: number,
      p_event_id: input.eventId,
      p_batch_id: input.batchId,
      p_profile_id: input.profileId,
      p_guest_name: input.guestName ?? null,
      p_guest_phone: input.guestPhone ?? null,
      p_guest_pin: input.guestPin ?? null,
      p_recipient_name: input.recipientName,
      p_recipient_phone: input.recipientPhone,
      p_address_snapshot: input.addressSnapshot,
      p_apartment_name: input.apartmentName || null,
      p_payment_method: input.paymentMethod,
      p_total: input.total,
      p_created_at: createdAt,
      p_items: input.items.map((item) => ({
        event_product_id: item.productId,
        product_name: item.productName,
        price_snapshot: item.price,
        quantity: item.quantity,
        options: item.options ?? [],
        stock_value_ids: item.stockComboValueIds ?? [],
      })),
      p_shipping_fee: input.shippingFee ?? 0,
    });
    if (error) throw error;
    const orderRow = {
      id,
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
      cancel_requested: false,
      cancel_reason: null,
      courier_code: null,
      tracking_number: null,
      total: input.total,
      shipping_fee: input.shippingFee ?? 0,
      created_at: createdAt,
    };
    // 재고 차감은 create_order RPC 안에서 주문 생성과 같은 트랜잭션으로
    // 처리된다(schema.sql 참고) — 재고가 부족하면 RPC 자체가 예외를 던지고
    // 위의 `if (error) throw error`에서 이미 걸러지므로, 여기서 따로 차감
    // RPC를 또 호출하지 않는다(예전에는 별도 호출이었는데, 주문은 만들어지고
    // 재고만 못 깎이거나 그 반대인 경우가 생길 수 있어 한 트랜잭션으로 합침).
    return mapSupabaseOrder(orderRow, input.items);
  }
  // Supabase 모드는 create_order RPC 안에서 재고를 원자적으로 검증/차감하지만
  // (schema.sql), mock 모드는 브라우저 localStorage뿐이라 그 RPC를 안 거친다 —
  // 그래도 "재고 부족이면 주문 자체를 거부한다"는 동작은 두 모드가 항상 같아야
  // 하므로 여기서 직접 한 번 더 확인한다(동시성 걱정은 없음 — mock은 탭 하나뿐).
  const eventsBeforeOrder = loadEvents();
  assertStockAvailable(eventsBeforeOrder, input.items);

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
    shippingFee: input.shippingFee ?? 0,
    createdAt: new Date().toISOString(),
  };
  saveOrders([order, ...loadOrders()]);
  saveEvents(decrementProductStock(eventsBeforeOrder, input.items));
  return order;
}

// 이 주문에 포함된 상품들의 요청 수량이 현재 재고(카탈로그 공유 재고 +
// 옵션 조합별 재고)를 넘으면 거부한다 — decrementProductStock이 하는 것과
// 같은 방식으로 상품/조합별 요청 수량을 합산해서 비교한다(applyStockDelta와
// 동일한 그룹핑 로직).
function assertStockAvailable(events: MarketEventSeed[], items: OrderItem[]): void {
  const catalogIdByListing = new Map<string, string>();
  const listingById = new Map<string, EventProductSeed>();
  for (const e of events) {
    for (const p of e.products) {
      catalogIdByListing.set(p.id, p.catalogProductId);
      listingById.set(p.id, p);
    }
  }
  const catalogById = new Map(loadCatalogProducts().map((c) => [c.id, c]));

  const requestedByCatalog = new Map<string, number>();
  const requestedByListingCombo = new Map<string, Record<string, number>>();
  for (const i of items) {
    const catalogId = catalogIdByListing.get(i.productId);
    if (catalogId) requestedByCatalog.set(catalogId, (requestedByCatalog.get(catalogId) ?? 0) + i.quantity);
    if (!i.stockComboValueIds || i.stockComboValueIds.length === 0) continue;
    const key = i.stockComboValueIds.join(",");
    const map = requestedByListingCombo.get(i.productId) ?? {};
    map[key] = (map[key] ?? 0) + i.quantity;
    requestedByListingCombo.set(i.productId, map);
  }

  for (const [catalogId, qty] of requestedByCatalog) {
    const stock = catalogById.get(catalogId)?.stock;
    if (stock !== undefined && qty > stock) {
      throw new Error("재고가 부족하여 주문할 수 없습니다.");
    }
  }
  for (const [listingId, combos] of requestedByListingCombo) {
    const optionStock = listingById.get(listingId)?.optionStock;
    if (!optionStock) continue;
    for (const [key, qty] of Object.entries(combos)) {
      const stock = optionStock[key];
      if (stock !== undefined && qty > stock) {
        throw new Error("재고가 부족하여 주문할 수 없습니다.");
      }
    }
  }
}

// 카탈로그 상품(products.stock의 mock 버전)의 공유 재고와 리스팅의 옵션값별
// 재고(event_option_stock의 mock 버전인 optionStock)를 합쳐서 주문 수량만큼
// 차감/복구하는 공통 로직. sign=1이면 차감(0 밑으로는 안 내려감), sign=-1이면
// 복구. items의 productId는 리스팅 id라 카탈로그 상품 id로 먼저 옮겨 담아야
// 한다 — 같은 카탈로그 상품을 쓰는 리스팅이 여러 이벤트에 걸쳐 있어도(Epic 1
// Phase 3) 결국 재고 하나를 같이 줄이고 늘려야 하기 때문.
function applyStockDelta(events: MarketEventSeed[], items: OrderItem[], sign: 1 | -1): { events: MarketEventSeed[]; catalog: CatalogProduct[] } {
  const catalogIdByListing = new Map<string, string>();
  for (const e of events) for (const p of e.products) catalogIdByListing.set(p.id, p.catalogProductId);

  const deltaByCatalog = new Map<string, number>();
  // 리스팅 id -> (comboKey -> 수량). comboKey는 주문 시점에 이미 정렬해
  // 저장해둔 stockComboValueIds를 그대로 이어붙인 것(재고관리 대상이 없으면
  // 건너뜀 — 무제한 조합은 애초에 optionStock에 키가 없음).
  const comboDeltaByListing = new Map<string, Record<string, number>>();
  for (const i of items) {
    const catalogId = catalogIdByListing.get(i.productId);
    if (catalogId) deltaByCatalog.set(catalogId, (deltaByCatalog.get(catalogId) ?? 0) + i.quantity);
    if (!i.stockComboValueIds || i.stockComboValueIds.length === 0) continue;
    const key = i.stockComboValueIds.join(",");
    const map = comboDeltaByListing.get(i.productId) ?? {};
    map[key] = (map[key] ?? 0) + i.quantity;
    comboDeltaByListing.set(i.productId, map);
  }

  const nextEvents = events.map((e) => ({
    ...e,
    products: e.products.map((p) => {
      const comboDelta = comboDeltaByListing.get(p.id);
      if (!comboDelta || !p.optionStock) return p;
      const optionStock = { ...p.optionStock };
      for (const [key, q] of Object.entries(comboDelta)) {
        if (optionStock[key] === undefined) continue;
        optionStock[key] = sign > 0 ? Math.max(0, optionStock[key] - q) : optionStock[key] + q;
      }
      return { ...p, optionStock };
    }),
  }));

  const nextCatalog = loadCatalogProducts().map((c) => {
    const qty = deltaByCatalog.get(c.id);
    if (!qty || c.stock === undefined) return c;
    return { ...c, stock: sign > 0 ? Math.max(0, c.stock - qty) : c.stock + qty };
  });

  return { events: nextEvents, catalog: nextCatalog };
}

// 재고가 있는 카탈로그 상품(stock이 정해진 상품)만 골라 주문 수량만큼
// 차감한다(0 밑으로는 안 내려감). stock이 undefined인 상품(재고 제한 없음)은
// 그대로 둔다. 카탈로그 저장은 이 함수 안에서 바로 처리하고(부수효과), 이벤트
// 쪽은 옵션재고 변경분만 반영해 호출부가 그대로 saveEvents에 넘기면 된다.
function decrementProductStock(events: MarketEventSeed[], items: OrderItem[]): MarketEventSeed[] {
  const { events: nextEvents, catalog } = applyStockDelta(events, items, 1);
  saveCatalogProducts(catalog);
  return nextEvents;
}

function restoreProductStock(events: MarketEventSeed[], items: OrderItem[]): MarketEventSeed[] {
  const { events: nextEvents, catalog } = applyStockDelta(events, items, -1);
  saveCatalogProducts(catalog);
  return nextEvents;
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
    // RPC가 order_items까지 jsonb로 같이 실어 반환한다 — 별도로 order_items를
    // select하면 게스트 주문은 RLS 때문에 항상 빈 배열만 돌아온다(schema.sql의
    // lookup_guest_orders 주석 참고).
    const { data, error } = await supabase.rpc("lookup_guest_orders", { p_name: name, p_pin: pin });
    if (error) throw error;
    const rows = data ?? [];
    return rows.map((row: Record<string, any>) => mapSupabaseOrder(row, (row.items ?? []).map(mapSupabaseOrderItem)));
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
      const { data: itemRows } = await supabase.from("order_items").select("event_product_id, quantity, stock_value_ids").eq("order_id", orderId);
      for (const item of itemRows ?? []) {
        if (!item.event_product_id) continue;
        await supabase.rpc("increment_stock", { p_event_product_id: item.event_product_id, p_qty: item.quantity });
        if (item.stock_value_ids && item.stock_value_ids.length > 0) {
          await supabase.rpc("increment_option_stock", { p_event_product_id: item.event_product_id, p_value_ids: item.stock_value_ids, p_qty: item.quantity });
        }
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
      inquiry_chat_url: input.inquiryChatUrl || null,
      kakao_channel_url: input.kakaoChannelUrl || null,
      opentalk_url: input.opentalkUrl || null,
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
  return {
    bankName: row.bank_name ?? "",
    accountNumber: row.account_number ?? "",
    accountHolder: row.account_holder ?? "",
    inquiryChatUrl: row.inquiry_chat_url ?? undefined,
    kakaoChannelUrl: row.kakao_channel_url ?? undefined,
    opentalkUrl: row.opentalk_url ?? undefined,
  };
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

// product_option_values 행 -> 카탈로그 옵션값(이벤트 재고 정보 없이 구조만).
function mapSupabaseOptionValue(row: Record<string, any>): ProductOptionValue {
  return {
    id: row.id,
    name: row.name,
    priceDelta: row.price_delta ?? 0,
    hasStock: row.has_stock ?? false,
    defaultStock: row.default_stock ?? undefined,
    sortOrder: row.sort_order ?? 0,
  };
}

// product_option_groups 행(+ 중첩된 product_option_values(*))을 카탈로그
// 옵션 그룹 목록으로 변환 — 정렬 순서(sort_order)대로 정리해서 내려준다.
function mapSupabaseOptionGroups(rows: Record<string, any>[] | undefined): ProductOptionGroup[] | undefined {
  if (!rows || rows.length === 0) return undefined;
  return rows
    .map((row) => ({
      id: row.id,
      name: row.name,
      required: row.required ?? true,
      multi: row.multi ?? false,
      sortOrder: row.sort_order ?? 0,
      values: (row.product_option_values ?? []).map(mapSupabaseOptionValue).sort((a: ProductOptionValue, b: ProductOptionValue) => a.sortOrder - b.sortOrder),
    }))
    .sort((a, b) => a.sortOrder - b.sortOrder);
}

// 이벤트 리스팅의 event_option_stock 행들을 comboKey(value_ids를 정렬해 이은
// 문자열) -> stock 맵으로. 재고관리 그룹이 하나뿐이면 comboKey가 그 값의
// id와 같아서, 값 하나 = 조합 하나였던 예전과 동일하게 동작한다.
function eventOptionStockMap(rows: Record<string, any>[] | undefined): Map<string, number> {
  return new Map((rows ?? []).map((r) => [((r.value_ids ?? []) as string[]).slice().sort().join(","), r.stock]));
}

// 이 리스팅의 옵션 조합별 재고를 그대로 Product.optionStockByCombo로 쓸 수
// 있는 평범한 객체로.
function optionStockByComboFromRows(rows: Record<string, any>[] | undefined): Record<string, number> | undefined {
  const map = eventOptionStockMap(rows);
  if (map.size === 0) return undefined;
  return Object.fromEntries(map);
}

// 카탈로그 옵션 그룹(구조)에 특정 리스팅의 event_option_stock 값을 채워 넣는다
// — 재고관리 그룹이 하나뿐인 경우의 편의 표시용(값 하나 = 조합 하나라 정확함).
// 두 개 이상이면 이 stock은 정확하지 않을 수 있어 화면에서 참고용으로만 써야
// 한다(실제 판단은 Product.optionStockByCombo로).
function mergeSupabaseOptionStock(groups: ProductOptionGroup[] | undefined, stockRows: Record<string, any>[] | undefined): ProductOptionGroup[] | undefined {
  if (!groups) return undefined;
  const stockMap = eventOptionStockMap(stockRows);
  return groups.map((g) => ({
    ...g,
    values: g.values.map((v) => (v.hasStock ? { ...v, stock: stockMap.get(v.id) ?? v.defaultStock ?? 0 } : v)),
  }));
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
    basePrice: row.base_price ?? 0,
    stock: row.stock ?? undefined,
    minQty: row.min_qty ?? 1,
    badge: row.badge ?? "NONE",
    shippingFee: row.shipping_fee ?? 0,
    shippingFeeType: row.shipping_fee_type ?? "fixed",
    freeShippingThreshold: row.free_shipping_threshold ?? 0,
    shippingFeeQtyUnit: row.shipping_fee_qty_unit ?? undefined,
    courierCode: row.courier_code ?? undefined,
    fulfillmentType: row.fulfillment_type ?? "same_day",
    shipsAt: row.ships_at ?? undefined,
    // product_costs는 1:1 관계라 PostgREST가 보통 객체로 embed하지만, 관계
    // 감지 방식에 따라 배열로 올 수도 있어 양쪽 다 방어적으로 처리한다.
    // RLS상 비관리자에게는 이 값 자체가 null로 오므로 costPrice가 그냥
    // undefined가 된다(별도 분기 불필요).
    costPrice: Array.isArray(row.product_costs) ? row.product_costs[0]?.cost_price : row.product_costs?.cost_price,
    optionGroups: mapSupabaseOptionGroups(row.product_option_groups),
  };
}

// event_products 행(+ 중첩된 products(*) 카탈로그 조인, event_option_stock(*))을
// 화면이 쓰는 평평한 Product로 합친다. mock 모드의 mergeListing과 같은 역할.
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
    // 카탈로그 상품(products.stock)의 공유 재고를 그대로 내려준다.
    stock: catalog.stock ?? undefined,
    minQty: catalog.min_qty ?? 1,
    badge: catalog.badge ?? "NONE",
    shippingFee: catalog.shipping_fee ?? 0,
    shippingFeeType: catalog.shipping_fee_type ?? "fixed",
    freeShippingThreshold: catalog.free_shipping_threshold ?? 0,
    shippingFeeQtyUnit: catalog.shipping_fee_qty_unit ?? undefined,
    courierCode: catalog.courier_code ?? undefined,
    fulfillmentType: catalog.fulfillment_type ?? "same_day",
    shipsAt: catalog.ships_at ?? undefined,
    visible: row.visible ?? true,
    optionGroups: mergeSupabaseOptionStock(mapSupabaseOptionGroups(catalog.product_option_groups), row.event_option_stock),
    optionStockByCombo: optionStockByComboFromRows(row.event_option_stock),
  };
}

function mapSupabaseEvent(row: Record<string, any>): MarketEvent {
  return {
    id: row.id,
    type: row.type,
    title: row.title,
    flashSale: row.flash_sale ?? false,
    status: row.status ?? "open",
    deadlineAt: row.deadline_at,
    deliveryAt: row.delivery_at,
    notice: row.notice ?? "",
    // 이벤트 안에서의 노출 순서(sort_order) 오름차순 — 관리자가 ▲▼로 바꾼다.
    products: (row.event_products ?? [])
      .slice()
      .sort((a: Record<string, any>, b: Record<string, any>) => (a.sort_order ?? 0) - (b.sort_order ?? 0))
      .map(mapSupabaseEventProduct),
  };
}

function mapSupabaseOrderItem(row: Record<string, any>): OrderItem {
  return {
    productId: row.event_product_id,
    productName: row.product_name,
    productEmoji: "📦",
    price: row.price_snapshot,
    quantity: row.quantity,
    options: row.options && row.options.length > 0 ? row.options : undefined,
    stockComboValueIds: row.stock_value_ids && row.stock_value_ids.length > 0 ? row.stock_value_ids : undefined,
  };
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
    shippingFee: row.shipping_fee ?? 0,
    createdAt: row.created_at,
  };
}
