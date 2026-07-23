"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { listEvents, deleteEvent } from "@/lib/data";
import type { MarketEvent } from "@/types";
import { EVENT_TYPE_LABEL } from "@/types";
import { formatDateTime } from "@/lib/format";

export default function AdminEventsPage() {
  const [events, setEvents] = useState<MarketEvent[]>([]);
  const [loading, setLoading] = useState(true);

  function refresh() {
    listEvents().then((e) => {
      setEvents(e);
      setLoading(false);
    });
  }

  useEffect(refresh, []);

  async function onDelete(id: string) {
    if (!confirm("이 이벤트와 소속 상품을 모두 삭제할까요?")) return;
    await deleteEvent(id);
    refresh();
  }

  return (
    <div>
      <div className="mb-4 flex items-center justify-between">
        <p className="text-[15px] font-bold">이벤트/상품 관리</p>
        <Link href="/admin/events/new" className="rounded-[9px] bg-accent px-3.5 py-2 text-[13px] font-bold text-white">
          + 새 이벤트
        </Link>
      </div>
      {loading && <p className="text-sm text-text-muted">불러오는 중...</p>}
      <div className="flex flex-col gap-2">
        {events.map((e) => (
          <div key={e.id} className="flex items-center justify-between rounded-xl border border-border p-3.5">
            <div>
              <div className="flex items-center gap-1.5">
                <span className="rounded-md bg-bg-sunken px-1.5 py-0.5 text-[11px] font-bold text-text-muted">{EVENT_TYPE_LABEL[e.type]}</span>
                {e.isFlash && <span className="rounded-md bg-[var(--badge-flash-bg)] px-1.5 py-0.5 text-[11px] font-bold text-[var(--badge-flash-fg)]">특가</span>}
                <span className="text-[14px] font-bold">{e.title}</span>
              </div>
              <p className="mt-1 text-[12px] text-text-muted">
                상품 {e.products.length}개 · 마감 {formatDateTime(e.deadlineAt)}
              </p>
            </div>
            <div className="flex gap-1.5">
              <Link href={`/admin/events/${e.id}`} className="rounded-[8px] border border-border px-3 py-1.5 text-[12.5px] font-semibold">
                관리
              </Link>
              <button onClick={() => onDelete(e.id)} className="rounded-[8px] border border-border px-3 py-1.5 text-[12.5px] font-semibold text-red-600">
                삭제
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
