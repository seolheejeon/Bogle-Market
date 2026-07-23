"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { listNotifications } from "@/lib/data";
import type { NotificationItem } from "@/types";
import { formatDateTime } from "@/lib/format";

export default function NotificationsPage() {
  const router = useRouter();
  const [items, setItems] = useState<NotificationItem[]>([]);

  useEffect(() => {
    listNotifications().then(setItems);
  }, []);

  return (
    <div>
      <div className="flex items-center gap-2 border-b border-border px-4 py-3">
        <button onClick={() => router.push("/")} className="p-1 text-xl text-text">
          ‹
        </button>
        <strong className="text-[15px]">알림</strong>
      </div>
      {items.length === 0 && <p className="p-4 text-sm text-text-muted">알림이 없어요.</p>}
      <div>
        {items.map((n) => (
          <div key={n.id} className="flex gap-3 border-b border-border px-4 py-3.5">
            <span className="text-xl">{n.icon}</span>
            <div className="min-w-0 flex-1">
              <p className="text-[13px] leading-relaxed">{n.message}</p>
              <p className="mt-1 text-[11px] text-text-muted">{formatDateTime(n.createdAt)}</p>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
