"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { listEvents, createOrder, getDefaultAddress, updateAddress } from "@/lib/data";
import { formatAddress, type MarketEvent, type PaymentMethod } from "@/types";
import { formatPrice } from "@/lib/format";
import { useCart } from "@/lib/cart-context";
import { useAuth } from "@/lib/auth-context";
import { PAYMENT_METHODS } from "@/lib/payments";
import { AddressFields, EMPTY_ADDRESS_FIELDS, type AddressFieldsValue } from "@/components/AddressFields";

export function CheckoutView() {
  const router = useRouter();
  const { cart, clear } = useCart();
  const { profile } = useAuth();

  const [events, setEvents] = useState<MarketEvent[] | null>(null);
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [address, setAddress] = useState<AddressFieldsValue>(EMPTY_ADDRESS_FIELDS);
  const [defaultAddressId, setDefaultAddressId] = useState<string | null>(null);
  const [saveAsDefault, setSaveAsDefault] = useState(false);
  const [pin, setPin] = useState("");
  const [method, setMethod] = useState<PaymentMethod>("bank_transfer");
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
    return events.flatMap((e) => e.products.filter((p) => cart[p.id]).map((p) => ({ product: p, qty: cart[p.id], eventType: e.type })));
  }, [events, cart]);

  const total = items.reduce((sum, i) => sum + i.product.price * i.qty, 0);

  // 택배로만 이루어진 주문은 공동현관 출입방법이 필요 없음. 장바구니가 아직
  // 안 불러와졌을 때는 우선 보여주는 쪽으로 기본값을 둔다.
  const needsEntranceMethod = items.length === 0 || items.some((i) => (i.product.deliveryType ?? i.eventType) !== "PARCEL");

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
      const order = await createOrder({
        profileId: profile?.id ?? null,
        guestName: profile ? undefined : name,
        guestPhone: profile ? undefined : phone,
        guestPin: profile ? undefined : pin,
        recipientName: name,
        recipientPhone: phone,
        addressSnapshot: formatAddress({
          roadAddress: address.roadAddress,
          detailAddress: address.detailAddress.trim(),
          entranceMethod: needsEntranceMethod ? address.entranceMethod.trim() || undefined : undefined,
          memo: address.memo.trim() || undefined,
        }),
        apartmentName: address.apartmentName || undefined,
        paymentMethod: method,
        items: items.map((i) => ({ productId: i.product.id, productName: i.product.name, productEmoji: i.product.emoji, price: i.product.price, quantity: i.qty })),
        total,
      });
      clear();
      if (profile) {
        router.push(`/orders/${order.id}`);
      } else {
        router.push(`/orders/${order.id}?gn=${encodeURIComponent(name)}&pin=${pin}`);
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

        <p className="mb-2 text-[12.5px] font-bold text-text-muted">결제 방법</p>
        <div className="mb-4 flex flex-col gap-2">
          {PAYMENT_METHODS.map((m) => (
            <button
              key={m.value}
              onClick={() => setMethod(m.value)}
              className={`flex items-center gap-2 rounded-[9px] border px-3 py-2.5 text-left text-[13px] ${method === m.value ? "border-accent bg-accent-soft" : "border-border"}`}
            >
              <span>
                {m.icon} {m.label}
              </span>
            </button>
          ))}
        </div>
        <p className="-mt-2 mb-4 text-[11.5px] text-text-muted">{PAYMENT_METHODS.find((m) => m.value === method)?.help}</p>

        <p className="mb-2 text-[12.5px] font-bold text-text-muted">주문 상품</p>
        <div className="flex flex-col gap-1.5 text-[13px] text-text-muted">
          {items.map((i) => (
            <div key={i.product.id} className="flex justify-between">
              <span>
                {i.product.name} x{i.qty}
              </span>
              <span>{formatPrice(i.product.price * i.qty)}</span>
            </div>
          ))}
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
