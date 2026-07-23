"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth-context";
import { listOrdersForProfile, lookupGuestOrder } from "@/lib/data";
import type { Order, OrderStatus } from "@/types";
import { PAYMENT_METHOD_LABEL } from "@/types";
import { formatDateTime, formatPrice } from "@/lib/format";
import { OrderStatusBadge } from "@/components/Badge";

const STEPS: { value: OrderStatus; label: string }[] = [
  { value: "wait", label: "입금대기" },
  { value: "paid", label: "입금완료" },
  { value: "ship", label: "배송중" },
  { value: "done", label: "배송완료" },
];

export function OrderDetailView({ orderId, onParam, p4Param }: { orderId: string; onParam?: string; p4Param?: string }) {
  const router = useRouter();
  const { profile, loading } = useAuth();
  const [order, setOrder] = useState<Order | null | undefined>(undefined);

  useEffect(() => {
    if (loading) return;
    if (profile) {
      listOrdersForProfile(profile.id).then((orders) => setOrder(orders.find((o) => o.id === orderId) ?? null));
    } else if (onParam && p4Param) {
      lookupGuestOrder(onParam, p4Param).then((o) => setOrder(o && o.id === orderId ? o : null));
    } else {
      setOrder(null);
    }
  }, [profile, loading, orderId, onParam, p4Param]);

  const stepIndex = order ? STEPS.findIndex((s) => s.value === order.status) : -1;

  return (
    <div>
      <div className="flex items-center gap-2 border-b border-border px-4 py-3">
        <button onClick={() => router.push("/orders")} className="p-1 text-xl text-text">
          ‹
        </button>
        <strong className="text-[15px]">주문 상세</strong>
      </div>
      <div className="p-4">
        {order === undefined && <p className="text-sm text-text-muted">불러오는 중...</p>}
        {order === null && <p className="text-sm text-text-muted">주문을 찾을 수 없어요. 로그인하거나 주문번호로 조회해 주세요.</p>}
        {order && (
          <>
            <div className="mb-2 flex items-center justify-between">
              <span className="text-[13px] text-text-muted">{order.orderNumber}</span>
              <OrderStatusBadge status={order.status} />
            </div>
            <p className="text-[12px] text-text-muted">{formatDateTime(order.createdAt)}</p>

            {order.status !== "cancelled" && (
              <div className="my-4.5 flex items-center">
                {STEPS.map((s, i) => (
                  <div key={s.value} className="flex flex-1 items-center last:flex-none">
                    <div className="flex flex-col items-center gap-1">
                      <div className={`flex h-[26px] w-[26px] items-center justify-center rounded-full text-xs font-bold ${i <= stepIndex ? "bg-accent text-white" : "bg-bg-sunken text-text-muted"}`}>
                        {i + 1}
                      </div>
                      <span className={`text-[10.5px] ${i <= stepIndex ? "font-bold text-accent-dark" : "text-text-muted"}`}>{s.label}</span>
                    </div>
                    {i < STEPS.length - 1 && <div className={`mx-1 mb-4.5 h-0.5 flex-1 ${i < stepIndex ? "bg-accent" : "bg-border"}`} />}
                  </div>
                ))}
              </div>
            )}

            <div className="mb-4 rounded-[10px] border border-border p-3 text-[13px]">
              <p className="mb-1">
                <span className="text-text-muted">받는 분</span> {order.recipientName} ({order.recipientPhone})
              </p>
              <p className="mb-1">
                <span className="text-text-muted">배송지</span> {order.addressSnapshot}
              </p>
              <p>
                <span className="text-text-muted">결제 방법</span> {PAYMENT_METHOD_LABEL[order.paymentMethod]}
              </p>
            </div>

            <p className="mb-2 text-[12.5px] font-bold text-text-muted">주문 상품</p>
            <div className="flex flex-col gap-2">
              {order.items.map((item) => (
                <div key={item.productId} className="flex items-center gap-3">
                  <div className="flex h-[44px] w-[44px] items-center justify-center rounded-[10px] bg-accent-soft text-xl">{item.productEmoji}</div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[13px]">{item.productName}</p>
                    <p className="text-[12px] text-text-muted">
                      {formatPrice(item.price)} x {item.quantity}
                    </p>
                  </div>
                  <span className="text-[13px] font-semibold">{formatPrice(item.price * item.quantity)}</span>
                </div>
              ))}
            </div>
            <div className="mt-4 flex justify-between border-t border-border pt-3.5 text-base font-extrabold">
              <span>총 결제금액</span>
              <span>{formatPrice(order.total)}</span>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
