"use client";

import { useEffect, useState } from "react";
import { listCoupons, saveCoupon, deleteCoupon, getCouponUsageCounts } from "@/lib/data";
import type { Coupon, EventType } from "@/types";
import { EVENT_TYPE_LABEL } from "@/types";
import { describeCoupon } from "@/lib/coupon";
import { formatDateTime } from "@/lib/format";
import { ENABLED_EVENT_TYPES } from "@/lib/order-policy";

// 쿠폰 관리 — 오픈톡 공지용 코드 쿠폰을 만들고(정액/정률, 최소 주문금액, 기간,
// 선착순, 1인 횟수, 배송방식, 다른 할인과 중복 여부), 몇 명이 썼는지 본다.
// 손님은 결제 화면에서 코드를 넣고, 최종 검사는 서버(create_order)가 한다.

interface Draft {
  id?: string;
  code: string;
  name: string;
  discountType: Coupon["discountType"];
  amount: string;
  maxDiscount: string;
  minOrderAmount: string;
  startsAt: string; // datetime-local
  endsAt: string;
  usageLimit: string;
  perCustomerLimit: string;
  deliveryTypes: EventType[];
  stackable: boolean;
  active: boolean;
}

const EMPTY: Draft = {
  code: "",
  name: "",
  discountType: "fixed",
  amount: "",
  maxDiscount: "",
  minOrderAmount: "",
  startsAt: "",
  endsAt: "",
  usageLimit: "",
  perCustomerLimit: "1",
  deliveryTypes: [],
  stackable: true,
  active: true,
};

function toLocal(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function toDraft(c: Coupon): Draft {
  return {
    id: c.id,
    code: c.code,
    name: c.name,
    discountType: c.discountType,
    amount: String(c.amount),
    maxDiscount: c.maxDiscount ? String(c.maxDiscount) : "",
    minOrderAmount: c.minOrderAmount ? String(c.minOrderAmount) : "",
    startsAt: toLocal(c.startsAt),
    endsAt: toLocal(c.endsAt),
    usageLimit: c.usageLimit ? String(c.usageLimit) : "",
    perCustomerLimit: c.perCustomerLimit ? String(c.perCustomerLimit) : "",
    deliveryTypes: c.deliveryTypes ?? [],
    stackable: c.stackable,
    active: c.active,
  };
}

const num = (s: string) => (s.trim() === "" ? null : Math.max(0, Math.floor(Number(s) || 0)));

export default function AdminCouponsPage() {
  const [coupons, setCoupons] = useState<Coupon[] | null>(null);
  const [usage, setUsage] = useState<Record<string, number>>({});
  const [draft, setDraft] = useState<Draft | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [now] = useState(() => Date.now());

  function refresh() {
    listCoupons().then(setCoupons);
    getCouponUsageCounts().then(setUsage).catch(() => setUsage({}));
  }
  useEffect(refresh, []);

  async function save() {
    if (!draft) return;
    const amount = num(draft.amount);
    if (!draft.code.trim()) return setError("쿠폰 코드를 입력해 주세요.");
    if (!/^[A-Za-z0-9_-]+$/.test(draft.code.trim())) return setError("쿠폰 코드는 영문·숫자·-·_만 쓸 수 있어요.");
    if (!amount) return setError("할인 금액(또는 %)을 입력해 주세요.");
    if (draft.discountType === "percent" && amount > 100) return setError("정률 할인은 100% 이하로 입력해 주세요.");
    setError(null);
    setSaving(true);
    try {
      await saveCoupon({
        id: draft.id,
        code: draft.code,
        name: draft.name,
        discountType: draft.discountType,
        amount,
        maxDiscount: draft.discountType === "percent" ? num(draft.maxDiscount) || null : null,
        minOrderAmount: num(draft.minOrderAmount) ?? 0,
        startsAt: draft.startsAt ? new Date(draft.startsAt).toISOString() : null,
        endsAt: draft.endsAt ? new Date(draft.endsAt).toISOString() : null,
        usageLimit: num(draft.usageLimit) || null,
        perCustomerLimit: num(draft.perCustomerLimit) || null,
        deliveryTypes: draft.deliveryTypes.length > 0 ? draft.deliveryTypes : null,
        stackable: draft.stackable,
        active: draft.active,
      });
      setDraft(null);
      refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : (e as { message?: string })?.message ?? "저장 중 오류가 발생했어요.");
    } finally {
      setSaving(false);
    }
  }

  async function toggleActive(c: Coupon) {
    await saveCoupon({ ...c, active: !c.active });
    refresh();
  }

  async function remove(c: Coupon) {
    if ((usage[c.id] ?? 0) > 0) return alert("이미 사용된 쿠폰은 지울 수 없어요. 대신 '중지'를 눌러 주세요.");
    if (!confirm(`"${c.code}" 쿠폰을 삭제할까요?`)) return;
    await deleteCoupon(c.id);
    refresh();
  }

  const input = "w-full rounded-[8px] border border-border bg-bg-card px-2.5 py-2 text-[13px]";
  const label = "text-[11.5px] font-semibold text-text-muted";

  return (
    <div className="max-w-2xl">
      <div className="mb-3 flex items-center justify-between">
        <p className="text-[15px] font-bold">쿠폰 관리</p>
        {!draft && (
          <button onClick={() => setDraft({ ...EMPTY })} className="rounded-[9px] bg-accent px-3 py-2 text-[12.5px] font-bold text-white">
            + 새 쿠폰
          </button>
        )}
      </div>
      <p className="mb-4 text-[12px] text-text-muted">손님은 결제 화면에서 쿠폰 코드를 넣어 써요(비회원도 가능, 1인 횟수는 연락처로 구분). 취소·환불된 주문에 쓴 쿠폰은 다시 쓸 수 있어요.</p>

      {draft && (
        <div className="mb-5 flex flex-col gap-3 rounded-xl border border-accent p-4">
          <p className="text-[13.5px] font-bold">{draft.id ? "쿠폰 수정" : "새 쿠폰"}</p>
          <div className="grid grid-cols-2 gap-2">
            <label className={label}>
              쿠폰 코드
              <input className={`${input} mt-1 uppercase`} placeholder="예: BOGLE1016" value={draft.code} onChange={(e) => setDraft({ ...draft, code: e.target.value })} />
            </label>
            <label className={label}>
              이름(손님에게 보임)
              <input className={`${input} mt-1`} placeholder="예: 오픈톡 감사 쿠폰" value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} />
            </label>
          </div>
          <div>
            <p className={label}>할인 방식</p>
            <div className="mt-1 flex gap-1.5">
              {(["fixed", "percent"] as const).map((t) => (
                <button
                  key={t}
                  type="button"
                  onClick={() => setDraft({ ...draft, discountType: t })}
                  className={`rounded-[8px] border px-3 py-1.5 text-[12.5px] font-semibold ${draft.discountType === t ? "border-accent bg-accent-soft text-accent-dark" : "border-border text-text-muted"}`}
                >
                  {t === "fixed" ? "정액(원)" : "정률(%)"}
                </button>
              ))}
            </div>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <label className={label}>
              {draft.discountType === "fixed" ? "할인 금액(원)" : "할인율(%)"}
              <input className={`${input} mt-1`} type="number" min={1} value={draft.amount} onChange={(e) => setDraft({ ...draft, amount: e.target.value })} />
            </label>
            {draft.discountType === "percent" ? (
              <label className={label}>
                최대 할인액(원, 비우면 제한 없음)
                <input className={`${input} mt-1`} type="number" min={0} value={draft.maxDiscount} onChange={(e) => setDraft({ ...draft, maxDiscount: e.target.value })} />
              </label>
            ) : (
              <span />
            )}
            <label className={label}>
              최소 주문금액(원, 비우면 없음)
              <input className={`${input} mt-1`} type="number" min={0} value={draft.minOrderAmount} onChange={(e) => setDraft({ ...draft, minOrderAmount: e.target.value })} />
            </label>
            <span />
            <label className={label}>
              시작(비우면 바로)
              <input className={`${input} mt-1`} type="datetime-local" value={draft.startsAt} onChange={(e) => setDraft({ ...draft, startsAt: e.target.value })} />
            </label>
            <label className={label}>
              종료(비우면 계속)
              <input className={`${input} mt-1`} type="datetime-local" value={draft.endsAt} onChange={(e) => setDraft({ ...draft, endsAt: e.target.value })} />
            </label>
            <label className={label}>
              선착순 전체 수량(비우면 무제한)
              <input className={`${input} mt-1`} type="number" min={1} value={draft.usageLimit} onChange={(e) => setDraft({ ...draft, usageLimit: e.target.value })} />
            </label>
            <label className={label}>
              1인 사용 횟수(비우면 무제한)
              <input className={`${input} mt-1`} type="number" min={1} value={draft.perCustomerLimit} onChange={(e) => setDraft({ ...draft, perCustomerLimit: e.target.value })} />
            </label>
          </div>
          <div>
            <p className={label}>쓸 수 있는 배송방식(아무것도 안 고르면 전부)</p>
            <div className="mt-1 flex gap-1.5">
              {ENABLED_EVENT_TYPES.map((t) => {
                const on = draft.deliveryTypes.includes(t);
                return (
                  <button
                    key={t}
                    type="button"
                    onClick={() => setDraft({ ...draft, deliveryTypes: on ? draft.deliveryTypes.filter((x) => x !== t) : [...draft.deliveryTypes, t] })}
                    className={`rounded-[8px] border px-3 py-1.5 text-[12.5px] font-semibold ${on ? "border-accent bg-accent-soft text-accent-dark" : "border-border text-text-muted"}`}
                  >
                    {EVENT_TYPE_LABEL[t]}
                  </button>
                );
              })}
            </div>
          </div>
          <label className="flex items-center gap-2 text-[12.5px]">
            <input type="checkbox" checked={draft.stackable} onChange={(e) => setDraft({ ...draft, stackable: e.target.checked })} />
            상품 구간 할인·여러 품목 할인과 같이 쓰기
            <span className="text-[11px] text-text-muted">(끄면 쿠폰이 기존 할인 대신 적용돼요)</span>
          </label>
          <label className="flex items-center gap-2 text-[12.5px]">
            <input type="checkbox" checked={draft.active} onChange={(e) => setDraft({ ...draft, active: e.target.checked })} />
            사용 가능(끄면 바로 중지)
          </label>
          {error && <p className="text-[12px] font-semibold text-red-600">{error}</p>}
          <div className="flex gap-2">
            <button onClick={save} disabled={saving} className="rounded-[9px] bg-accent px-4 py-2 text-[13px] font-bold text-white disabled:opacity-50">
              {saving ? "저장 중..." : "저장"}
            </button>
            <button
              onClick={() => {
                setDraft(null);
                setError(null);
              }}
              className="rounded-[9px] border border-border px-4 py-2 text-[13px] font-semibold"
            >
              취소
            </button>
          </div>
        </div>
      )}

      {coupons === null ? (
        <p className="text-sm text-text-muted">불러오는 중...</p>
      ) : coupons.length === 0 ? (
        <p className="text-[12.5px] text-text-muted">아직 만든 쿠폰이 없어요.</p>
      ) : (
        <div className="flex flex-col gap-2">
          {coupons.map((c) => {
            const used = usage[c.id] ?? 0;
            const expired = c.endsAt ? new Date(c.endsAt).getTime() < now : false;
            return (
              <div key={c.id} className={`rounded-xl border border-border p-3.5 ${!c.active || expired ? "opacity-60" : ""}`}>
                <div className="flex items-center justify-between gap-2">
                  <span className="text-[14px] font-extrabold tracking-wide">{c.code}</span>
                  <span className="shrink-0 text-[11.5px] font-semibold text-text-muted">
                    {!c.active ? "중지됨" : expired ? "기간 종료" : "사용 가능"} · {used}명 사용{c.usageLimit ? ` / ${c.usageLimit}` : ""}
                  </span>
                </div>
                {c.name && <p className="mt-0.5 text-[12.5px] font-semibold">{c.name}</p>}
                <p className="mt-0.5 text-[12px] text-text-muted">{describeCoupon(c)}</p>
                <p className="mt-0.5 text-[11.5px] text-text-muted">
                  {c.startsAt ? formatDateTime(c.startsAt) : "바로"} ~ {c.endsAt ? formatDateTime(c.endsAt) : "계속"}
                  {c.perCustomerLimit ? ` · 1인 ${c.perCustomerLimit}회` : " · 1인 횟수 제한 없음"}
                </p>
                <div className="mt-2 flex gap-1.5">
                  <button onClick={() => setDraft(toDraft(c))} className="rounded-[7px] border border-border px-2.5 py-1 text-[12px] font-semibold">
                    수정
                  </button>
                  <button onClick={() => toggleActive(c)} className="rounded-[7px] border border-border px-2.5 py-1 text-[12px] font-semibold">
                    {c.active ? "중지" : "다시 사용"}
                  </button>
                  <button onClick={() => remove(c)} className="rounded-[7px] border border-border px-2.5 py-1 text-[12px] font-semibold text-red-600">
                    삭제
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
