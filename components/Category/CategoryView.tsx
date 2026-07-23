"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { listEvents } from "@/lib/data";
import type { EventType, MarketEvent } from "@/types";
import { EVENT_TYPE_LABEL } from "@/types";
import { formatDeadlineLabel } from "@/lib/format";
import { EventTypeBadge } from "@/components/Badge";
import { ProductGridCard } from "@/components/ProductGridCard";

const TABS: EventType[] = ["DOOR", "GROUP_BUY", "PARCEL"];

export function CategoryView({ initialType }: { initialType?: EventType }) {
  const [events, setEvents] = useState<MarketEvent[] | null>(null);
  const [type, setType] = useState<EventType>(initialType ?? "DOOR");

  useEffect(() => {
    listEvents().then(setEvents);
  }, []);

  const filtered = (events ?? []).filter((e) => e.type === type).sort((a, b) => new Date(a.deadlineAt).getTime() - new Date(b.deadlineAt).getTime());

  return (
    <div>
      <div className="flex gap-2 overflow-x-auto border-b border-border px-4 py-3">
        {TABS.map((t) => (
          <button
            key={t}
            onClick={() => setType(t)}
            className={`shrink-0 rounded-full px-3.5 py-1.5 text-[13px] font-semibold ${type === t ? "bg-accent text-white" : "bg-bg-sunken text-text-muted"}`}
          >
            {EVENT_TYPE_LABEL[t]}
          </button>
        ))}
      </div>

      {events === null && <p className="p-4 text-sm text-text-muted">불러오는 중...</p>}
      {events !== null && filtered.length === 0 && <p className="p-4 text-sm text-text-muted">진행 중인 이벤트가 없어요.</p>}

      <div className="flex flex-col gap-6 p-4">
        {filtered.map((event) => (
          <section key={event.id}>
            <div className="mb-2 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <EventTypeBadge type={event.type} flash={event.isFlash} />
                <Link href={`/event/${event.id}`} className="text-[15px] font-extrabold">
                  {event.title}
                </Link>
              </div>
              <span className="text-[11px] text-text-muted">{formatDeadlineLabel(event.deadlineAt)}</span>
            </div>
            <div className="grid grid-cols-2 gap-x-2.5 gap-y-3.5">
              {event.products.map((p) => (
                <ProductGridCard key={p.id} product={p} />
              ))}
            </div>
          </section>
        ))}
      </div>
    </div>
  );
}
