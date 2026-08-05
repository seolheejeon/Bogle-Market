"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { listNotifications, getStoreSettings } from "@/lib/data";
import { useAuth } from "@/lib/auth-context";
import { DEFAULT_NOTIFICATION_RETENTION_DAYS, type NotificationItem } from "@/types";
import { formatDateTime } from "@/lib/format";
import { getReadIds, getDismissedIds, markRead, markAllRead, dismiss, dismissAll, isWithinRetention } from "@/lib/notification-state";
import { isPushSupported, getNotificationPermission, enablePush, disablePush, getCurrentPushSubscription, PUSH_FAILURE_MESSAGE } from "@/lib/push";

// "지원 브라우저라면 항상 클릭 가능해야 한다" — permission이 이미 denied여도
// 버튼은 눌리게 두고(눌러서 다시 확인해보는 것 자체가 사용자에게 유용한
// 피드백이다), 클릭 자체가 의미 없는 두 경우(이 브라우저가 애초에 Push API를
// 지원 안 하거나, HTTPS가 아니라 API 자체가 없는 경우)만 진짜로 비활성화한다.
//
// 버튼 on/off 상태는 반드시 "실제 구독 여부"(pushManager.getSubscription())로
// 판단해야 한다 — 예전엔 Notification.permission(브라우저 알림 권한)으로
// 판단했는데, 이 권한은 한 번 "허용"되면 구독을 끊어도 절대 되돌아가지 않는
// 값이라 "끄기"를 눌러 실제로 구독 해제가 됐어도 버튼이 계속 "끄기"로 남아
// 있었다 — 그래서 끄기도, 이후 다시 켜기도 전부 안 되는 것처럼 보였던 버그.
function PushOptIn() {
  const { profile } = useAuth();
  const [status, setStatus] = useState<"loading" | "subscribed" | "unsubscribed">("loading");
  const [denied, setDenied] = useState(false);
  const [busy, setBusy] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [hardBlocked, setHardBlocked] = useState<string | null>(null);

  useEffect(() => {
    if (typeof window !== "undefined" && !window.isSecureContext) {
      setHardBlocked(PUSH_FAILURE_MESSAGE.insecure);
      setStatus("unsubscribed");
      return;
    }
    if (!isPushSupported()) {
      setHardBlocked(PUSH_FAILURE_MESSAGE.unsupported);
      setStatus("unsubscribed");
      return;
    }
    setDenied(getNotificationPermission() === "denied");
    getCurrentPushSubscription().then((sub) => setStatus(sub ? "subscribed" : "unsubscribed"));
  }, []);

  async function toggle() {
    setBusy(true);
    setErrorMessage(null);
    try {
      if (status === "subscribed") {
        await disablePush();
        setStatus("unsubscribed");
        return;
      }
      const result = await enablePush(profile?.id ?? null);
      if (result.ok) {
        setStatus("subscribed");
        setDenied(false);
      } else {
        setErrorMessage(result.message);
        setDenied(getNotificationPermission() === "denied");
      }
    } finally {
      setBusy(false);
    }
  }

  const subscribed = status === "subscribed";

  return (
    <div className="mx-4 mt-3 flex flex-col gap-1.5 rounded-[10px] bg-bg-sunken px-3.5 py-3">
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[12.5px] font-bold">푸시 알림</p>
          <p className="mt-0.5 text-[11.5px] text-text-muted">
            {hardBlocked
              ? hardBlocked
              : subscribed
                ? "이 기기로 알림을 받고 있어요."
                : denied
                  ? "브라우저에서 알림이 차단돼 있어요. 아래 버튼을 눌러 다시 확인해보세요."
                  : "배송 소식을 앱처럼 바로 받아보세요."}
          </p>
        </div>
        <button
          onClick={toggle}
          disabled={busy || !!hardBlocked || status === "loading"}
          className={`shrink-0 rounded-full px-3.5 py-1.5 text-[12px] font-bold disabled:opacity-50 ${
            subscribed ? "border border-border text-text-muted" : "bg-accent text-white"
          }`}
        >
          {busy ? "확인 중..." : subscribed ? "끄기" : "받기"}
        </button>
      </div>
      {errorMessage && <p className="text-[11.5px] font-semibold text-red-600">{errorMessage}</p>}
    </div>
  );
}

export default function NotificationsPage() {
  const router = useRouter();
  const { profile } = useAuth();
  const [items, setItems] = useState<NotificationItem[] | null>(null);
  const [readIds, setReadIds] = useState<Set<string>>(new Set());
  const [retentionDays, setRetentionDays] = useState(DEFAULT_NOTIFICATION_RETENTION_DAYS);

  useEffect(() => {
    getStoreSettings().then((s) => setRetentionDays(s.notificationRetentionDays ?? DEFAULT_NOTIFICATION_RETENTION_DAYS));
  }, []);

  function refresh() {
    listNotifications(profile?.id ?? null).then((all) => {
      const dismissed = getDismissedIds();
      setItems(all.filter((n) => !dismissed.has(n.id) && isWithinRetention(n.createdAt, retentionDays)));
      setReadIds(getReadIds());
    });
  }
  useEffect(refresh, [profile, retentionDays]);

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
