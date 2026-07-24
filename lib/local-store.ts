"use client";

// Browser-only localStorage persistence used when Supabase isn't configured yet.
// Lets the app (including the admin panel) run end-to-end during development
// before a real backend is wired up.

import { MOCK_EVENTS, MOCK_NOTIFICATIONS } from "@/lib/mock-data";
import type { MarketEvent, NotificationItem, Order, Profile, Address } from "@/types";

const KEYS = {
  events: "bogle_events",
  orders: "bogle_orders",
  notifications: "bogle_notifications",
  authProfile: "bogle_auth_profile",
  addresses: "bogle_addresses",
  accounts: "bogle_accounts",
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

function write<T>(key: string, value: T) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(key, JSON.stringify(value));
}

export function loadEvents(): MarketEvent[] {
  const existing = read<MarketEvent[] | null>(KEYS.events, null);
  if (existing) return existing;
  write(KEYS.events, MOCK_EVENTS);
  return MOCK_EVENTS;
}
export function saveEvents(events: MarketEvent[]) {
  write(KEYS.events, events);
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
