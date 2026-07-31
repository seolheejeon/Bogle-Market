"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { listEvents, createOrder, getDefaultAddress, updateAddress } from "@/lib/data";
import { formatAddress, type MarketEvent, type Order, type PaymentMethod, type Product } from "@/types";
import { formatPrice, formatEventDateChip } from "@/lib/format";
import { isEventOrderable } from "@/lib/order-policy";
import { useCart, type CartLine } from "@/lib/cart-context";
import { useAuth } from "@/lib/auth-context";
import { unitPrice, maxQtyForSelection, optionSelectionLabel, buildOptionSnapshot, comboValueIds } from "@/lib/product-options";
import { PAYMENT_METHODS, allowedPaymentMethods } from "@/lib/payments";
import { EVENT_TYPE_LABEL, type EventType } from "@/types";
import { AddressFields, EMPTY_ADDRESS_FIELDS, type AddressFieldsValue } from "@/components/AddressFields";
import { BankAccountInfo } from "@/components/BankAccountInfo";

// 화면 곳곳에서 쓰는 순서(문고리 → 사다드림 → 택배)를 결제 방식 섹션에도
// 그대로 맞춘다(components/Category/CategoryView.tsx의 TABS와 동일 순서).
const DELIVERY_TYPE_ORDER: EventType[] = ["DOOR", "GROUP_BUY", "PARCEL"];

export function CheckoutView() {
  const router = useRouter();
  const { lines, clear } = useCart();
  const { profile } = useAuth();

  const [events, setEvents] = useState<MarketEvent[] | null>(null);
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [address, setAddress] = useState<AddressFieldsValue>(EMPTY_ADDRESS_FIELDS);
  const [defaultAddressId, setDefaultAddressId] = useState<string | null>(null);
  const [saveAsDefault, setSaveAsDefault] = useState(false);
  const [pin, setPin] = useState("");
  // 배송유형(문고리/사다드림/택배)마다 결제 가능 수단이 달라서(사다드림은
  // 무통장입금만) 결제수단을 유형별로 따로 선택받는다 — 장바구니에 없는
  // 유형은 굳이 채워둘 필요 없어 필요한 것만 담는 partial map으로 둔다.
  const [methods, setMethods] = useState<Partial<Record<EventType, PaymentMethod>>>({});
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    listEvents().then(setEvents);
  }, []);

  useEffect(() => {
    if (profile) {
      setName(profile.nickname);
      setPhone(profile.phone);
      getDefaultAddress(profile.id).then((addr) => {
        if (!addr) return;
        setDefaultAddressId(addr.id);
        setAddress({
          zonecode: addr.zonecode,
          roadAddress: addr.roadAddress,
          apartmentName: addr.apartmentName,
          detailAddress: addr.detailAddress,
          entranceMethod: addr.entranceMethod ?? "",
          memo: addr.memo ?? "",
        });
      });
    }
  }, [profile]);

  const items = useMemo(() => {
    if (!events) return [];
    const result: { product: Product; line: CartLine; event: MarketEvent }[] = [];
    for (const e of events) {
      for (const p of e.products) {
        for (const line of lines) {
          if (line.productId === p.id) result.push({ product: p, line, event: e });
        }
      }
    }
    return result;
  }, [events, lines]);

  const total = items.reduce((sum, i) => sum + unitPrice(i.product, i.line.optionValueIds) * i.line.qty, 0);

  // 택배로만 이루어진 주문은 공동현관 출입방법이 필요 없음. 장바구니가 아직
  // 안 불러와졌을 때는 우선 보여주는 쪽으로 기본값을 둔다.
  const needsEntranceMethod = items.length === 0 || items.some((i) => (i.product.deliveryType ?? i.event.type) !== "PARCEL");

  // 마감일/배송일이 다른 이벤트 상품이 장바구니에 같이 담겨 있을 수 있어서,
  // 이벤트별로 묶어 각각 별도의 주문으로 만든다 — 한 이벤트를 배송완료 처리해도
  // 다른 이벤트가 같이 딸려가지 않도록. (components/Cart/CartView.tsx도 같은
  // 방식으로 이벤트별로 묶어서 보여준다) 실질 배송유형이 서로 다른 상품은
  // 애초에 다른 이벤트에 속하는 게 보통이라, 이벤트별 분리가 배송유형별
  // 분리도 함께 만족시킨다.
  const groups = useMemo(() => {
    const byEvent = new Map<string, { event: MarketEvent; items: typeof items }>();
    for (const item of items) {
      if (!byEvent.has(item.event.id)) byEvent.set(item.event.id, { event: item.event, items: [] });
      byEvent.get(item.event.id)!.items.push(item);
    }
    return Array.from(byEvent.values());
  }, [items]);

  // 상품별 deliveryType override(문고리 이벤트에 택배 전용 상품을 끼워파는
  // 식)가 있을 수 있어 event.type을 그대로 쓰지 않고 이걸로 판정한다.
  function deliveryTypeOf(item: (typeof items)[number]): EventType {
    return item.product.deliveryType ?? item.event.type;
  }

  // 결제수단은 이벤트가 아니라 실질 배송유형 기준으로 제한되므로(사다드림은
  // 무통장만) 장바구니 전체를 유형별로 다시 묶어서 결제수단 선택 UI와
  // 기본값 계산에 쓴다.
  const deliveryTypesPresent = useMemo(() => {
    const present = new Set(items.map(deliveryTypeOf));
    return DELIVERY_TYPE_ORDER.filter((t) => present.has(t));
  }, [items]);

  function methodFor(type: EventType): PaymentMethod {
    const allowed = allowedPaymentMethods(type);
    const chosen = methods[type];
    return chosen && allowed.includes(chosen) ? chosen : allowed[0];
  }

  async function placeOrder() {
    setError(null);
    const phoneDigits = phone.replace(/\D/g, "");
    if (!name.trim() || name.trim().length < 2) {
      setError("이름을 정확히 입력해 주세요.");
      return;
    }
    if (phoneDigits.length < 9) {
      setError("전화번호를 정확히 입력해 주세요.");
      return;
    }
    if (!address.roadAddress.trim() || !address.detailAddress.trim()) {
      setError("배송지(주소검색/상세주소)를 정확히 입력해 주세요.");
      return;
    }
    if (needsEntranceMethod && !address.entranceMethod.trim()) {
      setError("공동현관 출입방법을 입력해 주세요.");
      return;
    }
    if (!profile && !/^\d{4}$/.test(pin)) {
      setError("주문 조회용 확인번호 4자리를 입력해 주세요.");
      return;
    }
    if (items.length === 0) {
      setError("장바구니가 비어있어요.");
      return;
    }
    const overStock = items.filter((i) => {
      const max = maxQtyForSelection(i.product, i.line.optionValueIds);
      return max !== undefined && i.line.qty > max;
    });
    if (overStock.length > 0) {
      setError(
        `재고가 부족한 상품이 있어요: ${overStock.map((i) => `${i.product.name}(재고 ${maxQtyForSelection(i.product, i.line.optionValueIds)}개)`).join(", ")}. 장바구니에서 수량을 줄여주세요.`,
      );
      return;
    }
    const closedGroups = groups.filter((g) => !isEventOrderable(g.event));
    if (closedGroups.length > 0) {
      setError(`마감되어 더 이상 주문할 수 없는 이벤트가 있어요: ${closedGroups.map((g) => g.event.title).join(", ")}. 장바구니에서 빼주세요.`);
      return;
    }
    setSubmitting(true);
    try {
      if (profile && saveAsDefault && defaultAddressId) {
        await updateAddress(defaultAddressId, profile.id, {
          zonecode: address.zonecode,
          roadAddress: address.roadAddress,
          apartmentName: address.apartmentName,
          detailAddress: address.detailAddress.trim(),
          entranceMethod: address.entranceMethod.trim() || undefined,
          memo: address.memo.trim() || undefined,
        });
      }
      // 여러 이벤트가 섞여 있으면 이벤트 수만큼 주문이 생기지만, 결제는 한
      // 번만 하는 것처럼 보이도록 같은 batchId로 묶는다.
      const batchId = crypto.randomUUID();
      const createdOrders: Order[] = [];
      for (const group of groups) {
        const groupTotal = group.items.reduce((sum, i) => sum + unitPrice(i.product, i.line.optionValueIds) * i.line.qty, 0);
        const groupNeedsEntranceMethod = group.items.some((i) => (i.product.deliveryType ?? group.event.type) !== "PARCEL");
        // 이벤트 하나는 실질 배송유형이 보통 하나로 통일돼 있으므로 대표로
        // 첫 상품의 유형을 기준삼아 그 유형에 맞게 선택된 결제수단을 적용한다.
        const groupType = group.items.length > 0 ? deliveryTypeOf(group.items[0]) : group.event.type;
        const order = await createOrder({
          eventId: group.event.id,
          batchId,
          profileId: profile?.id ?? null,
          guestName: profile ? undefined : name,
          guestPhone: profile ? undefined : phone,
          guestPin: profile ? undefined : pin,
          recipientName: name,
          recipientPhone: phone,
          addressSnapshot: formatAddress({
            roadAddress: address.roadAddress,
            detailAddress: address.detailAddress.trim(),
            entranceMethod: groupNeedsEntranceMethod ? address.entranceMethod.trim() || undefined : undefined,
            memo: address.memo.trim() || undefined,
          }),
          apartmentName: address.apartmentName || undefined,
          paymentMethod: methodFor(groupType),
          items: group.items.map((i) => ({
            productId: i.product.id,
            productName: i.product.name,
            productEmoji: i.product.emoji,
            price: unitPrice(i.product, i.line.optionValueIds),
            quantity: i.line.qty,
            options: buildOptionSnapshot(i.product, i.line.optionValueIds),
            stockComboValueIds: comboValueIds(i.product, i.line.optionValueIds).length > 0 ? comboValueIds(i.product, i.line.optionValueIds) : undefined,
          })),
          total: groupTotal,
        });
        createdOrders.push(order);
      }
      clear();
      const first = createdOrders[0];
      if (profile) {
        router.push(`/orders/${first.id}`);
      } else {
        router.push(`/orders/${first.id}?gn=${encodeURIComponent(name)}&pin=${pin}`);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "주문 중 오류가 발생했어요.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div>
      <div className="border-b border-border px-4 py-3">
        <strong className="text-[15px]">주문 / 결제</strong>
      </div>
      <div className="p-4">
        <p className="mt-0 mb-2 text-[12.5px] font-bold text-text-muted">배송 정보</p>
        <div className="mb-2 flex flex-col gap-2">
          <input className="w-full rounded-[9px] border border-border bg-bg-card px-3 py-2.5 text-[13px]" placeholder="받는 분 이름" value={name} onChange={(e) => setName(e.target.value)} />
          <input className="w-full rounded-[9px] border border-border bg-bg-card px-3 py-2.5 text-[13px]" placeholder="전화번호 (010-0000-0000)" value={phone} onChange={(e) => setPhone(e.target.value)} />
          <AddressFields value={address} onChange={(patch) => setAddress((v) => ({ ...v, ...patch }))} showEntranceMethod={needsEntranceMethod} />

          {profile && defaultAddressId && (
            <div className="flex flex-col gap-1.5 rounded-[9px] border border-border p-2.5">
              <label className="flex items-center gap-2 text-[12.5px]">
                <input type="radio" name="addr-save" checked={!saveAsDefault} onChange={() => setSaveAsDefault(false)} />
                이번 주문만 이 배송지로 보내기
              </label>
              <label className="flex items-center gap-2 text-[12.5px]">
                <input type="radio" name="addr-save" checked={saveAsDefault} onChange={() => setSaveAsDefault(true)} />
                이 배송지를 기본 배송지로 저장
              </label>
            </div>
          )}

          {!profile && (
            <input
              className="w-full rounded-[9px] border border-border bg-bg-card px-3 py-2.5 text-[13px]"
              placeholder="주문 조회용 확인번호 4자리 (직접 정해주세요)"
              inputMode="numeric"
              maxLength={4}
              value={pin}
              onChange={(e) => setPin(e.target.value.replace(/\D/g, "").slice(0, 4))}
            />
          )}
        </div>
        {!profile && <p className="mb-4 text-[11.5px] text-text-muted">회원가입 없이 주문할 수 있어요. 주문 조회는 이름과 확인번호로 할 수 있어요.</p>}

        <p className="mb-2 text-[12.5px] font-bold text-text-muted">주문 내역</p>
        {deliveryTypesPresent.length > 1 && (
          <p className="mb-3 rounded-[9px] bg-bg-sunken px-3 py-2.5 text-[12px] text-text-muted">배송유형이 달라 주문이 자동으로 분리됩니다.</p>
        )}
        <div className="flex flex-col gap-5">
          {deliveryTypesPresent.map((type) => {
            const typeGroups = groups.filter((g) => deliveryTypeOf(g.items[0]) === type);
            const typeTotal = typeGroups.reduce(
              (sum, g) => sum + g.items.reduce((s, i) => s + unitPrice(i.product, i.line.optionValueIds) * i.line.qty, 0),
              0,
            );
            const selected = methodFor(type);
            return (
              <div key={type} className="rounded-xl border border-border p-3">
                <div className="mb-2 flex items-center justify-between">
                  <span className="text-[13px] font-extrabold">{deliveryTypesPresent.length > 1 ? `${EVENT_TYPE_LABEL[type]} 주문` : "주문 상품"}</span>
                  <span className="text-[12.5px] font-bold">{formatPrice(typeTotal)}</span>
                </div>
                {typeGroups.length > 1 && (
                  <p className="mb-2 text-[11px] text-text-muted">마감일/배송일이 달라 이 안에서 {typeGroups.length}건으로 나뉘어 접수돼요.</p>
                )}
                <div className="flex flex-col gap-3">
                  {typeGroups.map((g) => {
                    const groupTotal = g.items.reduce((sum, i) => sum + unitPrice(i.product, i.line.optionValueIds) * i.line.qty, 0);
                    return (
                      <div key={g.event.id}>
                        <div className="mb-1 flex items-center justify-between">
                          <span className="text-[12px] font-bold text-accent-dark">{g.event.title}</span>
                          <span className="text-[11px] text-text-muted">배송예정 {formatEventDateChip(g.event.deliveryAt)}</span>
                        </div>
                        <div className="flex flex-col gap-1 text-[13px] text-text-muted">
                          {g.items.map((i) => (
                            <div key={`${i.product.id}::${i.line.optionValueIds.join(",")}`} className="flex justify-between">
                              <span>
                                {i.product.name}
                                {i.line.optionValueIds.length > 0 && ` (${optionSelectionLabel(i.product, i.line.optionValueIds)})`} x{i.line.qty}
                              </span>
                              <span>{formatPrice(unitPrice(i.product, i.line.optionValueIds) * i.line.qty)}</span>
                            </div>
                          ))}
                        </div>
                        {typeGroups.length > 1 && (
                          <div className="mt-0.5 flex justify-between text-[11.5px] font-semibold">
                            <span>소계</span>
                            <span>{formatPrice(groupTotal)}</span>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>

                <p className="mt-3 mb-1.5 text-[11.5px] font-bold text-text-muted">결제 방법</p>
                <div className="flex flex-col gap-1.5">
                  {allowedPaymentMethods(type).map((value) => {
                    const m = PAYMENT_METHODS.find((pm) => pm.value === value)!;
                    return (
                      <button
                        key={value}
                        onClick={() => setMethods((prev) => ({ ...prev, [type]: value }))}
                        className={`flex items-center gap-2 rounded-[9px] border px-3 py-2.5 text-left text-[13px] ${selected === value ? "border-accent bg-accent-soft" : "border-border"}`}
                      >
                        <span>
                          {m.icon} {m.label}
                        </span>
                      </button>
                    );
                  })}
                </div>
                <p className="mt-1.5 text-[11.5px] text-text-muted">{PAYMENT_METHODS.find((m) => m.value === selected)?.help}</p>
                {selected === "bank_transfer" && (
                  <div className="mt-2">
                    <BankAccountInfo />
                  </div>
                )}
              </div>
            );
          })}
        </div>
        <div className="mt-3.5 flex justify-between border-t border-border pt-3.5 text-base font-extrabold">
          <span>총 주문 금액</span>
          <span>{formatPrice(total)}</span>
        </div>

        {error && <p className="mt-3 text-[12.5px] font-semibold text-red-600">{error}</p>}

        <button
          className="mt-4 w-full rounded-[10px] bg-accent py-3 text-[13.5px] font-bold text-white disabled:opacity-50"
          disabled={submitting || items.length === 0}
          onClick={placeOrder}
        >
          {submitting ? "주문 처리 중..." : "주문하기"}
        </button>
      </div>
    </div>
  );
}
