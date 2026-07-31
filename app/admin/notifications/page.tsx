"use client";

import { useEffect, useState } from "react";
import { listEvents, listCatalogProducts, createNotification } from "@/lib/data";
import { resolveListingId } from "@/lib/banner-link";
import type { CatalogProduct, MarketEvent, NotificationLinkType } from "@/types";
import { NOTIFICATION_LINK_LABEL } from "@/types";
import { SearchPicker } from "@/components/admin/SearchPicker";
import { ProductPhoto } from "@/components/ProductPhoto";
import { getAccessToken, sendPushBroadcast } from "@/lib/push";

const LINK_TYPES: NotificationLinkType[] = ["NONE", "PRODUCT", "EVENT", "ORDER"];

export default function AdminNotificationsPage() {
  const [events, setEvents] = useState<MarketEvent[]>([]);
  const [catalog, setCatalog] = useState<CatalogProduct[] | null>(null);
  const [title, setTitle] = useState("");
  const [message, setMessage] = useState("");
  const [icon, setIcon] = useState("📢");
  const [linkType, setLinkType] = useState<NotificationLinkType>("NONE");
  const [selectedProduct, setSelectedProduct] = useState<CatalogProduct | null>(null);
  const [selectedEvent, setSelectedEvent] = useState<MarketEvent | null>(null);
  const [orderId, setOrderId] = useState("");
  const [pushToo, setPushToo] = useState(true);
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    listEvents().then(setEvents);
    listCatalogProducts().then(setCatalog);
  }, []);

  async function send() {
    setError(null);
    if (!title.trim() || !message.trim()) {
      setError("제목과 내용을 입력해 주세요.");
      return;
    }
    let linkId: string | undefined;
    if (linkType === "PRODUCT") {
      if (!selectedProduct) {
        setError("연결할 상품을 선택해 주세요.");
        return;
      }
      linkId = resolveListingId(selectedProduct.id, events) ?? undefined;
      if (!linkId) {
        setError("이 상품은 현재 판매 중인 이벤트가 없어서 연결할 수 없어요.");
        return;
      }
    } else if (linkType === "EVENT") {
      if (!selectedEvent) {
        setError("연결할 이벤트를 선택해 주세요.");
        return;
      }
      linkId = selectedEvent.id;
    } else if (linkType === "ORDER") {
      linkId = orderId.trim();
      if (!linkId) {
        setError("주문 ID를 입력해 주세요.");
        return;
      }
    }
    setSending(true);
    await createNotification({ title: title.trim(), message: message.trim(), icon: icon || "📢", linkType, linkId, profileId: null });
    if (pushToo) {
      const accessToken = await getAccessToken();
      if (accessToken) {
        // 인앱 알림 클릭 시 이동 경로(NotificationsPage의 open())와 동일한 규칙.
        const url =
          linkType === "PRODUCT" && linkId ? `/product/${linkId}` : linkType === "EVENT" && linkId ? `/event/${linkId}` : linkType === "ORDER" && linkId ? `/orders/${linkId}` : "/notifications";
        await sendPushBroadcast({ title: title.trim(), body: message.trim(), url }, accessToken);
      }
    }
    setSending(false);
    setSent(true);
    setTitle("");
    setMessage("");
    setLinkType("NONE");
    setSelectedProduct(null);
    setSelectedEvent(null);
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
          <SearchPicker
            items={catalog}
            value={selectedProduct}
            onChange={setSelectedProduct}
            getId={(p) => p.id}
            getLabel={(p) => p.name}
            renderIcon={(p) => <ProductPhoto photo={p.photos?.[0] ?? p.emoji} className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-accent-soft text-lg" />}
            placeholder="상품명 검색 (예: 유정란)"
            emptyText="일치하는 상품이 없어요."
          />
        )}
        {linkType === "EVENT" && (
          <SearchPicker
            items={events}
            value={selectedEvent}
            onChange={setSelectedEvent}
            getId={(e) => e.id}
            getLabel={(e) => e.title}
            placeholder="이벤트명 검색 (예: 7/30 문고리)"
            emptyText="일치하는 이벤트가 없어요."
          />
        )}
        {linkType === "ORDER" && (
          <input
            className="rounded-[9px] border border-border bg-bg-card px-3 py-2.5 text-[13px]"
            placeholder="주문 ID (관리자 주문 목록에서 확인)"
            value={orderId}
            onChange={(e) => setOrderId(e.target.value)}
          />
        )}

        <label className="flex items-center gap-2 text-[12.5px]">
          <input type="checkbox" checked={pushToo} onChange={(e) => setPushToo(e.target.checked)} />
          웹 푸시로도 보내기 (알림 화면에서 푸시를 켜둔 고객에게만 전달돼요)
        </label>

        {error && <p className="text-[12px] font-semibold text-red-600">{error}</p>}
        {sent && <p className="text-[12px] font-semibold text-accent-dark">알림을 발송했어요.</p>}

        <button onClick={send} disabled={sending} className="rounded-[9px] bg-accent py-2.5 text-[13px] font-bold text-white disabled:opacity-50">
          {sending ? "발송 중..." : "발송하기"}
        </button>
      </div>
    </div>
  );
}
