"use client";

import { useEffect, useState } from "react";
import { listEvents, createNotification } from "@/lib/data";
import type { MarketEvent, NotificationLinkType } from "@/types";
import { NOTIFICATION_LINK_LABEL } from "@/types";

const LINK_TYPES: NotificationLinkType[] = ["NONE", "PRODUCT", "EVENT", "ORDER"];

export default function AdminNotificationsPage() {
  const [events, setEvents] = useState<MarketEvent[]>([]);
  const [title, setTitle] = useState("");
  const [message, setMessage] = useState("");
  const [icon, setIcon] = useState("📢");
  const [linkType, setLinkType] = useState<NotificationLinkType>("NONE");
  const [productId, setProductId] = useState("");
  const [eventId, setEventId] = useState("");
  const [orderId, setOrderId] = useState("");
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    listEvents().then(setEvents);
  }, []);

  const products = events.flatMap((e) => e.products.map((p) => ({ id: p.id, label: `${p.name} (${e.title})` })));

  async function send() {
    setError(null);
    if (!title.trim() || !message.trim()) {
      setError("제목과 내용을 입력해 주세요.");
      return;
    }
    const linkId = linkType === "PRODUCT" ? productId : linkType === "EVENT" ? eventId : linkType === "ORDER" ? orderId.trim() : undefined;
    if (linkType !== "NONE" && !linkId) {
      setError("연결할 대상을 선택해 주세요.");
      return;
    }
    setSending(true);
    await createNotification({ title: title.trim(), message: message.trim(), icon: icon || "📢", linkType, linkId, profileId: null });
    setSending(false);
    setSent(true);
    setTitle("");
    setMessage("");
    setLinkType("NONE");
    setProductId("");
    setEventId("");
    setOrderId("");
    setTimeout(() => setSent(false), 1800);
  }

  return (
    <div className="max-w-2xl">
      <p className="mb-4 text-[15px] font-bold">알림 발송</p>
      <p className="mb-4 text-[12.5px] text-text-muted">여기서 보낸 알림은 전체 고객에게 발송돼요. (배송 시작/완료 알림은 주문 상태를 바꿀 때 해당 주문 고객에게 자동으로 발송돼요)</p>

      <div className="flex flex-col gap-2.5 rounded-xl border border-border p-4">
        <div className="flex gap-2">
          <input className="w-16 rounded-[9px] border border-border bg-bg-card px-2 py-2.5 text-center text-[13px]" value={icon} onChange={(e) => setIcon(e.target.value)} placeholder="📢" />
          <input
            className="min-w-0 flex-1 rounded-[9px] border border-border bg-bg-card px-3 py-2.5 text-[13px]"
            placeholder="제목"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
          />
        </div>
        <textarea
          className="rounded-[9px] border border-border bg-bg-card px-3 py-2.5 text-[13px]"
          rows={3}
          placeholder="내용"
          value={message}
          onChange={(e) => setMessage(e.target.value)}
        />

        <p className="mt-1 text-[12px] font-bold text-text-muted">연결할 화면</p>
        <div className="flex gap-1.5">
          {LINK_TYPES.map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => setLinkType(t)}
              className={`rounded-[7px] border px-2.5 py-1.5 text-[12px] font-semibold ${
                linkType === t ? "border-accent bg-accent-soft text-accent-dark" : "border-border text-text-muted"
              }`}
            >
              {NOTIFICATION_LINK_LABEL[t]}
            </button>
          ))}
        </div>

        {linkType === "PRODUCT" && (
          <select className="rounded-[9px] border border-border bg-bg-card px-3 py-2.5 text-[13px]" value={productId} onChange={(e) => setProductId(e.target.value)}>
            <option value="">상품 선택</option>
            {products.map((p) => (
              <option key={p.id} value={p.id}>
                {p.label}
              </option>
            ))}
          </select>
        )}
        {linkType === "EVENT" && (
          <select className="rounded-[9px] border border-border bg-bg-card px-3 py-2.5 text-[13px]" value={eventId} onChange={(e) => setEventId(e.target.value)}>
            <option value="">이벤트 선택</option>
            {events.map((e) => (
              <option key={e.id} value={e.id}>
                {e.title}
              </option>
            ))}
          </select>
        )}
        {linkType === "ORDER" && (
          <input
            className="rounded-[9px] border border-border bg-bg-card px-3 py-2.5 text-[13px]"
            placeholder="주문 ID (관리자 주문 목록에서 확인)"
            value={orderId}
            onChange={(e) => setOrderId(e.target.value)}
          />
        )}

        {error && <p className="text-[12px] font-semibold text-red-600">{error}</p>}
        {sent && <p className="text-[12px] font-semibold text-accent-dark">알림을 발송했어요.</p>}

        <button onClick={send} disabled={sending} className="rounded-[9px] bg-accent py-2.5 text-[13px] font-bold text-white disabled:opacity-50">
          {sending ? "발송 중..." : "발송하기"}
        </button>
      </div>
    </div>
  );
}
