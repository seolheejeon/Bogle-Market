"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { listEvents } from "@/lib/data";
import { isEventOrderable, isEventVisibleToCustomers } from "@/lib/order-policy";
import type { EventType, MarketEvent } from "@/types";
import { EVENT_TYPE_LABEL } from "@/types";
import { formatDeadlineLabel, formatEventDateChip } from "@/lib/format";
import { ProductGridCard } from "@/components/ProductGridCard";

const TABS: EventType[] = ["DOOR", "GROUP_BUY", "PARCEL"];

// 상품 상세에서 "←"로 뒤로 왔을 때 마지막으로 보던 배송방식/날짜탭이 그대로
// 남아있어야 해서(브라우저 back이 이 화면으로 돌아왔을 때), 선택 상태를 URL
// 쿼리(type/event)에도 그대로 반영해둔다 — history entry를 새로 쌓지 않도록
// push가 아니라 replace를 쓴다. 스크롤 위치는 진짜 브라우저 back(popstate)일
// 때 브라우저가 알아서 복원해준다(별도 처리 불필요).
export function CategoryView({ initialType }: { initialType?: EventType }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const urlType = searchParams.get("type") as EventType | null;
  const urlEventId = searchParams.get("event");

  const [events, setEvents] = useState<MarketEvent[] | null>(null);
  const [type, setType] = useState<EventType>((urlType && TABS.includes(urlType) ? urlType : initialType) ?? "DOOR");
  const [selectedEventId, setSelectedEventId] = useState<string | null>(urlEventId);

  useEffect(() => {
    // 노출 꺼둔 상품은 카테고리 그리드에 안 보이게 걸러두고, 종료된 지 하루
    // 지난 이벤트도 함께 걸러낸다(isEventVisibleToCustomers) — 종료 당일까지는
    // 계속 보이되 QtyControl이 "마감"으로 표시하고 담기를 막는다.
    listEvents().then((all) =>
      setEvents(
        all.filter(isEventVisibleToCustomers).map((e) => ({ ...e, products: e.products.filter((p) => p.visible !== false) })),
      ),
    );
  }, []);

  const eventsForType = useMemo(
    () =>
      (events ?? [])
        .filter((e) => e.type === type)
        .sort((a, b) => new Date(a.deliveryAt).getTime() - new Date(b.deliveryAt).getTime()),
    [events, type],
  );

  // 택배는 회차(날짜)별로 운영되는 문고리/사다드림과 달리 상시 판매 상품을
  // 등록하는 방식이라 날짜 탭 자체가 필요 없다 — 이벤트를 여러 개로 나눠뒀어도
  // 고객에게는 그냥 하나의 상품 목록으로 합쳐서 보여준다.
  const isDateless = type === "PARCEL";

  // Default to the earliest delivery date; keep the current pick if it's still valid for this list.
  useEffect(() => {
    if (isDateless) return;
    setSelectedEventId((prev) => {
      if (eventsForType.length === 0) return null;
      return prev && eventsForType.some((e) => e.id === prev) ? prev : eventsForType[0].id;
    });
  }, [eventsForType, isDateless]);

  const selectedEvent = !isDateless ? (eventsForType.find((e) => e.id === selectedEventId) ?? null) : null;
  const parcelProducts = useMemo(
    () => (isDateless ? eventsForType.flatMap((e) => e.products.map((p) => ({ product: p, closed: !isEventOrderable(e) }))) : []),
    [isDateless, eventsForType],
  );

  // 지금 선택 상태를 URL에도 그대로 반영해둔다(history를 새로 쌓지 않도록 replace) —
  // 상품 상세로 갔다가 브라우저 "뒤로"로 돌아오면 이 URL 그대로 복귀하므로 탭/날짜
  // 선택이 유지된다.
  useEffect(() => {
    const params = new URLSearchParams();
    params.set("type", type);
    if (selectedEventId) params.set("event", selectedEventId);
    router.replace(`/category?${params.toString()}`, { scroll: false });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [type, selectedEventId]);

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
      {events !== null && eventsForType.length === 0 && (
        <p className="p-4 text-sm text-text-muted">{isDateless ? "등록된 상품이 없어요." : "진행 중인 이벤트가 없어요."}</p>
      )}

      {!isDateless && eventsForType.length > 0 && (
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

      {!isDateless && selectedEvent && (
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
                <ProductGridCard key={p.id} product={p} closed={!isEventOrderable(selectedEvent)} />
              ))}
            </div>
          )}
        </div>
      )}

      {isDateless && parcelProducts.length > 0 && (
        <div className="p-4 pt-3">
          <div className="grid grid-cols-2 gap-x-2 gap-y-2.5">
            {parcelProducts.map(({ product, closed }) => (
              <ProductGridCard key={product.id} product={product} closed={closed} />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
