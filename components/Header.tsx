"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useCart } from "@/lib/cart-context";
import { useAuth } from "@/lib/auth-context";
import { listNotifications, getStoreSettings } from "@/lib/data";
import { DEFAULT_NOTIFICATION_RETENTION_DAYS } from "@/types";
import { getReadIds, getDismissedIds, isWithinRetention, onNotificationStateChange } from "@/lib/notification-state";

export function Header() {
  const { count } = useCart();
  const { profile } = useAuth();
  const pathname = usePathname();
  const [unread, setUnread] = useState(0);
  const [retentionDays, setRetentionDays] = useState(DEFAULT_NOTIFICATION_RETENTION_DAYS);

  useEffect(() => {
    getStoreSettings().then((s) => setRetentionDays(s.notificationRetentionDays ?? DEFAULT_NOTIFICATION_RETENTION_DAYS));
  }, []);

  useEffect(() => {
    function refresh() {
      listNotifications(profile?.id ?? null).then((all) => {
        const read = getReadIds();
        const dismissed = getDismissedIds();
        setUnread(all.filter((n) => !read.has(n.id) && !dismissed.has(n.id) && isWithinRetention(n.createdAt, retentionDays)).length);
      });
    }
    refresh();
    return onNotificationStateChange(refresh);
  }, [profile, pathname, retentionDays]);

  return (
    <header className="sticky top-0 z-10 flex items-center justify-between border-b border-border bg-bg-card px-4 py-3">
      <Link href="/" className="flex items-center gap-2 font-extrabold text-accent-dark">
        <Image src="/images/bogle.png" alt="보글마켓 마스코트" width={46} height={46} className="shrink-0 object-contain" />
        <span className="flex flex-col justify-center leading-tight">
          <span className="block">보글마켓</span>
          <span className="block text-[10.5px] font-medium text-text-muted">우리 동네 맛있는 공동구매</span>
        </span>
      </Link>
      <div className="flex items-center gap-1">
        <Link id="header-cart-link" href="/cart" className="relative p-1.5 text-xl" aria-label="장바구니">
          🛒
          {count > 0 && (
            <span className="absolute top-0 right-0 flex h-4 min-w-4 items-center justify-center rounded-full bg-accent px-1 text-[10px] font-bold text-white">
              {count}
            </span>
          )}
        </Link>
        <Link href="/notifications" className="relative p-1.5 text-xl" aria-label="알림">
          🔔
          {unread > 0 && (
            <span className="absolute top-0 right-0 flex h-4 min-w-4 items-center justify-center rounded-full bg-accent px-1 text-[10px] font-bold text-white">
              {unread}
            </span>
          )}
        </Link>
      </div>
    </header>
  );
}
