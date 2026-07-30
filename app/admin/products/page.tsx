"use client";

import { useEffect, useMemo, useState } from "react";
import { listCatalogProducts, createCatalogProduct, updateCatalogProduct, deleteCatalogProduct } from "@/lib/data";
import type { CatalogProduct, ProductDetailBlock } from "@/types";
import { ProductPhoto } from "@/components/ProductPhoto";
import { PhotoUploader } from "@/components/admin/PhotoUploader";
import { DetailBlockEditor } from "@/components/admin/DetailBlockEditor";
import { formatPrice } from "@/lib/format";

// 상품은 하나만 존재하고 여러 이벤트가 재사용한다 — 여기서 고치는 사진/설명은
// 이 상품을 쓰는 모든 이벤트에 바로 반영된다. 가격·재고·노출은 이벤트마다
// 다를 수 있어서 각 이벤트 관리 화면(/admin/events/[id])에서 따로 정한다.
export default function AdminProductsPage() {
  const [products, setProducts] = useState<CatalogProduct[] | null>(null);
  const [query, setQuery] = useState("");
  const [creating, setCreating] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);

  function refresh() {
    listCatalogProducts().then(setProducts);
  }
  useEffect(refresh, []);

  const filtered = useMemo(() => {
    if (!products) return [];
    const q = query.trim().toLowerCase();
    return q === "" ? products : products.filter((p) => p.name.toLowerCase().includes(q));
  }, [products, query]);

  async function onDelete(p: CatalogProduct) {
    if (!confirm(`"${p.name}" 상품을 삭제할까요?`)) return;
    try {
      await deleteCatalogProduct(p.id);
      refresh();
    } catch (e) {
      alert(e instanceof Error ? e.message : "삭제 중 오류가 발생했어요.");
    }
  }

  return (
    <div className="max-w-2xl">
      <div className="mb-2 flex items-center justify-between">
        <p className="text-[15px] font-bold">상품 관리</p>
        <button onClick={() => setCreating((v) => !v)} className="rounded-[9px] bg-accent px-3.5 py-2 text-[13px] font-bold text-white">
          {creating ? "닫기" : "+ 새 상품"}
        </button>
      </div>
      <p className="mb-4 text-[12px] text-text-muted">
        여기서 고친 사진·설명은 이 상품을 쓰는 모든 이벤트에 바로 반영돼요. 가격·재고·노출은 이벤트별로 다를 수 있어서 각 이벤트 관리 화면에서 정해요.
      </p>

      {creating && (
        <div className="mb-4 rounded-xl border border-dashed border-accent bg-accent-soft p-3.5">
          <CatalogProductForm
            onSubmit={async (values) => {
              await createCatalogProduct(values);
              setCreating(false);
              refresh();
            }}
            onCancel={() => setCreating(false)}
            submitLabel="상품 등록"
          />
        </div>
      )}

      <input
        className="mb-3 w-full rounded-[9px] border border-border bg-bg-card px-3 py-2.5 text-[13px]"
        placeholder="상품명 검색"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
      />

      {products === null && <p className="text-sm text-text-muted">불러오는 중...</p>}
      {products !== null && filtered.length === 0 && <p className="text-sm text-text-muted">상품이 없어요.</p>}
      <div className="flex flex-col gap-2">
        {filtered.map((p) =>
          editingId === p.id ? (
            <div key={p.id} className="rounded-xl border border-accent bg-accent-soft p-3.5">
              <CatalogProductForm
                initial={p}
                onSubmit={async (values) => {
                  await updateCatalogProduct(p.id, values);
                  setEditingId(null);
                  refresh();
                }}
                onCancel={() => setEditingId(null)}
                submitLabel="저장"
              />
            </div>
          ) : (
            <div key={p.id} className="flex items-center gap-3 rounded-lg border border-border p-2.5">
              <ProductPhoto photo={p.photos?.[0] ?? p.emoji} className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md bg-accent-soft text-xl" />
              <div className="min-w-0 flex-1">
                <p className="truncate text-[13px] font-semibold">{p.name}</p>
                <p className="truncate text-[12px] text-text-muted">{[p.origin, p.weight, p.storage].filter(Boolean).join(" · ") || "추가 정보 없음"}</p>
                <p className="truncate text-[11.5px] text-text-muted">
                  기준가 {formatPrice(p.basePrice ?? 0)}
                  {p.costPrice !== undefined && ` · 원가 ${formatPrice(p.costPrice)}`}
                </p>
              </div>
              <div className="flex gap-1.5">
                <button onClick={() => setEditingId(p.id)} className="rounded-[7px] border border-border px-2.5 py-1 text-[12px] font-semibold">
                  수정
                </button>
                <button onClick={() => onDelete(p)} className="rounded-[7px] border border-border px-2.5 py-1 text-[12px] font-semibold text-red-600">
                  삭제
                </button>
              </div>
            </div>
          ),
        )}
      </div>
    </div>
  );
}

function CatalogProductForm({
  initial,
  onSubmit,
  onCancel,
  submitLabel,
}: {
  initial?: CatalogProduct;
  onSubmit: (values: Omit<CatalogProduct, "id">) => Promise<void>;
  onCancel: () => void;
  submitLabel: string;
}) {
  const [emoji, setEmoji] = useState(initial?.emoji ?? "📦");
  const [name, setName] = useState(initial?.name ?? "");
  const [basePrice, setBasePrice] = useState(initial?.basePrice !== undefined ? String(initial.basePrice) : "");
  const [costPrice, setCostPrice] = useState(initial?.costPrice !== undefined ? String(initial.costPrice) : "");
  const [origin, setOrigin] = useState(initial?.origin ?? "");
  const [weight, setWeight] = useState(initial?.weight ?? "");
  const [storage, setStorage] = useState(initial?.storage ?? "");
  const [eat, setEat] = useState(initial?.eat ?? "");
  const [description, setDescription] = useState(initial?.description ?? "");
  const [photos, setPhotos] = useState<string[]>(initial?.photos ?? []);
  const [detailBlocks, setDetailBlocks] = useState<ProductDetailBlock[]>(initial?.detailBlocks ?? []);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // onSubmit(createCatalogProduct/updateCatalogProduct)이 실패하면(예: mock 모드
  // localStorage 용량 초과) 반드시 catch에서 잡아 submitting을 풀어줘야 한다 —
  // 그러지 않으면 버튼이 "저장 중..."에 영원히 멈춰버린다(사진 여러 장으로 재현된
  // 버그의 직접 원인). 단계별 로그는 어디서 멈추는지 콘솔에서 바로 보이게 한다.
  async function submit() {
    if (!name.trim()) return;
    console.log("[상품 저장] 시작", { name: name.trim(), photoCount: photos.length });
    setSubmitting(true);
    setError(null);
    try {
      console.log("[상품 저장] DB 저장 시작");
      await onSubmit({
        name: name.trim(),
        emoji: emoji || "📦",
        basePrice: basePrice.trim() === "" ? 0 : Math.max(0, Number(basePrice) || 0),
        costPrice: costPrice.trim() === "" ? 0 : Math.max(0, Number(costPrice) || 0),
        origin: origin || undefined,
        weight: weight || undefined,
        storage: storage || undefined,
        eat: eat || undefined,
        description: description || undefined,
        photos,
        detailBlocks,
      });
      console.log("[상품 저장] DB 저장 완료");
    } catch (e) {
      console.error("[상품 저장] 실패", e);
      setError(e instanceof Error ? e.message : "저장 중 오류가 발생했어요.");
    } finally {
      setSubmitting(false);
      console.log("[상품 저장] 종료(응답 반환)");
    }
  }

  return (
    <div className="flex flex-col gap-2.5">
      <PhotoUploader photos={photos} onChange={setPhotos} />
      <div className="flex flex-wrap gap-2">
        <input className="w-14 rounded-[7px] border border-border bg-bg-card px-2 py-1.5 text-center text-[13px]" value={emoji} onChange={(e) => setEmoji(e.target.value)} placeholder="🥚" />
        <input
          className="min-w-[160px] flex-1 rounded-[7px] border border-border bg-bg-card px-2 py-1.5 text-[13px]"
          placeholder="상품명"
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
        <input className="w-24 rounded-[7px] border border-border bg-bg-card px-2 py-1.5 text-[13px]" placeholder="원산지" value={origin} onChange={(e) => setOrigin(e.target.value)} />
        <input className="w-24 rounded-[7px] border border-border bg-bg-card px-2 py-1.5 text-[13px]" placeholder="중량" value={weight} onChange={(e) => setWeight(e.target.value)} />
        <input className="w-28 rounded-[7px] border border-border bg-bg-card px-2 py-1.5 text-[13px]" placeholder="보관법" value={storage} onChange={(e) => setStorage(e.target.value)} />
        <input className="w-28 rounded-[7px] border border-border bg-bg-card px-2 py-1.5 text-[13px]" placeholder="조리법" value={eat} onChange={(e) => setEat(e.target.value)} />
      </div>
      <div className="flex flex-wrap gap-2">
        <label className="min-w-[110px] flex-1 text-[11.5px] font-semibold text-text-muted">
          기준 판매가
          <input
            className="mt-1 w-full rounded-[7px] border border-border bg-bg-card px-2 py-1.5 text-[13px]"
            placeholder="0"
            type="number"
            min={0}
            value={basePrice}
            onChange={(e) => setBasePrice(e.target.value)}
          />
        </label>
        <label className="min-w-[110px] flex-1 text-[11.5px] font-semibold text-text-muted">
          원가 <span className="font-normal">(관리자만 봐요)</span>
          <input
            className="mt-1 w-full rounded-[7px] border border-border bg-bg-card px-2 py-1.5 text-[13px]"
            placeholder="0"
            type="number"
            min={0}
            value={costPrice}
            onChange={(e) => setCostPrice(e.target.value)}
          />
        </label>
      </div>
      <p className="-mt-1.5 text-[11px] text-text-muted">
        새 이벤트에 이 상품을 추가하면 기준 판매가·원가가 기본값으로 채워지고, 그 회차에서만 다르게(2+1 묶음 등) 바꿀 수 있어요.
      </p>
      <textarea
        className="rounded-[9px] border border-border bg-bg-card px-3 py-2.5 text-[13px]"
        rows={3}
        placeholder="상품 한 줄 설명"
        value={description}
        onChange={(e) => setDescription(e.target.value)}
      />
      <div>
        <p className="mb-1.5 text-[12px] font-bold text-text-muted">상세설명 (제목/본문/사진)</p>
        <DetailBlockEditor blocks={detailBlocks} onChange={setDetailBlocks} />
      </div>
      {error && <p className="text-[12.5px] font-semibold text-red-600">{error}</p>}
      <div className="flex gap-2">
        <button onClick={submit} disabled={submitting || !name.trim()} className="rounded-[8px] bg-accent px-4 py-2 text-[13px] font-bold text-white disabled:opacity-50">
          {submitting ? "저장 중..." : submitLabel}
        </button>
        <button onClick={onCancel} className="rounded-[8px] border border-border px-4 py-2 text-[13px] font-semibold">
          취소
        </button>
      </div>
    </div>
  );
}
