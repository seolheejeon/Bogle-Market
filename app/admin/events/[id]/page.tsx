"use client";

import { use, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  getEvent,
  updateEvent,
  listCatalogProducts,
  addEventProduct,
  updateEventProduct,
  updateEventOptionStock,
  removeEventProduct,
  reorderEventProducts,
  getEventProductCosts,
  getSoldQuantities,
} from "@/lib/data";
import type { CatalogProduct, EventType, MarketEvent, Product } from "@/types";
import { EVENT_TYPE_LABEL } from "@/types";
import { formatPrice, toDateInputValue, dateInputValueToIso } from "@/lib/format";
import { generateStockCombos } from "@/lib/product-options";
import { ProductPhoto } from "@/components/ProductPhoto";
import { useUnsavedChangesGuard } from "@/lib/useUnsavedChangesGuard";

const DELIVERY_TYPES: EventType[] = ["DOOR", "GROUP_BUY", "PARCEL"];

function toLocalInputValue(iso: string) {
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

// 이벤트 상단 정보(이름/1시간특가/마감/배송일/안내문구)의 편집용 로컬 상태 —
// 저장 버튼을 누르기 전까지는 이 draft만 바뀌고 서버에는 아무것도 반영되지
// 않는다. datetime-local/date input은 그 형식 그대로 들고 있다가 저장 시점에
// ISO로 변환한다(예전 blur 핸들러가 하던 변환을 그대로 가져옴). 뱃지(HOT/NEW
// 등 표시용 라벨)는 더 이상 이벤트가 아니라 상품(상품 관리)에서 관리한다.
interface EventDraft {
  title: string;
  flashSale: boolean;
  deadlineAtLocal: string;
  deliveryAtDate: string;
  notice: string;
}

function toDraft(e: MarketEvent): EventDraft {
  return {
    title: e.title,
    flashSale: e.flashSale,
    deadlineAtLocal: toLocalInputValue(e.deadlineAt),
    deliveryAtDate: toDateInputValue(e.deliveryAt),
    notice: e.notice,
  };
}

function draftToPatch(draft: EventDraft): Partial<MarketEvent> {
  return {
    title: draft.title,
    flashSale: draft.flashSale,
    deadlineAt: new Date(draft.deadlineAtLocal).toISOString(),
    deliveryAt: dateInputValueToIso(draft.deliveryAtDate),
    notice: draft.notice,
  };
}

function draftsEqual(a: EventDraft, b: EventDraft): boolean {
  return a.title === b.title && a.flashSale === b.flashSale && a.deadlineAtLocal === b.deadlineAtLocal && a.deliveryAtDate === b.deliveryAtDate && a.notice === b.notice;
}

export default function AdminEventEditPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const [event, setEvent] = useState<MarketEvent | null | undefined>(undefined);
  // 상단 정보(이름/뱃지/마감/배송일/안내문구)만 draft로 편집한다 — 상품별
  // 가격수정/옵션재고 등 나머지는 원래부터 명시적 저장 버튼이 있던 방식이라
  // 그대로 둔다. draft는 최초 로드 시 한 번만 채우고, 상품 목록 조작(추가/
  // 제거/순서변경 등)이 refresh()를 다시 불러도 덮어쓰지 않는다 — 안 그러면
  // "이름 수정 중에 다른 상품 노출을 토글"했을 때 이름 수정분이 날아간다.
  const [draft, setDraft] = useState<EventDraft | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [savedToast, setSavedToast] = useState(false);
  // 원가/판매수량은 event_product_costs·order_items에서 따로 불러와서 화면
  // 쪽에서 직접 매칭한다(원가는 관리자만 조회 가능한 별도 테이블이라 event.products
  // 자체에는 안 실려 있음). 이벤트 정보가 새로 로드될 때마다 같이 갱신한다.
  const [costsByListing, setCostsByListing] = useState<Record<string, number>>({});
  const [soldByListing, setSoldByListing] = useState<Record<string, number>>({});

  function refresh() {
    getEvent(id).then((e) => {
      setEvent(e);
      if (e) {
        getEventProductCosts(e.products.map((p) => p.id)).then(setCostsByListing);
        getSoldQuantities(e.id).then(setSoldByListing);
        setDraft((prev) => prev ?? toDraft(e));
      }
    });
  }
  useEffect(() => {
    setDraft(null); // 다른 이벤트로 이동하면 draft를 새로 채워야 한다.
    refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  const dirty = !!(event && draft && !draftsEqual(draft, toDraft(event)));
  useUnsavedChangesGuard(dirty);

  if (event === undefined) return <p className="text-sm text-text-muted">불러오는 중...</p>;
  if (event === null) return <p className="text-sm text-text-muted">이벤트를 찾을 수 없어요.</p>;
  if (!draft) return <p className="text-sm text-text-muted">불러오는 중...</p>;
  // 아래 클로저(moveProduct)에서 쓰려고 새 const로 다시 담아둔다 — 위에서
  // early-return으로 좁혀둔 타입은 컨트롤플로우 분석 결과라 중첩 함수 안까지
  // 그대로 이어지지 않는다(state 변수라 나중에 다시 null이 될 수도 있다고
  // 보수적으로 판단함). const로 한 번 더 담으면 그 시점의 좁혀진 타입이
  // 고정돼 중첩 함수에서도 그대로 쓸 수 있다.
  const currentEvent = event;

  function updateDraft(patch: Partial<EventDraft>) {
    setDraft((prev) => (prev ? { ...prev, ...patch } : prev));
  }

  async function saveTop() {
    if (!dirty) return;
    setSaving(true);
    setError(null);
    try {
      await updateEvent(id, draftToPatch(draft));
      const updated = await getEvent(id);
      setEvent(updated);
      if (updated) setDraft(toDraft(updated));
      setSavedToast(true);
      setTimeout(() => setSavedToast(false), 1800);
    } catch (e) {
      setError(e instanceof Error ? e.message : "저장 중 오류가 발생했어요.");
    } finally {
      setSaving(false);
    }
  }

  function cancelTop() {
    setDraft(toDraft(currentEvent));
    setError(null);
  }

  // 현재 화면 순서에서 두 상품의 자리를 바꾼 새 순서를 통째로 저장한다 —
  // 이벤트별로 독립적인 순서라 이 이벤트의 리스팅 id만 다시 매긴다.
  async function moveProduct(index: number, direction: -1 | 1) {
    const target = index + direction;
    if (target < 0 || target >= currentEvent.products.length) return;
    const reordered = currentEvent.products.map((p) => p.id);
    [reordered[index], reordered[target]] = [reordered[target], reordered[index]];
    await reorderEventProducts(currentEvent.id, reordered);
    refresh();
  }

  return (
    <div className="max-w-2xl">
      <div className="mb-4 flex items-center justify-between">
        <p className="text-[15px] font-bold">{event.title} 관리</p>
        {savedToast && <span className="text-[11.5px] font-semibold text-accent-dark">✓ 저장되었습니다.</span>}
      </div>

      <div className="mb-6 flex flex-col gap-3 rounded-xl border border-border p-4">
        <label className="text-[12.5px] font-semibold text-text-muted">
          이벤트 이름
          <input
            className="mt-1 w-full rounded-[9px] border border-border bg-bg-card px-3 py-2.5 text-[13px]"
            value={draft.title}
            onChange={(e) => updateDraft({ title: e.target.value })}
          />
        </label>
        {/* 1시간 특가는 배송방식과 무관하게 마감이 곧 종료로 취급되는(STRICT_DEADLINE)
            특수 이벤트라 주문마감이 없는 택배에서는 의미가 없다 — 택배는 숨긴다.
            상품 카드에 붙는 HOT/NEW 같은 표시용 뱃지는 이제 상품 관리에서 정한다. */}
        {event.type !== "PARCEL" && (
          <label className="flex items-center gap-2 text-[12.5px] font-semibold text-text-muted">
            <input type="checkbox" checked={draft.flashSale} onChange={(e) => updateDraft({ flashSale: e.target.checked })} />
            🔥 1시간 특가 이벤트로 지정 (마감이 지나면 배송방식과 무관하게 즉시 주문 마감)
          </label>
        )}
        {/* 택배는 이벤트가 아니라 상품(출고방식/배송비/택배사) 기준으로 운영돼서
            이벤트 단위 주문마감/배송일이 의미가 없다 — 택배 이벤트에서는
            숨긴다(값 자체는 그대로 남아있고 저장 시 건드리지 않는다). */}
        {event.type !== "PARCEL" && (
          <>
            <label className="text-[12.5px] font-semibold text-text-muted">
              주문 마감
              <input
                type="datetime-local"
                className="mt-1 w-full rounded-[9px] border border-border bg-bg-card px-3 py-2.5 text-[13px]"
                value={draft.deadlineAtLocal}
                onChange={(e) => updateDraft({ deadlineAtLocal: e.target.value })}
              />
            </label>
            <label className="text-[12.5px] font-semibold text-text-muted">
              배송일
              <input
                type="date"
                className="mt-1 w-full rounded-[9px] border border-border bg-bg-card px-3 py-2.5 text-[13px]"
                value={draft.deliveryAtDate}
                onChange={(e) => updateDraft({ deliveryAtDate: e.target.value })}
              />
            </label>
          </>
        )}
        <label className="text-[12.5px] font-semibold text-text-muted">
          안내 문구
          <textarea
            className="mt-1 w-full rounded-[9px] border border-border bg-bg-card px-3 py-2.5 text-[13px]"
            rows={3}
            value={draft.notice}
            onChange={(e) => updateDraft({ notice: e.target.value })}
          />
        </label>
        {error && <p className="text-[11.5px] font-semibold text-red-600">{error}</p>}
        <div className="flex items-center gap-2">
          <button
            onClick={saveTop}
            disabled={!dirty || saving}
            className="rounded-[9px] bg-accent px-4 py-2 text-[13px] font-bold text-white disabled:opacity-40"
          >
            {saving ? "저장 중..." : "저장"}
          </button>
          <button onClick={cancelTop} disabled={!dirty || saving} className="rounded-[9px] border border-border px-4 py-2 text-[13px] font-semibold disabled:opacity-40">
            취소
          </button>
          <span className="text-[11.5px] text-text-muted">{dirty ? "저장하지 않은 변경사항이 있어요." : "변경사항 없음"}</span>
        </div>
      </div>

      <p className="mb-2 text-[13.5px] font-bold">상품 목록</p>
      <p className="mb-2 text-[11.5px] text-text-muted">
        사진·설명 등 상품 내용은{" "}
        <Link href="/admin/products" className="font-semibold text-accent-dark underline">
          상품 관리
        </Link>
        에서 고치면 이 상품을 쓰는 모든 이벤트에 바로 반영돼요. 여기서는 이번 회차의 가격·노출·순서만 정해요.
      </p>
      {event.products.length > 0 && (
        <p className="mb-2 text-[12px] font-semibold text-accent-dark">
          이 이벤트 예상 수익 합계{" "}
          {formatPrice(
            event.products.reduce((sum, p) => sum + (p.price - (costsByListing[p.id] ?? 0)) * (soldByListing[p.id] ?? 0), 0),
          )}
          <span className="ml-1 font-normal text-text-muted">(취소된 주문 제외, 원가 미입력 상품은 원가 0으로 계산)</span>
        </p>
      )}
      <div className="mb-4 flex flex-col gap-2">
        {event.products.map((p, i) => (
          <div key={p.id} className="flex items-start gap-1.5">
            <div className="flex shrink-0 flex-col gap-0.5 pt-2.5">
              <button
                onClick={() => moveProduct(i, -1)}
                disabled={i === 0}
                className="h-6 w-6 rounded-[6px] border border-border text-[11px] disabled:opacity-30"
                aria-label="위로"
              >
                ▲
              </button>
              <button
                onClick={() => moveProduct(i, 1)}
                disabled={i === event.products.length - 1}
                className="h-6 w-6 rounded-[6px] border border-border text-[11px] disabled:opacity-30"
                aria-label="아래로"
              >
                ▼
              </button>
            </div>
            <div className="min-w-0 flex-1">
              <EventProductRow product={p} eventType={event.type} costPrice={costsByListing[p.id]} soldQty={soldByListing[p.id] ?? 0} onSaved={refresh} />
            </div>
          </div>
        ))}
        {event.products.length === 0 && <p className="text-[12.5px] text-text-muted">등록된 상품이 없어요.</p>}
      </div>

      <AddExistingProductForm eventId={event.id} eventType={event.type} alreadyAddedIds={event.products.map((p) => p.catalogProductId)} onAdded={refresh} />
    </div>
  );
}

function EventProductRow({
  product,
  eventType,
  costPrice,
  soldQty,
  onSaved,
}: {
  product: Product;
  eventType: EventType;
  // undefined = 아직 원가를 입력한 적 없음(0으로 취급해 계산). 관리자에게만
  // 전달되는 값 — 이 컴포넌트는 /admin 하위 화면에서만 렌더링된다.
  costPrice: number | undefined;
  soldQty: number;
  onSaved: () => void;
}) {
  const [editing, setEditing] = useState(false);
  const [price, setPrice] = useState(String(product.price));
  const [costPriceInput, setCostPriceInput] = useState(costPrice !== undefined ? String(costPrice) : "");
  const [deliveryType, setDeliveryType] = useState<EventType>(product.deliveryType ?? eventType);
  const [visible, setVisible] = useState(product.visible !== false);
  const [saving, setSaving] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const profitPerItem = product.price - (costPrice ?? 0);
  const totalProfit = profitPerItem * soldQty;

  async function save() {
    if (!price) return;
    setSaving(true);
    setError(null);
    try {
      await updateEventProduct(product.id, {
        price: Number(price) || 0,
        costPrice: costPriceInput.trim() === "" ? 0 : Math.max(0, Number(costPriceInput) || 0),
        deliveryType,
        visible,
      });
      setEditing(false);
      onSaved();
    } catch (e) {
      setError(e instanceof Error ? e.message : "저장 중 오류가 발생했어요.");
    } finally {
      setSaving(false);
    }
  }
  async function remove() {
    if (!confirm(`"${product.name}"을(를) 이 이벤트에서 뺄까요? (상품 자체는 삭제되지 않아요)`)) return;
    try {
      await removeEventProduct(product.id);
      onSaved();
    } catch (e) {
      alert(e instanceof Error ? e.message : "제거 중 오류가 발생했어요.");
    }
  }
  // 노출 스위치는 편집 화면을 열지 않고 목록에서 바로 한 번에 끝낸다. 재고는
  // 여기서 손대지 않는다 — 상품관리(/admin/products)의 공유 재고 하나로
  // 관리되므로 품절 처리도 거기서 한다.
  async function toggleVisible() {
    setBusy(true);
    try {
      await updateEventProduct(product.id, { visible: !(product.visible !== false) });
      onSaved();
    } catch (e) {
      alert(e instanceof Error ? e.message : "저장 중 오류가 발생했어요.");
    } finally {
      setBusy(false);
    }
  }

  const isSoldout = product.stock === 0;
  const isVisible = product.visible !== false;

  if (!editing) {
    const optionStockNote = (() => {
      const combos = generateStockCombos(product.optionGroups ?? []);
      if (combos.length === 0) return null;
      return `${combos[0].valueIds.length > 1 ? "옵션조합재고" : "옵션재고"} ${combos
        .map((c) => {
          const key = c.valueIds.join(",");
          return `${comboLabel(product, c.valueIds)} ${product.optionStockByCombo?.[key] ?? c.defaultStock}개`;
        })
        .join(", ")}`;
    })();

    return (
      <>
        {/* PC 레이아웃 — 한 줄에 사진/정보/버튼을 나란히 배치. 좁은 화면에서는
            정보와 버튼이 서로 자리를 다투며 상품명이 세로로 줄바꿈되고 버튼이
            좁아지는 문제가 있어, 모바일에서는 아래의 별도 스택형 레이아웃을 쓴다. */}
        <div className="hidden items-center gap-3 rounded-lg border border-border p-2.5 sm:flex">
          <ProductPhoto photo={product.photos?.[0] ?? product.emoji} className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-accent-soft text-xl" />
          <div className="min-w-0 flex-1">
            <p className="truncate text-[13px] font-semibold">
              {product.name}
              {!isVisible && <span className="ml-1.5 rounded-md bg-bg-sunken px-1.5 py-0.5 text-[10.5px] font-bold text-text-muted">숨김</span>}
            </p>
            <p className="text-[12px] text-text-muted">
              {formatPrice(product.price)} · {EVENT_TYPE_LABEL[product.deliveryType ?? eventType]}
              {product.stock !== undefined && ` · 재고 ${product.stock}개(상품관리 공유)`}
              {isSoldout && <span className="ml-1 font-bold text-red-600">품절</span>}
            </p>
            <p className="text-[11.5px] text-text-muted">
              원가 {formatPrice(costPrice ?? 0)} · 개당 예상수익 {formatPrice(profitPerItem)} · 판매 {soldQty}개 · 누적 예상수익 {formatPrice(totalProfit)}
            </p>
            {optionStockNote && <p className="truncate text-[11.5px] text-text-muted">{optionStockNote}</p>}
          </div>
          <div className="flex flex-wrap justify-end gap-1.5">
            <button onClick={toggleVisible} disabled={busy} className="rounded-[7px] border border-border px-2.5 py-1 text-[12px] font-semibold disabled:opacity-50">
              {isVisible ? "숨기기" : "노출"}
            </button>
            <button onClick={() => setEditing(true)} className="rounded-[7px] border border-border px-2.5 py-1 text-[12px] font-semibold">
              가격/원가 수정
            </button>
            <button onClick={remove} className="rounded-[7px] border border-border px-2.5 py-1 text-[12px] font-semibold text-red-600">
              제거
            </button>
          </div>
        </div>

        {/* 모바일 레이아웃 — 사진+상품명(1줄 ellipsis)을 맨 위에, 나머지 정보는
            한 줄씩 세로로 쌓고, 버튼은 그리드로 균등 배치한다. */}
        <div className="flex flex-col gap-2 rounded-lg border border-border p-2.5 sm:hidden">
          <div className="flex items-center gap-2.5">
            <ProductPhoto photo={product.photos?.[0] ?? product.emoji} className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md bg-accent-soft text-xl" />
            <p className="min-w-0 flex-1 truncate text-[13px] font-semibold">
              {product.name}
              {!isVisible && <span className="ml-1.5 rounded-md bg-bg-sunken px-1.5 py-0.5 text-[10.5px] font-bold text-text-muted">숨김</span>}
            </p>
          </div>
          <div className="flex flex-col gap-0.5 text-[12px] text-text-muted">
            <p>
              판매가 {formatPrice(product.price)} · {EVENT_TYPE_LABEL[product.deliveryType ?? eventType]}
            </p>
            <p>원가 {formatPrice(costPrice ?? 0)}</p>
            {product.stock !== undefined && (
              <p>
                재고 {product.stock}개{isSoldout && <span className="ml-1 font-bold text-red-600">품절</span>}
              </p>
            )}
            <p>
              판매 {soldQty}개 · 예상수익 {formatPrice(totalProfit)}
            </p>
            {optionStockNote && <p className="truncate">{optionStockNote}</p>}
          </div>
          <div className="grid grid-cols-3 gap-1.5">
            <button onClick={toggleVisible} disabled={busy} className="rounded-[7px] border border-border py-1.5 text-[12px] font-semibold disabled:opacity-50">
              {isVisible ? "숨기기" : "노출"}
            </button>
            <button onClick={() => setEditing(true)} className="rounded-[7px] border border-border py-1.5 text-[12px] font-semibold">
              가격/원가 수정
            </button>
            <button onClick={remove} className="rounded-[7px] border border-border py-1.5 text-[12px] font-semibold text-red-600">
              제거
            </button>
          </div>
        </div>
      </>
    );
  }

  return (
    <div className="flex flex-col gap-2.5 rounded-lg border border-accent bg-accent-soft p-2.5">
      <div className="flex items-center gap-3">
        <ProductPhoto photo={product.photos?.[0] ?? product.emoji} className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-accent-soft text-xl" />
        <p className="text-[13px] font-semibold">{product.name}</p>
      </div>
      <div>
        <p className="mb-1 text-[11.5px] font-bold text-text-muted">배송방식</p>
        <div className="flex gap-1.5">
          {DELIVERY_TYPES.map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => setDeliveryType(t)}
              className={`rounded-[7px] border px-2.5 py-1.5 text-[12px] font-semibold ${
                deliveryType === t ? "border-accent bg-accent-soft text-accent-dark" : "border-border text-text-muted"
              }`}
            >
              {EVENT_TYPE_LABEL[t]}
            </button>
          ))}
        </div>
      </div>
      <div className="flex flex-wrap gap-2">
        <input
          className="w-24 rounded-[7px] border border-border bg-bg-card px-2 py-1.5 text-[13px]"
          placeholder="가격"
          type="number"
          value={price}
          onChange={(e) => setPrice(e.target.value)}
        />
        <input
          className="w-24 rounded-[7px] border border-border bg-bg-card px-2 py-1.5 text-[13px]"
          placeholder="원가"
          type="number"
          min={0}
          value={costPriceInput}
          onChange={(e) => setCostPriceInput(e.target.value)}
        />
      </div>
      <p className="-mt-1.5 text-[11px] text-text-muted">
        2+1/묶음 판매 등으로 이 회차만 가격·원가가 다르면 여기서 바꾸면 돼요 — 상품 관리의 기준값은 그대로 유지돼요. 재고는{" "}
        <Link href="/admin/products" className="font-semibold text-accent-dark underline">
          상품 관리
        </Link>
        에서 이 상품을 파는 모든 회차가 함께 봐요.
      </p>
      <label className="flex items-center gap-2 text-[12.5px] text-text-muted">
        <input type="checkbox" checked={visible} onChange={(e) => setVisible(e.target.checked)} />
        고객 화면에 노출
      </label>
      {(() => {
        const combos = generateStockCombos(product.optionGroups ?? []);
        if (combos.length === 0) return null;
        return (
          <div>
            <p className="mb-1 text-[11.5px] font-bold text-text-muted">
              {combos[0].valueIds.length > 1 ? "옵션 조합별 재고" : "옵션별 재고"} (이 회차만 — 바로 저장돼요)
            </p>
            <div className="flex flex-col gap-1.5">
              {combos.map((c) => {
                const key = c.valueIds.join(",");
                return (
                  <OptionStockField
                    key={key}
                    eventProductId={product.id}
                    valueIds={c.valueIds}
                    label={comboLabel(product, c.valueIds)}
                    currentStock={product.optionStockByCombo?.[key] ?? c.defaultStock}
                    onSaved={onSaved}
                  />
                );
              })}
            </div>
          </div>
        );
      })()}
      {error && <p className="text-[11.5px] font-semibold text-red-600">{error}</p>}
      <div className="flex gap-2">
        <button onClick={save} disabled={saving} className="rounded-[7px] bg-accent px-2.5 py-1.5 text-[12px] font-bold text-white">
          {saving ? "저장 중..." : "저장"}
        </button>
        <button onClick={() => setEditing(false)} className="rounded-[7px] border border-border px-2.5 py-1.5 text-[12px]">
          취소
        </button>
      </div>
    </div>
  );
}

// 옵션값 id들을 "색상: 블랙 · 사이즈: 260" 같은 표시용 문자열로.
function comboLabel(product: Product, valueIds: string[]): string {
  const groups = product.optionGroups ?? [];
  return valueIds
    .map((id) => {
      for (const g of groups) {
        const v = g.values.find((x) => x.id === id);
        if (v) return `${g.name}: ${v.name}`;
      }
      return id;
    })
    .join(" · ");
}

// 옵션 조합 하나의 이번 회차 재고 — 다른 필드처럼 "저장" 버튼을 기다리지 않고
// blur 즉시 저장한다(event_option_stock 스냅샷만 바뀌고 카탈로그 기본
// 재고는 그대로 유지됨). valueIds가 1개면 예전처럼 값 하나의 재고, 2개
// 이상이면 그 조합(예: 블랙+260) 전체의 재고다.
function OptionStockField({
  eventProductId,
  valueIds,
  label,
  currentStock,
  onSaved,
}: {
  eventProductId: string;
  valueIds: string[];
  label: string;
  currentStock: number;
  onSaved: () => void;
}) {
  const [stock, setStock] = useState(String(currentStock));
  const [saving, setSaving] = useState(false);

  async function save() {
    setSaving(true);
    try {
      await updateEventOptionStock(eventProductId, valueIds, Math.max(0, Number(stock) || 0));
      onSaved();
    } catch (e) {
      alert(e instanceof Error ? e.message : "저장 중 오류가 발생했어요.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <label className="flex items-center gap-2 text-[12px] text-text-muted">
      <span className="w-40 shrink-0 truncate">{label}</span>
      <input
        className="w-20 rounded-[6px] border border-border bg-bg-card px-2 py-1 text-[12.5px]"
        type="number"
        min={0}
        disabled={saving}
        value={stock}
        onChange={(e) => setStock(e.target.value)}
        onBlur={() => stock !== String(currentStock) && save()}
      />
    </label>
  );
}

// 새 상품을 처음부터 만드는 게 아니라, 카탈로그에서 검색해 골라 이번
// 이벤트의 가격/노출만 정하고 바로 추가한다("상품은 하나, 이벤트에서
// 재사용" — 이벤트 안에서 상품을 새로 만들지 않는다). 재고는 카탈로그
// 상품에 이미 있어 여기서 따로 정할 게 없다.
function AddExistingProductForm({
  eventId,
  eventType,
  alreadyAddedIds,
  onAdded,
}: {
  eventId: string;
  eventType: EventType;
  alreadyAddedIds: string[];
  onAdded: () => void;
}) {
  const [catalog, setCatalog] = useState<CatalogProduct[] | null>(null);
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<CatalogProduct | null>(null);
  const [price, setPrice] = useState("");
  const [costPrice, setCostPrice] = useState("");
  const [visible, setVisible] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    listCatalogProducts().then(setCatalog);
  }, []);

  const results = useMemo(() => {
    if (!catalog) return [];
    const q = query.trim().toLowerCase();
    return catalog.filter((c) => !alreadyAddedIds.includes(c.id) && (q === "" || c.name.toLowerCase().includes(q)));
  }, [catalog, query, alreadyAddedIds]);

  // 상품을 고르면 기준 판매가/원가를 그대로 복사해 기본값으로 채운다 — 이
  // 회차만 다르게(2+1 묶음 등) 팔고 싶으면 제출 전에 그냥 값을 바꾸면 된다.
  function pick(c: CatalogProduct) {
    setSelected(c);
    setPrice(c.basePrice !== undefined ? String(c.basePrice) : "");
    setCostPrice(c.costPrice !== undefined ? String(c.costPrice) : "");
    setVisible(true);
  }

  async function submit() {
    if (!selected || !price) return;
    setSubmitting(true);
    setError(null);
    try {
      await addEventProduct(eventId, {
        catalogProductId: selected.id,
        price: Number(price) || 0,
        costPrice: costPrice.trim() === "" ? undefined : Math.max(0, Number(costPrice) || 0),
        deliveryType: eventType,
        visible,
      });
      setSelected(null);
      setQuery("");
      onAdded();
    } catch (e) {
      setError(e instanceof Error ? e.message : "추가 중 오류가 발생했어요.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="flex flex-col gap-2.5 rounded-xl border border-dashed border-border p-3.5">
      <p className="text-[12.5px] font-bold text-text-muted">상품 추가</p>
      {!selected ? (
        <>
          <input
            className="w-full rounded-[9px] border border-border bg-bg-card px-3 py-2.5 text-[13px]"
            placeholder="상품명 검색 (예: 유정란)"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
          <div className="flex max-h-56 flex-col gap-1.5 overflow-y-auto">
            {catalog === null && <p className="text-[12px] text-text-muted">불러오는 중...</p>}
            {catalog !== null && results.length === 0 && (
              <p className="text-[12px] text-text-muted">
                검색 결과가 없어요.{" "}
                <Link href="/admin/products" className="font-semibold text-accent-dark underline">
                  상품 관리에서 새로 등록
                </Link>
                할 수 있어요.
              </p>
            )}
            {results.map((c) => (
              <button
                key={c.id}
                onClick={() => pick(c)}
                className="flex items-center gap-2.5 rounded-[8px] border border-border px-2.5 py-2 text-left hover:border-accent"
              >
                <ProductPhoto photo={c.photos?.[0] ?? c.emoji} className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-accent-soft text-lg" />
                <span className="truncate text-[13px] font-semibold">{c.name}</span>
              </button>
            ))}
          </div>
          <Link href="/admin/products" className="text-[12px] font-semibold text-accent-dark underline">
            + 새 상품 만들기
          </Link>
        </>
      ) : (
        <>
          <div className="flex items-center gap-2.5 rounded-[8px] bg-accent-soft px-2.5 py-2">
            <ProductPhoto photo={selected.photos?.[0] ?? selected.emoji} className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-bg-card text-lg" />
            <span className="text-[13px] font-semibold">{selected.name}</span>
          </div>
          <div className="flex flex-wrap gap-2">
            <input
              className="w-24 rounded-[7px] border border-border bg-bg-card px-2 py-1.5 text-[13px]"
              placeholder="가격"
              type="number"
              value={price}
              onChange={(e) => setPrice(e.target.value)}
            />
            <input
              className="w-24 rounded-[7px] border border-border bg-bg-card px-2 py-1.5 text-[13px]"
              placeholder="원가"
              type="number"
              min={0}
              value={costPrice}
              onChange={(e) => setCostPrice(e.target.value)}
            />
          </div>
          <p className="-mt-1.5 text-[11px] text-text-muted">
            가격·원가는 상품의 기준값이 자동으로 채워져요. 2+1/묶음 판매처럼 이 회차만 다르면 바꿔서 추가하세요. 재고는{" "}
            <Link href="/admin/products" className="font-semibold text-accent-dark underline">
              상품 관리
            </Link>
            의 재고를 그대로 공유해요.
          </p>
          <label className="flex items-center gap-2 text-[12.5px] text-text-muted">
            <input type="checkbox" checked={visible} onChange={(e) => setVisible(e.target.checked)} />
            고객 화면에 노출
          </label>
          {error && <p className="text-[12px] font-semibold text-red-600">{error}</p>}
          <div className="flex gap-2">
            <button onClick={submit} disabled={submitting || !price} className="rounded-[8px] bg-accent px-4 py-2 text-[13px] font-bold text-white disabled:opacity-50">
              {submitting ? "추가 중..." : "이 이벤트에 추가"}
            </button>
            <button onClick={() => setSelected(null)} className="rounded-[8px] border border-border px-4 py-2 text-[13px] font-semibold">
              다시 검색
            </button>
          </div>
        </>
      )}
    </div>
  );
}
