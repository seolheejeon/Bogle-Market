"use client";

// Read/dismissed status is tracked per-browser via localStorage rather than
// in the backend — it's a per-viewer concern, and doing it this way means it
// works identically whether or not Supabase is configured (no join table,
// no extra RLS surface), including for guests who have no persistent account.

const READ_KEY = "bogle_notification_reads";
const DISMISSED_KEY = "bogle_notification_dismissed";

// How long a notification stays visible before it's treated as expired.
// Pulled out as its own constant so a future admin settings screen only
// needs to change where this value comes from, not the filtering logic
// itself.
export const NOTIFICATION_RETENTION_DAYS = 30;

export function isWithinRetention(createdAt: string): boolean {
  const ageMs = Date.now() - new Date(createdAt).getTime();
  return ageMs <= NOTIFICATION_RETENTION_DAYS * 24 * 60 * 60 * 1000;
}

function loadIds(key: string): string[] {
  if (typeof window === "undefined") return [];
  try {
    return JSON.parse(window.localStorage.getItem(key) ?? "[]");
  } catch {
    return [];
  }
}

const UPDATE_EVENT = "bogle-notification-state-update";

function saveIds(key: string, ids: string[]) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(key, JSON.stringify(ids));
  window.dispatchEvent(new Event(UPDATE_EVENT));
}

// Header's unread badge lives outside the notifications page, so it can't
// rely on React state updates there — it listens for this event to refresh
// immediately after a read/dismiss action instead of waiting for the next
// route change.
export function onNotificationStateChange(callback: () => void): () => void {
  if (typeof window === "undefined") return () => {};
  window.addEventListener(UPDATE_EVENT, callback);
  return () => window.removeEventListener(UPDATE_EVENT, callback);
}

export function getReadIds(): Set<string> {
  return new Set(loadIds(READ_KEY));
}

export function markRead(id: string) {
  const ids = loadIds(READ_KEY);
  if (!ids.includes(id)) saveIds(READ_KEY, [...ids, id]);
}

export function markAllRead(ids: string[]) {
  const existing = new Set(loadIds(READ_KEY));
  ids.forEach((id) => existing.add(id));
  saveIds(READ_KEY, Array.from(existing));
}

export function getDismissedIds(): Set<string> {
  return new Set(loadIds(DISMISSED_KEY));
}

export function dismiss(id: string) {
  const ids = loadIds(DISMISSED_KEY);
  if (!ids.includes(id)) saveIds(DISMISSED_KEY, [...ids, id]);
}

export function dismissAll(ids: string[]) {
  const existing = new Set(loadIds(DISMISSED_KEY));
  ids.forEach((id) => existing.add(id));
  saveIds(DISMISSED_KEY, Array.from(existing));
}
