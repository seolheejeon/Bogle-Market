"use client";

import { use, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { getEvent, updateEvent, listCatalogProducts, addEventProduct, updateEventProduct, removeEventProduct } from "@/lib/data";
import type { CatalogProduct, EventType, MarketEvent, Product } from "@/types";
import { EVENT_TYPE_LABEL } from "@/types";
import { formatPrice } from "@/lib/format";
import { ProductPhoto } from "@/components/ProductPhoto";

const DELIVERY_TYPES: EventType[] = ["DOOR", "GROUP_BUY", "PARCEL"];

function toLocalInputValue(iso: string) {
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export default function AdminEventEditPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const [event, setEvent] = useState<MarketEvent | null | undefined>(undefined);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function refresh() {
    getEvent(id).then(setEvent);
  }
  useEffect(refresh, [id]);

  if (event === undefined) return <p className="text-sm text-text-muted">불러오는 중...</p>;
  if (event === null) return <p className="text-sm text-text-muted">이벤트를 찾을 수 없어요.</p>;

  async function saveEventFields(patch: Partial<MarketEvent>) {
    setSaving(true);
    setError(null);
    try {
      await updateEvent(id, patch);
      refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "저장 중 오류가 발생했어요.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="max-w-2xl">
      <p className="mb-4 text-[15px] font-bold">{event.title} 관리</p>

      <div className="mb-6 flex flex-col gap-3 rounded-xl border border-border p-4">
        <label className="text-[12.5px] font-semibold text-text-muted">
          이벤트 이름
          <input
            className="mt-1 w-full rounded-[9px] border border-border bg-bg-card px-3 py-2.5 text-[13px]"
            defaultValue={event.title}
            onBlur={(e) => e.target.value !== event.title && saveEventFields({ title: e.target.value })}
          />
        </label>
        <label className="text-[12.5px] font-semibold text-text-muted">
          주문 마감
          <input
            type="datetime-local"
            className="mt-1 w-full rounded-[9px] border border-border bg-bg-card px-3 py-2.5 text-[13px]"
            defaultValue={toLocalInputValue(event.deadlineAt)}
            onBlur={(e) => saveEventFields({ deadlineAt: new Date(e.target.value).toISOString() })}
          />
        </label>
        <label className="text-[12.5px] font-semibold text-text-muted">
          배송일
          <input
            type="datetime-local"
            className="mt-1 w-full rounded-[9px] border border-border bg-bg-card px-3 py-2.5 text-[13px]"
            defaultValue={toLocalInputValue(event.deliveryAt)}
            onBlur={(e) => saveEventFields({ deliveryAt: new Date(e.target.value).toISOString() })}
          />
        </label>
        <label className="text-[12.5px] font-semibold text-text-muted">
          안내 문구
          <textarea
            className="mt-1 w-full rounded-[9px] border border-border bg-bg-card px-3 py-2.5 text-[13px]"
            rows={3}
            defaultValue={event.notice}
            onBlur={(e) => e.target.value !== event.notice && saveEventFields({ notice: e.target.value })}
          />
        </label>
        {saving && <p className="text-[11.5px] text-text-muted">저장 중...</p>}
        {error && <p className="text-[11.5px] font-semibold text-red-600">{error}</p>}
      </div>

      <p className="mb-2 text-[13.5px] font-bold">상품 목록</p>
      <p className="mb-2 text-[11.5px] text-text-muted">
        사진·설명 등 상품 내용은{" "}
        <Link href="/admin/products" className="font-semibold text-accent-dark underline">
          상품 관리
        </Link>
        에서 고치면 이 상품을 쓰는 모든 이벤트에 바로 반영돼요. 여기서는 이번 회차의 가격·재고·노출만 정해요.
      </p>
      <div className="mb-4 flex flex-col gap-2">
        {event.products.map((p) => (
          <EventProductRow key={p.id} product={p} eventType={event.type} onSaved={refresh} />
        ))}
        {event.products.length === 0 && <p className="text-[12.5px] text-text-muted">등록된 상품이 없어요.</p>}
      </div>

      <AddExistingProductForm eventId={event.id} eventType={event.type} alreadyAddedIds={event.products.map((p) => p.catalogProductId)} onAdded={refresh} />
    </div>
  );
}

function EventProductRow({ product, eventType, onSaved }: { product: Product; eventType: EventType; onSaved: () => void }) {
  const [editing, setEditing] = useState(false);
  const [price, setPrice] = useState(String(product.price));
  const [deliveryType, setDeliveryType] = useState<EventType>(product.deliveryType ?? eventType);
  const [stock, setStock] = useState(product.stock !== undefined ? String(product.stock) : "");
  const [visible, setVisible] = useState(product.visible !== false);
  const [saving, setSaving] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function save() {
    if (!price) return;
    setSaving(true);
    setError(null);
    try {
      await updateEventProduct(product.id, {
        price: Number(price) || 0,
        deliveryType,
        stock: stock.trim() === "" ? undefined : Math.max(0, Number(stock) || 0),
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
  // 노출 스위치/품절 처리는 편집 화면을 열지 않고 목록에서 바로 한 번에 끝낸다.
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
  async function toggleSoldout() {
    setBusy(true);
    try {
      await updateEventProduct(product.id, { stock: product.stock === 0 ? undefined : 0 });
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
    return (
      <div className="flex items-center gap-3 rounded-lg border border-border p-2.5">
        <ProductPhoto photo={product.photos?.[0] ?? product.emoji} className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-accent-soft text-xl" />
        <div className="min-w-0 flex-1">
          <p className="truncate text-[13px] font-semibold">
            {product.name}
            {!isVisible && <span className="ml-1.5 rounded-md bg-bg-sunken px-1.5 py-0.5 text-[10.5px] font-bold text-text-muted">숨김</span>}
          </p>
          <p className="text-[12px] text-text-muted">
            {formatPrice(product.price)} · {EVENT_TYPE_LABEL[product.deliveryType ?? eventType]}
            {product.stock !== undefined && ` · 재고 ${product.stock}개`}
          </p>
        </div>
        <div className="flex flex-wrap justify-end gap-1.5">
          <button onClick={toggleVisible} disabled={busy} className="rounded-[7px] border border-border px-2.5 py-1 text-[12px] font-semibold disabled:opacity-50">
            {isVisible ? "숨기기" : "노출"}
          </button>
          <button
            onClick={toggleSoldout}
            disabled={busy}
            className={`rounded-[7px] border px-2.5 py-1 text-[12px] font-semibold disabled:opacity-50 ${isSoldout ? "border-red-200 bg-red-50 text-red-600" : "border-border"}`}
          >
            {isSoldout ? "품절중" : "품절 처리"}
          </button>
          <button onClick={() => setEditing(true)} className="rounded-[7px] border border-border px-2.5 py-1 text-[12px] font-semibold">
            가격/재고 수정
          </button>
          <button onClick={remove} className="rounded-[7px] border border-border px-2.5 py-1 text-[12px] font-semibold text-red-600">
            제거
          </button>
        </div>
      </div>
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
          placeholder="재고(비우면 무제한)"
          type="number"
          min={0}
          value={stock}
          onChange={(e) => setStock(e.target.value)}
        />
      </div>
      <label className="flex items-center gap-2 text-[12.5px] text-text-muted">
        <input type="checkbox" checked={visible} onChange={(e) => setVisible(e.target.checked)} />
        고객 화면에 노출
      </label>
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

// 새 상품을 처음부터 만드는 게 아니라, 카탈로그에서 검색해 골라 이번
// 이벤트의 가격/재고/노출만 정하고 바로 추가한다("상품은 하나, 이벤트에서
// 재사용" — 이벤트 안에서 상품을 새로 만들지 않는다).
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
  const [stock, setStock] = useState("");
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

  function pick(c: CatalogProduct) {
    setSelected(c);
    setPrice("");
    setStock("");
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
        deliveryType: eventType,
        stock: stock.trim() === "" ? undefined : Math.max(0, Number(stock) || 0),
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
              placeholder="재고(비우면 무제한)"
              type="number"
              min={0}
              value={stock}
              onChange={(e) => setStock(e.target.value)}
            />
          </div>
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
