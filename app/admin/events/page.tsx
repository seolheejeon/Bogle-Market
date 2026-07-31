"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { listEvents, deleteEvent, duplicateEvent, updateEvent } from "@/lib/data";
import type { MarketEvent } from "@/types";
import { EVENT_TYPE_LABEL } from "@/types";
import { formatDateTime, toDateInputValue, dateInputValueToIso } from "@/lib/format";
import { EventBadgeTag } from "@/components/Badge";

function toLocalInputValue(d: Date) {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

type StatusFilter = "all" | "open" | "ended";

export default function AdminEventsPage() {
  const [events, setEvents] = useState<MarketEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [duplicatingId, setDuplicatingId] = useState<string | null>(null);
  const [filter, setFilter] = useState<StatusFilter>("all");

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

  // 종료는 deadlineAt과 무관하게 별도 상태(status)로 관리한다 — 배송방식별
  // 마감 정책(lib/order-policy.ts)보다 항상 우선해서 문고리/택배도 예외 없이
  // 즉시 주문이 막힌다. 배송일 당일까지는 고객 화면에 "마감"으로 조회만
  // 가능하고, 배송일 다음날 00:00부터 고객 화면에서 완전히 숨겨진다.
  async function onClose(event: MarketEvent) {
    if (!confirm(`"${event.title}"을(를) 지금 바로 종료할까요? 종료되면 고객 화면에서 즉시 주문이 막혀요.`)) return;
    await updateEvent(event.id, { status: "ended" });
    refresh();
  }

  async function onRestart(event: MarketEvent) {
    if (!confirm(`"${event.title}"을(를) 다시 진행중으로 되돌릴까요?`)) return;
    await updateEvent(event.id, { status: "open" });
    refresh();
  }

  const openEvents = events.filter((e) => e.status !== "ended");
  const endedEvents = events
    .filter((e) => e.status === "ended")
    .sort((a, b) => new Date(b.deliveryAt).getTime() - new Date(a.deliveryAt).getTime());
  // 진행중을 항상 먼저, 종료는 항상 하단에 — 필터가 "전체"일 때만 이 순서가 보임.
  const sorted = [...openEvents, ...endedEvents];
  const visible = filter === "all" ? sorted : filter === "open" ? openEvents : endedEvents;

  const FILTERS: { key: StatusFilter; label: string; count: number }[] = [
    { key: "all", label: "전체", count: events.length },
    { key: "open", label: "진행중", count: openEvents.length },
    { key: "ended", label: "종료", count: endedEvents.length },
  ];

  return (
    <div>
      <div className="mb-4 flex items-center justify-between">
        <p className="text-[15px] font-bold">이벤트/상품 관리</p>
        <Link href="/admin/events/new" className="rounded-[9px] bg-accent px-3.5 py-2 text-[13px] font-bold text-white">
          + 새 이벤트
        </Link>
      </div>
      <div className="mb-3 flex gap-1.5">
        {FILTERS.map((f) => (
          <button
            key={f.key}
            onClick={() => setFilter(f.key)}
            className={`rounded-full px-3 py-1.5 text-[12.5px] font-semibold ${
              filter === f.key ? "bg-accent text-white" : "bg-bg-sunken text-text-muted"
            }`}
          >
            {f.label} {f.count}
          </button>
        ))}
      </div>
      {loading && <p className="text-sm text-text-muted">불러오는 중...</p>}
      <div className="flex flex-col gap-2">
        {visible.map((e) => {
          const ended = e.status === "ended";
          return (
            <div key={e.id} className={`rounded-xl border border-border p-3.5 ${ended ? "opacity-60 grayscale-[0.4]" : ""}`}>
              <div className="flex items-center justify-between">
                <div>
                  <div className="flex items-center gap-1.5">
                    <span className="rounded-md bg-bg-sunken px-1.5 py-0.5 text-[11px] font-bold text-text-muted">{EVENT_TYPE_LABEL[e.type]}</span>
                    <EventBadgeTag badge={e.badge} />
                    {ended && <span className="rounded-md bg-text-muted px-1.5 py-0.5 text-[10.5px] font-bold text-white">종료됨</span>}
                    <span className="text-[14px] font-bold">{e.title}</span>
                  </div>
                  <p className="mt-1 text-[12px] text-text-muted">
                    상품 {e.products.length}개 · 마감 {formatDateTime(e.deadlineAt)}
                  </p>
                </div>
                <div className="flex flex-wrap justify-end gap-1.5">
                  <Link href={`/admin?event=${e.id}`} className="rounded-[8px] border border-border px-3 py-1.5 text-[12.5px] font-semibold">
                    주문보기
                  </Link>
                  <Link href={`/admin/events/${e.id}`} className="rounded-[8px] border border-border px-3 py-1.5 text-[12.5px] font-semibold">
                    수정
                  </Link>
                  <button
                    onClick={() => setDuplicatingId(duplicatingId === e.id ? null : e.id)}
                    className="rounded-[8px] bg-accent px-3 py-1.5 text-[12.5px] font-bold text-white"
                  >
                    복제
                  </button>
                  {ended ? (
                    <button onClick={() => onRestart(e)} className="rounded-[8px] border border-accent px-3 py-1.5 text-[12.5px] font-semibold text-accent-dark">
                      재시작
                    </button>
                  ) : (
                    <button onClick={() => onClose(e)} className="rounded-[8px] border border-border px-3 py-1.5 text-[12.5px] font-semibold text-red-600">
                      종료
                    </button>
                  )}
                  <button onClick={() => onDelete(e.id)} className="rounded-[8px] border border-border px-3 py-1.5 text-[12.5px] font-semibold text-red-600">
                    삭제
                  </button>
                </div>
              </div>
              {duplicatingId === e.id && <DuplicateForm event={e} onDone={() => setDuplicatingId(null)} onCreated={refresh} />}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// 복제 UX의 핵심: 상품 구성/가격/사진/상세설명은 원본을 그대로 복사하고,
// 회차마다 실제로 바뀌는 제목/마감/배송일 세 칸만 채우면 바로 새 회차가
// 만들어진다 — 자주 쓰는 동작이라 별도 페이지 이동 없이 인라인으로 처리.
function DuplicateForm({ event, onDone, onCreated }: { event: MarketEvent; onDone: () => void; onCreated: () => void }) {
  const router = useRouter();
  const [title, setTitle] = useState(`${event.title} (사본)`);
  const [deadlineAt, setDeadlineAt] = useState(toLocalInputValue(new Date(Date.now() + 24 * 3600 * 1000)));
  const [deliveryAt, setDeliveryAt] = useState(toDateInputValue(new Date(Date.now() + 48 * 3600 * 1000).toISOString()));
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit() {
    if (!title.trim()) {
      setError("이벤트 이름을 입력해 주세요.");
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      const created = await duplicateEvent(event.id, {
        title: title.trim(),
        deadlineAt: new Date(deadlineAt).toISOString(),
        deliveryAt: dateInputValueToIso(deliveryAt),
      });
      onCreated();
      router.push(`/admin/events/${created.id}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "복제 중 오류가 발생했어요.");
      setSubmitting(false);
    }
  }

  return (
    <div className="mt-3 flex flex-col gap-2.5 rounded-[10px] border border-dashed border-accent bg-accent-soft p-3">
      <p className="text-[12px] text-text-muted">상품 {event.products.length}개가 그대로 복사돼요. 이 회차만 다른 값(제목/마감/배송일)만 정해주세요.</p>
      <input className="rounded-[9px] border border-border bg-bg-card px-3 py-2 text-[13px]" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="이벤트 이름" />
      <div className="flex gap-2">
        <label className="flex-1 text-[11.5px] font-semibold text-text-muted">
          주문 마감
          <input
            type="datetime-local"
            className="mt-1 w-full rounded-[9px] border border-border bg-bg-card px-3 py-2 text-[13px]"
            value={deadlineAt}
            onChange={(e) => setDeadlineAt(e.target.value)}
          />
        </label>
        <label className="flex-1 text-[11.5px] font-semibold text-text-muted">
          배송일
          <input
            type="date"
            className="mt-1 w-full rounded-[9px] border border-border bg-bg-card px-3 py-2 text-[13px]"
            value={deliveryAt}
            onChange={(e) => setDeliveryAt(e.target.value)}
          />
        </label>
      </div>
      {error && <p className="text-[12px] font-semibold text-red-600">{error}</p>}
      <div className="flex gap-2">
        <button onClick={submit} disabled={submitting} className="rounded-[8px] bg-accent px-4 py-2 text-[12.5px] font-bold text-white disabled:opacity-50">
          {submitting ? "복제 중..." : "이 내용으로 복제 생성"}
        </button>
        <button onClick={onDone} className="rounded-[8px] border border-border px-4 py-2 text-[12.5px] font-semibold">
          취소
        </button>
      </div>
    </div>
  );
}
