"use client";

// Browser-only localStorage persistence used when Supabase isn't configured yet.
// Lets the app (including the admin panel) run end-to-end during development
// before a real backend is wired up.

import { MOCK_CATALOG_PRODUCTS, MOCK_EVENTS, MOCK_NOTIFICATIONS } from "@/lib/mock-data";
import type { CatalogProduct, MarketEventSeed, NotificationItem, Order, Profile, Address, StoreSettings } from "@/types";
import { EMPTY_STORE_SETTINGS } from "@/types";

const KEYS = {
  events: "bogle_events",
  catalogProducts: "bogle_catalog_products",
  orders: "bogle_orders",
  notifications: "bogle_notifications",
  authProfile: "bogle_auth_profile",
  addresses: "bogle_addresses",
  accounts: "bogle_accounts",
  storeSettings: "bogle_store_settings",
} as const;

interface MockAccount {
  password: string;
  profile: Profile;
}

function read<T>(key: string, fallback: T): T {
  if (typeof window === "undefined") return fallback;
  try {
    const raw = window.localStorage.getItem(key);
    if (!raw) return fallback;
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

// mock 모드는 실제 DB 대신 브라우저 localStorage에 그대로 저장하는데, 이 저장소는
// (브라우저마다 다르지만) 보통 5~50MB 정도의 하드 쿼터가 있다. 상품 사진을 data URL
// (base64) 그대로 담다 보니 사진을 여러 장 올리면 이 쿼터를 넘기기 쉽고, 그때
// localStorage.setItem은 **동기적으로 예외를 던진다** — 이걸 그냥 던지게 두면 호출부
// (lib/data.ts의 createXxx/updateXxx)가 reject된 Promise를 돌려주고, 그걸 try/catch
// 없이 기다리는 화면은 로딩 상태에 영원히 멈춰버린다(실제로 보고된 "저장 중..."이
// 끝나지 않는 버그의 근본 원인). 여기서 원인을 명확한 메시지로 바꿔 던져서, 호출부가
// 무엇이 잘못됐는지 알고 사용자에게 보여줄 수 있게 한다.
function write<T>(key: string, value: T) {
  if (typeof window === "undefined") return;
  const serialized = JSON.stringify(value);
  console.log(`[local-store] DB 저장 시작 (key=${key}, size=${(serialized.length / 1024 / 1024).toFixed(2)}MB)`);
  try {
    window.localStorage.setItem(key, serialized);
  } catch (e) {
    const isQuotaError = e instanceof DOMException && (e.name === "QuotaExceededError" || e.name === "NS_ERROR_DOM_QUOTA_REACHED");
    console.error(`[local-store] DB 저장 실패 (key=${key})`, e);
    if (isQuotaError) {
      throw new Error(
        "사진 용량이 너무 커서 저장하지 못했어요. 지금은 개발용 임시 저장소(브라우저 localStorage)를 쓰고 있어서 총 용량에 한계가 있어요 — 사진 개수나 용량을 줄이거나, 실제 서비스에서는 Supabase 연결로 이 한계가 사라져요.",
      );
    }
    throw e;
  }
  console.log(`[local-store] DB 저장 완료 (key=${key})`);
}

export function loadEvents(): MarketEventSeed[] {
  const existing = read<MarketEventSeed[] | null>(KEYS.events, null);
  if (existing) return existing;
  write(KEYS.events, MOCK_EVENTS);
  return MOCK_EVENTS;
}
export function saveEvents(events: MarketEventSeed[]) {
  write(KEYS.events, events);
}

export function loadCatalogProducts(): CatalogProduct[] {
  const existing = read<CatalogProduct[] | null>(KEYS.catalogProducts, null);
  if (existing) return existing;
  write(KEYS.catalogProducts, MOCK_CATALOG_PRODUCTS);
  return MOCK_CATALOG_PRODUCTS;
}
export function saveCatalogProducts(products: CatalogProduct[]) {
  write(KEYS.catalogProducts, products);
}

export function loadOrders(): Order[] {
  return read<Order[]>(KEYS.orders, []);
}
export function saveOrders(orders: Order[]) {
  write(KEYS.orders, orders);
}

export function loadNotifications(): NotificationItem[] {
  const existing = read<NotificationItem[] | null>(KEYS.notifications, null);
  if (existing) return existing;
  write(KEYS.notifications, MOCK_NOTIFICATIONS);
  return MOCK_NOTIFICATIONS;
}
export function saveNotifications(notifications: NotificationItem[]) {
  write(KEYS.notifications, notifications);
}

export function loadAuthProfile(): Profile | null {
  return read<Profile | null>(KEYS.authProfile, null);
}
export function saveAuthProfile(profile: Profile | null) {
  write(KEYS.authProfile, profile);
}

export function loadAddresses(): Address[] {
  return read<Address[]>(KEYS.addresses, []);
}
export function saveAddresses(addresses: Address[]) {
  write(KEYS.addresses, addresses);
}

export function genId(prefix: string) {
  return `${prefix}_${Math.random().toString(36).slice(2, 10)}`;
}

export function loadAccounts(): Record<string, MockAccount> {
  return read<Record<string, MockAccount>>(KEYS.accounts, {});
}
export function saveAccounts(accounts: Record<string, MockAccount>) {
  write(KEYS.accounts, accounts);
}

export function loadStoreSettings(): StoreSettings {
  return read<StoreSettings>(KEYS.storeSettings, EMPTY_STORE_SETTINGS);
}
export function saveStoreSettings(settings: StoreSettings) {
  write(KEYS.storeSettings, settings);
}
