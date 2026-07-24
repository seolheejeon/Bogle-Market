"use client";

import { use, useEffect, useState } from "react";
import { getEvent, updateEvent, addProduct, updateProduct, deleteProduct } from "@/lib/data";
import type { MarketEvent, Product } from "@/types";
import { formatPrice } from "@/lib/format";
import { ProductPhoto } from "@/components/ProductPhoto";
import { PhotoUploader } from "@/components/admin/PhotoUploader";

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
          <ProductRow key={p.id} product={p} onSaved={refresh} />
        ))}
        {event.products.length === 0 && <p className="text-[12.5px] text-text-muted">등록된 상품이 없어요.</p>}
      </div>

      <AddProductForm eventId={event.id} onAdded={refresh} />
    </div>
  );
}

function ProductRow({ product, onSaved }: { product: Product; onSaved: () => void }) {
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(product.name);
  const [price, setPrice] = useState(String(product.price));
  const [emoji, setEmoji] = useState(product.emoji);
  const [photos, setPhotos] = useState<string[]>(product.photos ?? []);
  const [saving, setSaving] = useState(false);

  async function save() {
    setSaving(true);
    await updateProduct(product.id, { name, price: Number(price) || 0, emoji, photos });
    setSaving(false);
    setEditing(false);
    onSaved();
  }
  async function remove() {
    if (!confirm(`"${product.name}" 상품을 삭제할까요?`)) return;
    await deleteProduct(product.id);
    onSaved();
  }

  if (!editing) {
    return (
      <div className="flex items-center gap-3 rounded-lg border border-border p-2.5">
        <ProductPhoto photo={product.photos?.[0] ?? product.emoji} className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-accent-soft text-xl" />
        <div className="min-w-0 flex-1">
          <p className="truncate text-[13px] font-semibold">{product.name}</p>
          <p className="text-[12px] text-text-muted">{formatPrice(product.price)}</p>
        </div>
        <button onClick={() => setEditing(true)} className="rounded-[7px] border border-border px-2.5 py-1 text-[12px] font-semibold">
          수정
        </button>
        <button onClick={remove} className="rounded-[7px] border border-border px-2.5 py-1 text-[12px] font-semibold text-red-600">
          삭제
        </button>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-2.5 rounded-lg border border-accent bg-accent-soft p-2.5">
      <PhotoUploader photos={photos} onChange={setPhotos} />
      <div className="flex flex-wrap items-center gap-2">
        <input className="w-14 rounded-[7px] border border-border bg-bg-card px-2 py-1.5 text-center text-[13px]" value={emoji} onChange={(e) => setEmoji(e.target.value)} />
        <input className="min-w-0 flex-1 rounded-[7px] border border-border bg-bg-card px-2 py-1.5 text-[13px]" value={name} onChange={(e) => setName(e.target.value)} />
        <input className="w-24 rounded-[7px] border border-border bg-bg-card px-2 py-1.5 text-[13px]" type="number" value={price} onChange={(e) => setPrice(e.target.value)} />
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

function AddProductForm({ eventId, onAdded }: { eventId: string; onAdded: () => void }) {
  const [name, setName] = useState("");
  const [price, setPrice] = useState("");
  const [emoji, setEmoji] = useState("📦");
  const [origin, setOrigin] = useState("");
  const [weight, setWeight] = useState("");
  const [storage, setStorage] = useState("");
  const [photos, setPhotos] = useState<string[]>([]);
  const [submitting, setSubmitting] = useState(false);

  async function submit() {
    if (!name.trim() || !price) return;
    setSubmitting(true);
    await addProduct(eventId, { name: name.trim(), price: Number(price) || 0, emoji: emoji || "📦", photos, origin, weight, storage });
    setName("");
    setPrice("");
    setOrigin("");
    setWeight("");
    setStorage("");
    setPhotos([]);
    setSubmitting(false);
    onAdded();
  }

  return (
    <div className="rounded-xl border border-dashed border-border p-3.5">
      <p className="mb-2 text-[12.5px] font-bold text-text-muted">상품 추가</p>
      <PhotoUploader photos={photos} onChange={setPhotos} />
      <div className="mt-2 flex flex-wrap gap-2">
        <input className="w-14 rounded-[8px] border border-border bg-bg-card px-2 py-2 text-center text-[13px]" value={emoji} onChange={(e) => setEmoji(e.target.value)} placeholder="🥚" />
        <input className="min-w-[140px] flex-1 rounded-[8px] border border-border bg-bg-card px-2.5 py-2 text-[13px]" placeholder="상품명" value={name} onChange={(e) => setName(e.target.value)} />
        <input className="w-28 rounded-[8px] border border-border bg-bg-card px-2.5 py-2 text-[13px]" placeholder="가격" type="number" value={price} onChange={(e) => setPrice(e.target.value)} />
        <input className="w-24 rounded-[8px] border border-border bg-bg-card px-2.5 py-2 text-[13px]" placeholder="원산지" value={origin} onChange={(e) => setOrigin(e.target.value)} />
        <input className="w-24 rounded-[8px] border border-border bg-bg-card px-2.5 py-2 text-[13px]" placeholder="중량" value={weight} onChange={(e) => setWeight(e.target.value)} />
        <input className="w-28 rounded-[8px] border border-border bg-bg-card px-2.5 py-2 text-[13px]" placeholder="보관법" value={storage} onChange={(e) => setStorage(e.target.value)} />
        <button onClick={submit} disabled={submitting} className="rounded-[8px] bg-accent px-4 py-2 text-[13px] font-bold text-white disabled:opacity-50">
          추가
        </button>
      </div>
    </div>
  );
}
