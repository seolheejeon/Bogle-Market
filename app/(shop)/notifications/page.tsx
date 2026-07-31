"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { listNotifications } from "@/lib/data";
import { useAuth } from "@/lib/auth-context";
import type { NotificationItem } from "@/types";
import { formatDateTime } from "@/lib/format";
import { getReadIds, getDismissedIds, markRead, markAllRead, dismiss, dismissAll, isWithinRetention } from "@/lib/notification-state";
import { isPushSupported, getNotificationPermission, enablePush, disablePush } from "@/lib/push";

function PushOptIn() {
  const { profile } = useAuth();
  const [permission, setPermission] = useState<NotificationPermission | "unsupported">("unsupported");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    setPermission(getNotificationPermission());
  }, []);

  if (!isPushSupported()) return null;

  async function toggle() {
    setBusy(true);
    try {
      if (permission === "granted") {
        await disablePush();
        setPermission("default");
      } else {
        const sub = await enablePush(profile?.id ?? null);
        setPermission(sub ? "granted" : getNotificationPermission());
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mx-4 mt-3 flex items-center justify-between gap-3 rounded-[10px] bg-bg-sunken px-3.5 py-3">
      <div className="min-w-0">
        <p className="text-[12.5px] font-bold">푸시 알림</p>
        <p className="mt-0.5 text-[11.5px] text-text-muted">
          {permission === "granted" ? "이 기기로 알림을 받고 있어요." : permission === "denied" ? "브라우저 설정에서 알림이 차단돼 있어요." : "배송 소식을 앱처럼 바로 받아보세요."}
        </p>
      </div>
      <button
        onClick={toggle}
        disabled={busy || permission === "denied"}
        className={`shrink-0 rounded-full px-3.5 py-1.5 text-[12px] font-bold disabled:opacity-50 ${
          permission === "granted" ? "border border-border text-text-muted" : "bg-accent text-white"
        }`}
      >
        {permission === "granted" ? "끄기" : "받기"}
      </button>
    </div>
  );
}

export default function NotificationsPage() {
  const router = useRouter();
  const { profile } = useAuth();
  const [items, setItems] = useState<NotificationItem[] | null>(null);
  const [readIds, setReadIds] = useState<Set<string>>(new Set());

  function refresh() {
    listNotifications(profile?.id ?? null).then((all) => {
      const dismissed = getDismissedIds();
      setItems(all.filter((n) => !dismissed.has(n.id) && isWithinRetention(n.createdAt)));
      setReadIds(getReadIds());
    });
  }
  useEffect(refresh, [profile]);

  function open(n: NotificationItem) {
    markRead(n.id);
    setReadIds(getReadIds());
    if (n.linkType === "PRODUCT" && n.linkId) router.push(`/product/${n.linkId}`);
    else if (n.linkType === "EVENT" && n.linkId) router.push(`/event/${n.linkId}`);
    else if (n.linkType === "ORDER" && n.linkId) router.push(`/orders/${n.linkId}`);
  }

  function markAll() {
    if (!items || items.length === 0) return;
    markAllRead(items.map((n) => n.id));
    setReadIds(getReadIds());
  }

  function deleteAll() {
    if (!items || items.length === 0) return;
    if (!confirm("모든 알림을 삭제할까요?")) return;
    dismissAll(items.map((n) => n.id));
    setItems([]);
  }

  function deleteOne(id: string) {
    dismiss(id);
    setItems((prev) => prev?.filter((n) => n.id !== id) ?? null);
  }

  return (
    <div>
      <div className="flex items-center justify-between border-b border-border px-4 py-3">
        <div className="flex items-center gap-2">
          <button onClick={() => router.push("/")} className="p-1 text-xl text-text">
            ‹
          </button>
          <strong className="text-[15px]">알림</strong>
        </div>
        {items && items.length > 0 && (
          <div className="flex gap-2.5">
            <button onClick={markAll} className="text-[12px] font-semibold text-text-muted">
              전체 읽음
            </button>
            <button onClick={deleteAll} className="text-[12px] font-semibold text-red-600">
              전체 삭제
            </button>
          </div>
        )}
      </div>
      <PushOptIn />
      {items !== null && items.length === 0 && <p className="p-4 text-sm text-text-muted">알림이 없어요.</p>}
      <div>
        {items?.map((n) => {
          const isRead = readIds.has(n.id);
          const clickable = n.linkType !== "NONE";
          return (
            <div
              key={n.id}
              onClick={() => clickable && open(n)}
              className={`flex gap-3 border-b border-border px-4 py-3.5 ${clickable ? "cursor-pointer" : ""} ${isRead ? "" : "bg-accent-soft/50"}`}
            >
              <span className="relative shrink-0 text-xl">
                {n.icon}
                {!isRead && <span className="absolute -top-0.5 -right-0.5 h-2 w-2 rounded-full bg-red-500" />}
              </span>
              <div className="min-w-0 flex-1">
                <p className="text-[13px] font-bold">{n.title}</p>
                <p className="mt-0.5 text-[12.5px] leading-relaxed text-text-muted">{n.message}</p>
                <p className="mt-1 text-[11px] text-text-muted">{formatDateTime(n.createdAt)}</p>
              </div>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  deleteOne(n.id);
                }}
                className="shrink-0 self-start text-[11px] text-text-muted"
              >
                삭제
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
}
