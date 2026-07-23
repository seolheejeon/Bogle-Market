"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { listEvents } from "@/lib/data";
import type { EventType, MarketEvent } from "@/types";
import { EVENT_TYPE_LABEL } from "@/types";
import { formatDeadlineLabel, formatEventDateChip } from "@/lib/format";
import { ProductGridCard } from "@/components/ProductGridCard";

const TABS: EventType[] = ["DOOR", "GROUP_BUY", "PARCEL"];

export function CategoryView({ initialType }: { initialType?: EventType }) {
  const [events, setEvents] = useState<MarketEvent[] | null>(null);
  const [type, setType] = useState<EventType>(initialType ?? "DOOR");
  const [selectedEventId, setSelectedEventId] = useState<string | null>(null);

  useEffect(() => {
    listEvents().then(setEvents);
  }, []);

  const eventsForType = useMemo(
    () =>
      (events ?? [])
        .filter((e) => e.type === type)
        .sort((a, b) => new Date(a.deliveryAt).getTime() - new Date(b.deliveryAt).getTime()),
    [events, type],
  );

  // Default to the earliest delivery date; keep the current pick if it's still valid for this list.
  useEffect(() => {
    setSelectedEventId((prev) => {
      if (eventsForType.length === 0) return null;
      return prev && eventsForType.some((e) => e.id === prev) ? prev : eventsForType[0].id;
    });
  }, [eventsForType]);

  const selectedEvent = eventsForType.find((e) => e.id === selectedEventId) ?? null;

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
      {events !== null && eventsForType.length === 0 && <p className="p-4 text-sm text-text-muted">진행 중인 이벤트가 없어요.</p>}

      {eventsForType.length > 0 && (
        <div className="flex gap-2 overflow-x-auto px-4 py-3">
          {eventsForType.map((event) => (
            <button
              key={event.id}
              onClick={() => setSelectedEventId(event.id)}
              className={`shrink-0 rounded-full border px-3.5 py-1.5 text-[13px] font-semibold transition-colors ${
                selectedEventId === event.id ? "border-accent bg-accent text-white" : "border-border bg-bg-card text-text-muted"
              }`}
            >
              {formatEventDateChip(event.deliveryAt)}
            </button>
          ))}
        </div>
      )}

      {selectedEvent && (
        <div className="p-4 pt-0">
          <div className="mb-3 flex items-center justify-between">
            <Link href={`/event/${selectedEvent.id}`} className="text-[15px] font-extrabold">
              {selectedEvent.title}
            </Link>
            <span className="text-[11px] text-text-muted">{formatDeadlineLabel(selectedEvent.deadlineAt)}</span>
          </div>
          {selectedEvent.products.length === 0 ? (
            <p className="text-sm text-text-muted">등록된 상품이 없어요.</p>
          ) : (
            <div className="grid grid-cols-2 gap-x-2 gap-y-2.5">
              {selectedEvent.products.map((p) => (
                <ProductGridCard key={p.id} product={p} />
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
