"use client";

import { use, useEffect, useState } from "react";
import { getEvent, updateEvent, addProduct, updateProduct, deleteProduct, duplicateProduct } from "@/lib/data";
import type { EventType, MarketEvent, Product, ProductDetailBlock } from "@/types";
import { EVENT_TYPE_LABEL } from "@/types";
import { formatPrice } from "@/lib/format";
import { ProductPhoto } from "@/components/ProductPhoto";
import { PhotoUploader } from "@/components/admin/PhotoUploader";
import { DetailBlockEditor } from "@/components/admin/DetailBlockEditor";

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

  function refresh() {
    getEvent(id).then(setEvent);
  }
  useEffect(refresh, [id]);

  if (event === undefined) return <p className="text-sm text-text-muted">불러오는 중...</p>;
  if (event === null) return <p className="text-sm text-text-muted">이벤트를 찾을 수 없어요.</p>;

  async function saveEventFields(patch: Partial<MarketEvent>) {
    setSaving(true);
    await updateEvent(id, patch);
    refresh();
    setSaving(false);
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
      </div>

      <p className="mb-2 text-[13.5px] font-bold">상품 목록</p>
      <div className="mb-4 flex flex-col gap-2">
        {event.products.map((p) => (
          <ProductRow key={p.id} product={p} eventType={event.type} onSaved={refresh} />
        ))}
        {event.products.length === 0 && <p className="text-[12.5px] text-text-muted">등록된 상품이 없어요.</p>}
      </div>

      <AddProductForm eventId={event.id} eventType={event.type} onAdded={refresh} />
    </div>
  );
}

interface ProductFormValues {
  emoji: string;
  name: string;
  price: number;
  origin?: string;
  weight?: string;
  storage?: string;
  deliveryType: EventType;
  photos: string[];
  detailBlocks: ProductDetailBlock[];
}

// One form for both creating and editing a product — every field (photos,
// delivery type, basic info, full 상세설명 block editor) is available up
// front so a product can be written start-to-finish and saved in one shot,
// instead of adding bare fields first and only being able to fill in the
// rest through a separate edit step afterward.
function ProductFormFields({
  eventType,
  initial,
  values,
  setters,
}: {
  eventType: EventType;
  initial?: Product;
  values: {
    emoji: string;
    name: string;
    price: string;
    origin: string;
    weight: string;
    storage: string;
    deliveryType: EventType;
    photos: string[];
    detailBlocks: ProductDetailBlock[];
    stock: string;
    visible: boolean;
  };
  setters: {
    setEmoji: (v: string) => void;
    setName: (v: string) => void;
    setPrice: (v: string) => void;
    setOrigin: (v: string) => void;
    setWeight: (v: string) => void;
    setStorage: (v: string) => void;
    setDeliveryType: (v: EventType) => void;
    setPhotos: (v: string[]) => void;
    setDetailBlocks: (v: ProductDetailBlock[]) => void;
    setStock: (v: string) => void;
    setVisible: (v: boolean) => void;
  };
}) {
  return (
    <>
      <PhotoUploader photos={values.photos} onChange={setters.setPhotos} />

      <div>
        <p className="mb-1 text-[11.5px] font-bold text-text-muted">배송방식</p>
        <div className="flex gap-1.5">
          {DELIVERY_TYPES.map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => setters.setDeliveryType(t)}
              className={`rounded-[7px] border px-2.5 py-1.5 text-[12px] font-semibold ${
                values.deliveryType === t ? "border-accent bg-accent-soft text-accent-dark" : "border-border text-text-muted"
              }`}
            >
              {EVENT_TYPE_LABEL[t]}
            </button>
          ))}
        </div>
      </div>

      <div className="flex flex-wrap gap-2">
        <input
          className="w-14 rounded-[7px] border border-border bg-bg-card px-2 py-1.5 text-center text-[13px]"
          value={values.emoji}
          onChange={(e) => setters.setEmoji(e.target.value)}
          placeholder="🥚"
        />
        <input
          className="min-w-[140px] flex-1 rounded-[7px] border border-border bg-bg-card px-2 py-1.5 text-[13px]"
          placeholder="상품명"
          value={values.name}
          onChange={(e) => setters.setName(e.target.value)}
        />
        <input
          className="w-24 rounded-[7px] border border-border bg-bg-card px-2 py-1.5 text-[13px]"
          placeholder="가격"
          type="number"
          value={values.price}
          onChange={(e) => setters.setPrice(e.target.value)}
        />
        <input
          className="w-24 rounded-[7px] border border-border bg-bg-card px-2 py-1.5 text-[13px]"
          placeholder="원산지"
          value={values.origin}
          onChange={(e) => setters.setOrigin(e.target.value)}
        />
        <input
          className="w-24 rounded-[7px] border border-border bg-bg-card px-2 py-1.5 text-[13px]"
          placeholder="중량"
          value={values.weight}
          onChange={(e) => setters.setWeight(e.target.value)}
        />
        <input
          className="w-28 rounded-[7px] border border-border bg-bg-card px-2 py-1.5 text-[13px]"
          placeholder="보관법"
          value={values.storage}
          onChange={(e) => setters.setStorage(e.target.value)}
        />
        <input
          className="w-24 rounded-[7px] border border-border bg-bg-card px-2 py-1.5 text-[13px]"
          placeholder="재고(비우면 무제한)"
          type="number"
          min={0}
          value={values.stock}
          onChange={(e) => setters.setStock(e.target.value)}
        />
      </div>

      <label className="flex items-center gap-2 text-[12.5px] text-text-muted">
        <input type="checkbox" checked={values.visible} onChange={(e) => setters.setVisible(e.target.checked)} />
        고객 화면에 노출
      </label>

      <div>
        <p className="mb-1.5 text-[12px] font-bold text-text-muted">상세설명 (제목/본문/사진)</p>
        <DetailBlockEditor blocks={values.detailBlocks} onChange={setters.setDetailBlocks} />
      </div>
    </>
  );
}

function ProductRow({ product, eventType, onSaved }: { product: Product; eventType: EventType; onSaved: () => void }) {
  const [editing, setEditing] = useState(false);
  const [emoji, setEmoji] = useState(product.emoji);
  const [name, setName] = useState(product.name);
  const [price, setPrice] = useState(String(product.price));
  const [origin, setOrigin] = useState(product.origin ?? "");
  const [weight, setWeight] = useState(product.weight ?? "");
  const [storage, setStorage] = useState(product.storage ?? "");
  const [deliveryType, setDeliveryType] = useState<EventType>(product.deliveryType ?? eventType);
  const [photos, setPhotos] = useState<string[]>(product.photos ?? []);
  const [detailBlocks, setDetailBlocks] = useState<ProductDetailBlock[]>(product.detailBlocks ?? []);
  const [stock, setStock] = useState(product.stock !== undefined ? String(product.stock) : "");
  const [visible, setVisible] = useState(product.visible !== false);
  const [saving, setSaving] = useState(false);
  const [busy, setBusy] = useState(false);

  async function save() {
    if (!name.trim() || !price) return;
    setSaving(true);
    await updateProduct(product.id, {
      name: name.trim(),
      price: Number(price) || 0,
      emoji: emoji || "📦",
      photos,
      detailBlocks,
      deliveryType,
      origin,
      weight,
      storage,
      stock: stock.trim() === "" ? undefined : Math.max(0, Number(stock) || 0),
      visible,
    });
    setSaving(false);
    setEditing(false);
    onSaved();
  }
  async function remove() {
    if (!confirm(`"${product.name}" 상품을 삭제할까요?`)) return;
    await deleteProduct(product.id);
    onSaved();
  }
  // 노출 스위치/품절 처리는 편집 화면을 열지 않고 목록에서 바로 한 번에 끝낸다.
  async function toggleVisible() {
    setBusy(true);
    await updateProduct(product.id, { visible: !(product.visible !== false) });
    setBusy(false);
    onSaved();
  }
  async function toggleSoldout() {
    setBusy(true);
    await updateProduct(product.id, { stock: product.stock === 0 ? undefined : 0 });
    setBusy(false);
    onSaved();
  }
  async function duplicate() {
    setBusy(true);
    await duplicateProduct(product.id);
    setBusy(false);
    onSaved();
  }

  if (!editing) {
    const isSoldout = product.stock === 0;
    const isVisible = product.visible !== false;
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
          <button onClick={duplicate} disabled={busy} className="rounded-[7px] border border-border px-2.5 py-1 text-[12px] font-semibold disabled:opacity-50">
            복사
          </button>
          <button onClick={() => setEditing(true)} className="rounded-[7px] border border-border px-2.5 py-1 text-[12px] font-semibold">
            수정
          </button>
          <button onClick={remove} className="rounded-[7px] border border-border px-2.5 py-1 text-[12px] font-semibold text-red-600">
            삭제
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-2.5 rounded-lg border border-accent bg-accent-soft p-2.5">
      <ProductFormFields
        eventType={eventType}
        initial={product}
        values={{ emoji, name, price, origin, weight, storage, deliveryType, photos, detailBlocks, stock, visible }}
        setters={{ setEmoji, setName, setPrice, setOrigin, setWeight, setStorage, setDeliveryType, setPhotos, setDetailBlocks, setStock, setVisible }}
      />
      <div className="flex gap-2">
        <button onClick={save} disabled={saving} className="rounded-[7px] bg-accent px-2.5 py-1.5 text-[12px] font-bold text-white">
          저장
        </button>
        <button onClick={() => setEditing(false)} className="rounded-[7px] border border-border px-2.5 py-1.5 text-[12px]">
          취소
        </button>
      </div>
    </div>
  );
}

function AddProductForm({ eventId, eventType, onAdded }: { eventId: string; eventType: EventType; onAdded: () => void }) {
  const [emoji, setEmoji] = useState("📦");
  const [name, setName] = useState("");
  const [price, setPrice] = useState("");
  const [origin, setOrigin] = useState("");
  const [weight, setWeight] = useState("");
  const [storage, setStorage] = useState("");
  const [deliveryType, setDeliveryType] = useState<EventType>(eventType);
  const [photos, setPhotos] = useState<string[]>([]);
  const [detailBlocks, setDetailBlocks] = useState<ProductDetailBlock[]>([]);
  const [stock, setStock] = useState("");
  const [visible, setVisible] = useState(true);
  const [submitting, setSubmitting] = useState(false);

  async function submit() {
    if (!name.trim() || !price) return;
    setSubmitting(true);
    await addProduct(eventId, {
      name: name.trim(),
      price: Number(price) || 0,
      emoji: emoji || "📦",
      photos,
      detailBlocks,
      deliveryType,
      origin,
      weight,
      storage,
      stock: stock.trim() === "" ? undefined : Math.max(0, Number(stock) || 0),
      visible,
    });
    setEmoji("📦");
    setName("");
    setPrice("");
    setOrigin("");
    setWeight("");
    setStorage("");
    setDeliveryType(eventType);
    setPhotos([]);
    setDetailBlocks([]);
    setStock("");
    setVisible(true);
    setSubmitting(false);
    onAdded();
  }

  return (
    <div className="flex flex-col gap-2.5 rounded-xl border border-dashed border-border p-3.5">
      <p className="text-[12.5px] font-bold text-text-muted">상품 추가</p>
      <ProductFormFields
        eventType={eventType}
        values={{ emoji, name, price, origin, weight, storage, deliveryType, photos, detailBlocks, stock, visible }}
        setters={{ setEmoji, setName, setPrice, setOrigin, setWeight, setStorage, setDeliveryType, setPhotos, setDetailBlocks, setStock, setVisible }}
      />
      <button onClick={submit} disabled={submitting} className="rounded-[8px] bg-accent px-4 py-2 text-[13px] font-bold text-white disabled:opacity-50">
        {submitting ? "저장 중..." : "저장"}
      </button>
    </div>
  );
}
