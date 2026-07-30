"use client";

import { useEffect, useRef, useState } from "react";
import { listBanners, createBanner, updateBanner, deleteBanner, reorderBanners, listCatalogProducts, listEvents, isBannerLive } from "@/lib/data";
import { uploadProductPhoto } from "@/lib/supabase/storage";
import type { Banner, BannerLinkType, CatalogProduct, MarketEvent } from "@/types";
import { BANNER_LINK_LABEL } from "@/types";
import { ProductPhoto } from "@/components/ProductPhoto";
import { SearchPicker } from "@/components/admin/SearchPicker";

const LINK_TYPES: BannerLinkType[] = ["NONE", "PRODUCT", "EVENT", "URL"];

function toLocalInputValue(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export default function AdminBannersPage() {
  const [banners, setBanners] = useState<Banner[] | null>(null);
  const [catalog, setCatalog] = useState<CatalogProduct[] | null>(null);
  const [events, setEvents] = useState<MarketEvent[] | null>(null);
  const [creating, setCreating] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [dragIndex, setDragIndex] = useState<number | null>(null);

  function refresh() {
    listBanners().then(setBanners);
  }
  useEffect(refresh, []);
  useEffect(() => {
    listCatalogProducts().then(setCatalog);
    listEvents().then(setEvents);
  }, []);

  async function onDelete(b: Banner) {
    if (!confirm("이 배너를 삭제할까요?")) return;
    try {
      await deleteBanner(b.id);
      refresh();
    } catch (e) {
      alert(e instanceof Error ? e.message : "삭제 중 오류가 발생했어요.");
    }
  }

  async function toggleActive(b: Banner) {
    await updateBanner(b.id, { active: !b.active });
    refresh();
  }

  async function move(i: number, dir: -1 | 1) {
    if (!banners) return;
    const j = i + dir;
    if (j < 0 || j >= banners.length) return;
    await reorder(i, j);
  }

  async function reorder(from: number, to: number) {
    if (!banners) return;
    const next = banners.slice();
    const [moved] = next.splice(from, 1);
    next.splice(to, 0, moved);
    setBanners(next);
    await reorderBanners(next.map((b) => b.id));
    refresh();
  }

  return (
    <div className="max-w-2xl">
      <div className="mb-2 flex items-center justify-between">
        <p className="text-[15px] font-bold">배너 관리</p>
        <button onClick={() => setCreating((v) => !v)} className="rounded-[9px] bg-accent px-3.5 py-2 text-[13px] font-bold text-white">
          {creating ? "닫기" : "+ 새 배너"}
        </button>
      </div>
      <p className="mb-4 text-[12px] text-text-muted">
        메인 홈 상단에 슬라이드로 노출돼요. 여러 개를 등록하면 순서대로 넘어가고, 배너가 하나도 없거나 전부 비활성/기간 밖이면 자동 배너로 대신
        보여줘요.
      </p>

      {creating && (
        <div className="mb-4 rounded-xl border border-dashed border-accent bg-accent-soft p-3.5">
          <BannerForm
            catalog={catalog}
            events={events}
            onSubmit={async (values) => {
              await createBanner(values);
              setCreating(false);
              refresh();
            }}
            onCancel={() => setCreating(false)}
            submitLabel="배너 등록"
          />
        </div>
      )}

      {banners === null && <p className="text-sm text-text-muted">불러오는 중...</p>}
      {banners !== null && banners.length === 0 && <p className="text-sm text-text-muted">등록된 배너가 없어요.</p>}
      <div className="flex flex-col gap-2">
        {banners?.map((b, i) =>
          editingId === b.id ? (
            <div key={b.id} className="rounded-xl border border-accent bg-accent-soft p-3.5">
              <BannerForm
                initial={b}
                catalog={catalog}
                events={events}
                onSubmit={async (values) => {
                  await updateBanner(b.id, values);
                  setEditingId(null);
                  refresh();
                }}
                onCancel={() => setEditingId(null)}
                submitLabel="저장"
              />
            </div>
          ) : (
            <div
              key={b.id}
              draggable
              onDragStart={() => setDragIndex(i)}
              onDragOver={(e) => e.preventDefault()}
              onDrop={(e) => {
                e.preventDefault();
                if (dragIndex !== null && dragIndex !== i) reorder(dragIndex, i);
                setDragIndex(null);
              }}
              onDragEnd={() => setDragIndex(null)}
              className={`flex items-center gap-3 rounded-lg border p-2.5 transition-opacity ${dragIndex === i ? "border-accent opacity-40" : "border-border"}`}
            >
              <div className="flex cursor-grab flex-col items-center gap-0.5 select-none active:cursor-grabbing">
                <span className="text-[13px] text-text-muted" title="드래그해서 순서 변경">
                  ⠿
                </span>
                <button type="button" onClick={() => move(i, -1)} disabled={i === 0} className="text-[11px] text-text-muted disabled:opacity-30">
                  ▲
                </button>
                <button type="button" onClick={() => move(i, 1)} disabled={i === banners.length - 1} className="text-[11px] text-text-muted disabled:opacity-30">
                  ▼
                </button>
              </div>
              <ProductPhoto photo={b.imageUrl} className="h-12 w-16 shrink-0 overflow-hidden rounded-md bg-accent-soft" />
              <div className="min-w-0 flex-1">
                <p className="truncate text-[13px] font-semibold">
                  {BANNER_LINK_LABEL[b.linkType]}
                  {b.linkType === "PRODUCT" && catalog && ` · ${catalog.find((c) => c.id === b.linkId)?.name ?? "삭제된 상품"}`}
                  {b.linkType === "EVENT" && events && ` · ${events.find((e) => e.id === b.linkId)?.title ?? "삭제된 이벤트"}`}
                  {b.linkType === "URL" && b.linkUrl && ` · ${b.linkUrl}`}
                </p>
                <p className="truncate text-[11.5px] text-text-muted">
                  {isBannerLive(b) ? "노출 중" : b.active ? "노출 기간 아님" : "비활성"}
                  {(b.startsAt || b.endsAt) && ` · ${b.startsAt ? toLocalInputValue(b.startsAt).replace("T", " ") : "시작 제한 없음"} ~ ${b.endsAt ? toLocalInputValue(b.endsAt).replace("T", " ") : "종료 제한 없음"}`}
                </p>
              </div>
              <div className="flex shrink-0 gap-1.5">
                <button onClick={() => toggleActive(b)} className="rounded-[7px] border border-border px-2.5 py-1 text-[12px] font-semibold">
                  {b.active ? "비활성화" : "활성화"}
                </button>
                <button onClick={() => setEditingId(b.id)} className="rounded-[7px] border border-border px-2.5 py-1 text-[12px] font-semibold">
                  수정
                </button>
                <button onClick={() => onDelete(b)} className="rounded-[7px] border border-border px-2.5 py-1 text-[12px] font-semibold text-red-600">
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

function BannerForm({
  initial,
  catalog,
  events,
  onSubmit,
  onCancel,
  submitLabel,
}: {
  initial?: Banner;
  catalog: CatalogProduct[] | null;
  events: MarketEvent[] | null;
  onSubmit: (values: Omit<Banner, "id" | "sortOrder">) => Promise<void>;
  onCancel: () => void;
  submitLabel: string;
}) {
  const [imageUrl, setImageUrl] = useState(initial?.imageUrl ?? "");
  const [uploading, setUploading] = useState(false);
  const [linkType, setLinkType] = useState<BannerLinkType>(initial?.linkType ?? "NONE");
  // undefined = 사용자가 아직 SearchPicker를 직접 조작하지 않았다는 뜻 — catalog/events가
  // 늦게 로드돼도(비동기라 첫 렌더에는 보통 null) initial.linkId에 해당하는 항목을
  // 그때그때 계산해서 보여준다. 한 번이라도 직접 고르면(null 포함) 그 값을 그대로 쓴다.
  const [productOverride, setProductOverride] = useState<CatalogProduct | null | undefined>(undefined);
  const [eventOverride, setEventOverride] = useState<MarketEvent | null | undefined>(undefined);
  const selectedProduct =
    productOverride !== undefined ? productOverride : (catalog && initial?.linkType === "PRODUCT" && initial.linkId ? (catalog.find((c) => c.id === initial.linkId) ?? null) : null);
  const selectedEvent =
    eventOverride !== undefined ? eventOverride : (events && initial?.linkType === "EVENT" && initial.linkId ? (events.find((e) => e.id === initial.linkId) ?? null) : null);
  const [linkUrl, setLinkUrl] = useState(initial?.linkUrl ?? "");
  const [active, setActive] = useState(initial?.active ?? true);
  const [startsAt, setStartsAt] = useState(toLocalInputValue(initial?.startsAt ?? null));
  const [endsAt, setEndsAt] = useState(toLocalInputValue(initial?.endsAt ?? null));
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  async function handleFile(file: File | null) {
    if (!file) return;
    setUploading(true);
    try {
      setImageUrl(await uploadProductPhoto(file));
    } catch (e) {
      alert(e instanceof Error ? e.message : "사진 업로드에 실패했어요.");
    }
    setUploading(false);
  }

  async function submit() {
    if (!imageUrl) {
      setError("배너 이미지를 등록해 주세요.");
      return;
    }
    if (linkType === "PRODUCT" && !selectedProduct) {
      setError("연결할 상품을 선택해 주세요.");
      return;
    }
    if (linkType === "EVENT" && !selectedEvent) {
      setError("연결할 이벤트를 선택해 주세요.");
      return;
    }
    if (linkType === "URL" && !linkUrl.trim()) {
      setError("연결할 URL을 입력해 주세요.");
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      await onSubmit({
        imageUrl,
        linkType,
        linkId: linkType === "PRODUCT" ? (selectedProduct?.id ?? null) : linkType === "EVENT" ? (selectedEvent?.id ?? null) : null,
        linkUrl: linkType === "URL" ? linkUrl.trim() : null,
        active,
        startsAt: startsAt ? new Date(startsAt).toISOString() : null,
        endsAt: endsAt ? new Date(endsAt).toISOString() : null,
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : "저장 중 오류가 발생했어요.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="flex flex-col gap-2.5">
      {imageUrl ? (
        <div className="relative">
          <ProductPhoto photo={imageUrl} className="h-32 w-full overflow-hidden rounded-lg bg-bg-card" />
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            disabled={uploading}
            className="absolute right-2 bottom-2 rounded-[7px] bg-black/60 px-2.5 py-1 text-[11px] font-semibold text-white disabled:opacity-50"
          >
            {uploading ? "업로드 중" : "이미지 변경"}
          </button>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => fileInputRef.current?.click()}
          disabled={uploading}
          className="flex h-32 w-full flex-col items-center justify-center gap-1 rounded-lg border border-dashed border-border text-[12px] text-text-muted disabled:opacity-50"
        >
          {uploading ? "업로드 중..." : "+ 배너 이미지 업로드"}
        </button>
      )}
      <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={(e) => handleFile(e.target.files?.[0] ?? null)} />

      <p className="mt-1 text-[12px] font-bold text-text-muted">누르면 이동할 대상</p>
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
            {BANNER_LINK_LABEL[t]}
          </button>
        ))}
      </div>
      {linkType === "PRODUCT" && (
        <SearchPicker
          items={catalog}
          value={selectedProduct}
          onChange={setProductOverride}
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
          onChange={setEventOverride}
          getId={(e) => e.id}
          getLabel={(e) => e.title}
          placeholder="이벤트명 검색 (예: 7/30 문고리)"
          emptyText="일치하는 이벤트가 없어요."
        />
      )}
      {linkType === "URL" && (
        <input
          className="rounded-[9px] border border-border bg-bg-card px-3 py-2.5 text-[13px]"
          placeholder="https://..."
          value={linkUrl}
          onChange={(e) => setLinkUrl(e.target.value)}
        />
      )}

      <p className="mt-1 text-[12px] font-bold text-text-muted">노출 기간 (선택, 비워두면 제한 없음)</p>
      <div className="flex gap-2">
        <input type="datetime-local" className="flex-1 rounded-[9px] border border-border bg-bg-card px-3 py-2.5 text-[13px]" value={startsAt} onChange={(e) => setStartsAt(e.target.value)} />
        <input type="datetime-local" className="flex-1 rounded-[9px] border border-border bg-bg-card px-3 py-2.5 text-[13px]" value={endsAt} onChange={(e) => setEndsAt(e.target.value)} />
      </div>

      <label className="flex items-center gap-1.5 text-[12.5px] font-semibold text-text-muted">
        <input type="checkbox" checked={active} onChange={(e) => setActive(e.target.checked)} />
        활성화 (꺼두면 홈에 노출되지 않아요)
      </label>

      {error && <p className="text-[12.5px] font-semibold text-red-600">{error}</p>}
      <div className="flex gap-2">
        <button onClick={submit} disabled={submitting || !imageUrl} className="rounded-[8px] bg-accent px-4 py-2 text-[13px] font-bold text-white disabled:opacity-50">
          {submitting ? "저장 중..." : submitLabel}
        </button>
        <button onClick={onCancel} className="rounded-[8px] border border-border px-4 py-2 text-[13px] font-semibold">
          취소
        </button>
      </div>
    </div>
  );
}
