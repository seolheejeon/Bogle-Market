"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createEvent } from "@/lib/data";
import type { EventType } from "@/types";
import { toDateInputValue, dateInputValueToIso } from "@/lib/format";

function toLocalInputValue(d: Date) {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export default function NewEventPage() {
  const router = useRouter();
  const [type, setType] = useState<EventType>("DOOR");
  const [title, setTitle] = useState("");
  const [flashSale, setFlashSale] = useState(false);
  const [deadlineAt, setDeadlineAt] = useState(toLocalInputValue(new Date(Date.now() + 24 * 3600 * 1000)));
  const [deliveryAt, setDeliveryAt] = useState(toDateInputValue(new Date(Date.now() + 48 * 3600 * 1000).toISOString()));
  const [notice, setNotice] = useState("");
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
      // 택배는 상품(출고방식) 기준으로 운영돼 이벤트 단위 마감/배송일이 필요
      // 없다 — 화면에서 입력을 안 받는 대신 지금 시각으로 채워 넣는다(정책
      // 판단(order-policy.ts)에서 택배는 이 값을 애초에 보지 않으므로 값
      // 자체는 의미가 없고, NOT NULL 컬럼이라 채워는 둬야 한다).
      const now = new Date().toISOString();
      const event = await createEvent({
        type,
        title: title.trim(),
        flashSale: type === "PARCEL" ? false : flashSale,
        status: "open",
        deadlineAt: type === "PARCEL" ? now : new Date(deadlineAt).toISOString(),
        deliveryAt: type === "PARCEL" ? now : dateInputValueToIso(deliveryAt),
        notice,
      });
      router.push(`/admin/events/${event.id}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "저장 중 오류가 발생했어요.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="max-w-md">
      <p className="mb-4 text-[15px] font-bold">새 이벤트 등록</p>
      <div className="flex flex-col gap-3">
        <label className="text-[12.5px] font-semibold text-text-muted">
          구분
          <select className="mt-1 w-full rounded-[9px] border border-border bg-bg-card px-3 py-2.5 text-[13px]" value={type} onChange={(e) => setType(e.target.value as EventType)}>
            <option value="DOOR">문고리배송</option>
            <option value="GROUP_BUY">사다드림</option>
            <option value="PARCEL">택배</option>
          </select>
        </label>
        <label className="text-[12.5px] font-semibold text-text-muted">
          이벤트 이름
          <input className="mt-1 w-full rounded-[9px] border border-border bg-bg-card px-3 py-2.5 text-[13px]" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="예) 7/24 문고리배송" />
        </label>
        {type !== "PARCEL" && (
          <>
            <label className="flex items-center gap-2 text-[12.5px] font-semibold text-text-muted">
              <input type="checkbox" checked={flashSale} onChange={(e) => setFlashSale(e.target.checked)} />
              🔥 1시간 특가 이벤트로 지정 (마감이 지나면 배송방식과 무관하게 즉시 주문 마감)
            </label>
            <label className="text-[12.5px] font-semibold text-text-muted">
              주문 마감
              <input type="datetime-local" className="mt-1 w-full rounded-[9px] border border-border bg-bg-card px-3 py-2.5 text-[13px]" value={deadlineAt} onChange={(e) => setDeadlineAt(e.target.value)} />
            </label>
            <label className="text-[12.5px] font-semibold text-text-muted">
              배송일
              <input type="date" className="mt-1 w-full rounded-[9px] border border-border bg-bg-card px-3 py-2.5 text-[13px]" value={deliveryAt} onChange={(e) => setDeliveryAt(e.target.value)} />
            </label>
          </>
        )}
        <label className="text-[12.5px] font-semibold text-text-muted">
          안내 문구
          <textarea className="mt-1 w-full rounded-[9px] border border-border bg-bg-card px-3 py-2.5 text-[13px]" rows={3} value={notice} onChange={(e) => setNotice(e.target.value)} />
        </label>
      </div>
      {error && <p className="mt-3 text-[12.5px] font-semibold text-red-600">{error}</p>}
      <button className="mt-4 rounded-[10px] bg-accent px-5 py-2.5 text-[13px] font-bold text-white disabled:opacity-50" disabled={submitting} onClick={submit}>
        {submitting ? "저장 중..." : "이벤트 만들기"}
      </button>
    </div>
  );
}
