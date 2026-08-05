"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { listCatalogProducts, createCatalogProduct, updateCatalogProduct, deleteCatalogProduct, listEvents, addEventProduct, removeEventProduct } from "@/lib/data";
import type { CatalogProduct, EventBadge, ExpiryLabel, FulfillmentType, MarketEvent, ProductDetailBlock, ProductOptionGroup, ShippingFeeType } from "@/types";
import { EVENT_TYPE_LABEL, COURIER_OPTIONS, FULFILLMENT_TYPE_LABEL, SHIPPING_FEE_TYPE_LABEL } from "@/types";

// 택배사 select에서 기본 목록(COURIER_OPTIONS)에 없는 값을 직접 입력할 때 쓰는
// select 값 — 실제 저장값(courierCode)에는 절대 안 들어가고, 이 값이 select에
// 뜨면 텍스트 인풋을 같이 보여주는 용도로만 쓴다.
const CUSTOM_COURIER = "__custom__";
import { ProductPhoto } from "@/components/ProductPhoto";
import { PhotoUploader } from "@/components/admin/PhotoUploader";
import { DetailBlockEditor } from "@/components/admin/DetailBlockEditor";
import { ProductOptionEditor } from "@/components/admin/ProductOptionEditor";
import { ProductBadgePicker } from "@/components/admin/ProductBadgePicker";
import { EventBadgeTag } from "@/components/Badge";
import { formatPrice, formatEventDateChip } from "@/lib/format";

// 상품은 하나만 존재하고 여러 이벤트가 재사용한다 — 여기서 고치는 사진/설명은
// 이 상품을 쓰는 모든 이벤트에 바로 반영된다. 재고도 여기서 하나만 관리하고
// 이 상품을 쓰는 모든 이벤트가 그대로 공유한다(Epic 1 Phase 3) — 가격·노출만
// 이벤트마다 다를 수 있어서 각 이벤트 관리 화면(/admin/events/[id])에서 정한다.
export default function AdminProductsPage() {
  const searchParams = useSearchParams();
  const [products, setProducts] = useState<CatalogProduct[] | null>(null);
  const [query, setQuery] = useState("");
  // 운영 메인의 "품절 상품" 타일이 ?soldout=1로 들어온다 — 재고는 이벤트관리가
  // 아니라 여기(카탈로그)에서 관리되는 값이라, 여기서 걸러서 보여줘야
  // 실제로 뭐가 품절인지 알 수 있다.
  const [soldoutOnly, setSoldoutOnly] = useState(false);
  const [creating, setCreating] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  useEffect(() => {
    if (searchParams.get("soldout") === "1") setSoldoutOnly(true);
  }, [searchParams]);

  function refresh() {
    listCatalogProducts().then(setProducts);
  }
  useEffect(refresh, []);

  const filtered = useMemo(() => {
    if (!products) return [];
    const q = query.trim().toLowerCase();
    let result = q === "" ? products : products.filter((p) => p.name.toLowerCase().includes(q));
    if (soldoutOnly) result = result.filter((p) => p.stock === 0);
    return result;
  }, [products, query, soldoutOnly]);

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
        여기서 고친 사진·설명·재고는 이 상품을 쓰는 모든 이벤트에 바로 반영돼요. 가격·노출만 이벤트별로 다를 수 있어서 각 이벤트 관리 화면에서 정해요.
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
        className="mb-2 w-full rounded-[9px] border border-border bg-bg-card px-3 py-2.5 text-[13px]"
        placeholder="상품명 검색"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
      />
      <button
        type="button"
        onClick={() => setSoldoutOnly((v) => !v)}
        className={`mb-3 rounded-full border px-3 py-1.5 text-[12px] font-semibold ${
          soldoutOnly ? "border-accent bg-accent-soft text-accent-dark" : "border-border text-text-muted"
        }`}
      >
        품절만 보기
      </button>

      {products === null && <p className="text-sm text-text-muted">불러오는 중...</p>}
      {products !== null && filtered.length === 0 && (
        <p className="text-sm text-text-muted">{soldoutOnly ? "품절된 상품이 없어요." : "상품이 없어요."}</p>
      )}
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
            <div key={p.id} className="flex flex-col gap-2 rounded-lg border border-border p-2.5">
              <div className="flex items-center gap-3">
                <ProductPhoto photo={p.photos?.[0] ?? p.emoji} className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md bg-accent-soft text-xl" />
                <div className="min-w-0 flex-1">
                  <p className="flex items-center gap-1.5 truncate text-[13px] font-semibold">
                    {p.name}
                    <EventBadgeTag badge={p.badge} />
                    {p.stock === 0 && <span className="shrink-0 rounded-md bg-red-100 px-1.5 py-0.5 text-[11px] font-bold text-red-600">품절</span>}
                  </p>
                  <p className="truncate text-[12px] text-text-muted">{[p.origin, p.weight, p.storage].filter(Boolean).join(" · ") || "추가 정보 없음"}</p>
                  <p className="truncate text-[11.5px] text-text-muted">
                    기준가 {formatPrice(p.basePrice ?? 0)}
                    {p.costPrice !== undefined && ` · 원가 ${formatPrice(p.costPrice)}`}
                    {" · "}
                    재고 {p.stock !== undefined ? `${p.stock}개` : "무제한"}
                    {(p.minQty ?? 1) > 1 && ` · 최소 ${p.minQty}개`}
                    {(p.shippingFee ?? 0) > 0 && ` · 배송비 ${formatPrice(p.shippingFee ?? 0)}`}
                  </p>
                </div>
                <div className="flex flex-wrap justify-end gap-1.5">
                  <button
                    onClick={() => setExpandedId((v) => (v === p.id ? null : p.id))}
                    className={`rounded-[7px] border px-2.5 py-1 text-[12px] font-semibold ${expandedId === p.id ? "border-accent bg-accent-soft text-accent-dark" : "border-border"}`}
                  >
                    연결된 이벤트
                  </button>
                  <button onClick={() => setEditingId(p.id)} className="rounded-[7px] border border-border px-2.5 py-1 text-[12px] font-semibold">
                    수정
                  </button>
                  <button onClick={() => onDelete(p)} className="rounded-[7px] border border-border px-2.5 py-1 text-[12px] font-semibold text-red-600">
                    삭제
                  </button>
                </div>
              </div>
              {expandedId === p.id && <ConnectedEventsPanel catalogProduct={p} />}
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
  const [stock, setStock] = useState(initial?.stock !== undefined ? String(initial.stock) : "");
  const [minQty, setMinQty] = useState(initial?.minQty !== undefined ? String(initial.minQty) : "1");
  const [badge, setBadge] = useState<EventBadge>(initial?.badge ?? "NONE");
  const [shippingFeeType, setShippingFeeType] = useState<ShippingFeeType>(initial?.shippingFeeType ?? "fixed");
  const [shippingFee, setShippingFee] = useState(initial?.shippingFee !== undefined ? String(initial.shippingFee) : "");
  const [freeShippingThreshold, setFreeShippingThreshold] = useState(
    initial?.freeShippingThreshold !== undefined ? String(initial.freeShippingThreshold) : "",
  );
  const [shippingFeeQtyUnit, setShippingFeeQtyUnit] = useState(initial?.shippingFeeQtyUnit !== undefined ? String(initial.shippingFeeQtyUnit) : "");
  const isKnownCourier = (code: string) => COURIER_OPTIONS.some((c) => c.code === code);
  const [courierSelect, setCourierSelect] = useState(() => {
    const code = initial?.courierCode ?? "";
    if (code === "") return "";
    return isKnownCourier(code) ? code : CUSTOM_COURIER;
  });
  const [customCourier, setCustomCourier] = useState(() => {
    const code = initial?.courierCode ?? "";
    return code !== "" && !isKnownCourier(code) ? code : "";
  });
  const [fulfillmentType, setFulfillmentType] = useState<FulfillmentType>(initial?.fulfillmentType ?? "same_day");
  const [shipsAt, setShipsAt] = useState(initial?.shipsAt ?? "");
  const [origin, setOrigin] = useState(initial?.origin ?? "");
  const [weight, setWeight] = useState(initial?.weight ?? "");
  const [storage, setStorage] = useState(initial?.storage ?? "");
  const [eat, setEat] = useState(initial?.eat ?? "");
  const [expiryLabel, setExpiryLabel] = useState<ExpiryLabel | "">(initial?.expiryLabel ?? "");
  const [expiryValue, setExpiryValue] = useState(initial?.expiryValue ?? "");
  const [description, setDescription] = useState(initial?.description ?? "");
  const [photos, setPhotos] = useState<string[]>(initial?.photos ?? []);
  const [detailBlocks, setDetailBlocks] = useState<ProductDetailBlock[]>(initial?.detailBlocks ?? []);
  const [optionGroups, setOptionGroups] = useState<ProductOptionGroup[]>(initial?.optionGroups ?? []);
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
        stock: stock.trim() === "" ? undefined : Math.max(0, Number(stock) || 0),
        minQty: minQty.trim() === "" ? 1 : Math.max(1, Number(minQty) || 1),
        badge,
        shippingFee: shippingFee.trim() === "" ? 0 : Math.max(0, Number(shippingFee) || 0),
        shippingFeeType,
        freeShippingThreshold: freeShippingThreshold.trim() === "" ? 0 : Math.max(0, Number(freeShippingThreshold) || 0),
        shippingFeeQtyUnit: shippingFeeType === "per_quantity" && shippingFeeQtyUnit.trim() !== "" ? Math.max(1, Number(shippingFeeQtyUnit) || 1) : undefined,
        courierCode: courierSelect === CUSTOM_COURIER ? customCourier.trim() || undefined : courierSelect || undefined,
        fulfillmentType,
        shipsAt: fulfillmentType === "scheduled" && shipsAt ? shipsAt : undefined,
        origin: origin || undefined,
        weight: weight || undefined,
        storage: storage || undefined,
        eat: eat || undefined,
        // 라벨/값 둘 다 채워졌을 때만 저장한다 — 하나만 있으면 고객 화면에
        // 보여줄 방법이 없어서(라벨만 있고 값이 없거나 그 반대) 의미가 없다.
        expiryLabel: expiryLabel && expiryValue.trim() ? expiryLabel : undefined,
        expiryValue: expiryLabel && expiryValue.trim() ? expiryValue.trim() : undefined,
        description: description || undefined,
        photos,
        detailBlocks,
        // 이름을 안 채운 그룹/값은 저장하지 않는다(에디터에서 빈 값으로 남겨둔 것).
        optionGroups: optionGroups.filter((g) => g.name.trim()).map((g) => ({ ...g, values: g.values.filter((v) => v.name.trim()) })),
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
    <div className="flex flex-col gap-3">
      <section className="rounded-[9px] border border-border p-3">
        <p className="mb-2 text-[12px] font-bold text-text-muted">기본 정보</p>
        <div className="flex flex-col gap-2.5">
          <PhotoUploader photos={photos} onChange={setPhotos} />
          <div className="flex flex-wrap gap-2">
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
            <select
              className="w-24 rounded-[7px] border border-border bg-bg-card px-2 py-1.5 text-[13px]"
              value={expiryLabel}
              onChange={(e) => setExpiryLabel(e.target.value as ExpiryLabel | "")}
            >
              <option value="">기한 안 씀</option>
              <option value="유통기한">유통기한</option>
              <option value="소비기한">소비기한</option>
            </select>
            <input
              className="w-28 rounded-[7px] border border-border bg-bg-card px-2 py-1.5 text-[13px] disabled:opacity-40"
              placeholder="예: 제조일로부터 7일"
              value={expiryValue}
              disabled={!expiryLabel}
              onChange={(e) => setExpiryValue(e.target.value)}
            />
          </div>
          <div>
            <p className="mb-1.5 text-[12px] font-bold text-text-muted">뱃지 (홈/카테고리/상품상세 카드에 표시돼요)</p>
            <ProductBadgePicker value={badge} onChange={setBadge} />
          </div>
        </div>
      </section>

      <section className="rounded-[9px] border border-border p-3">
        <p className="mb-2 text-[12px] font-bold text-text-muted">판매 정보</p>
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
          <label className="min-w-[110px] flex-1 text-[11.5px] font-semibold text-text-muted">
            재고 <span className="font-normal">(비우면 무제한)</span>
            <input
              className="mt-1 w-full rounded-[7px] border border-border bg-bg-card px-2 py-1.5 text-[13px]"
              placeholder="비우면 무제한"
              type="number"
              min={0}
              value={stock}
              onChange={(e) => setStock(e.target.value)}
            />
          </label>
          <label className="min-w-[110px] flex-1 text-[11.5px] font-semibold text-text-muted">
            최소 구매 수량
            <input
              className="mt-1 w-full rounded-[7px] border border-border bg-bg-card px-2 py-1.5 text-[13px]"
              placeholder="1"
              type="number"
              min={1}
              value={minQty}
              onChange={(e) => setMinQty(e.target.value)}
            />
          </label>
        </div>
        <p className="mt-1.5 text-[11px] text-text-muted">
          새 이벤트에 이 상품을 추가하면 기준 판매가·원가가 기본값으로 채워지고, 그 회차에서만 다르게(2+1 묶음 등) 바꿀 수 있어요. 재고는 이 상품을 쓰는 모든 이벤트가 실시간으로 함께 봐요 — 한 회차에서 주문이 들어가면 다른 회차 재고도 즉시 줄어들어요. 최소 구매 수량은 상품 상세/빠른 담기가 항상 이 수량으로 시작하고, 이 밑으로는 수량을 줄일 수 없어요.
        </p>
        <div className="mt-3">
          <p className="mb-1.5 text-[12px] font-bold text-text-muted">옵션 (색상/사이즈/중량/추가옵션 등)</p>
          <ProductOptionEditor
            groups={optionGroups}
            onChange={setOptionGroups}
            basePrice={basePrice.trim() === "" ? 0 : Number(basePrice) || 0}
            baseCost={costPrice.trim() === "" ? 0 : Number(costPrice) || 0}
          />
          <p className="mt-1.5 text-[11px] text-text-muted">
            가격조정은 이 값을 고르면 기준 판매가에, 공급가조정은 위 기준 원가에 각각 더해지는 금액이에요(음수도 가능). 옵션마다 판매가뿐
            아니라 실제 공급가도 다르면(예: 110g 8,000원/390g 24,000원) 기준 원가를 0으로 두고 공급가조정에 각 옵션의 실제 공급가를
            그대로 입력하면 돼요.
          </p>
        </div>
      </section>

      <section className="rounded-[9px] border border-border p-3">
        <p className="mb-2 text-[12px] font-bold text-text-muted">택배 정보 (택배로 팔 때만 적용돼요)</p>
        <div className="mb-2 flex flex-wrap gap-3">
          {(Object.keys(SHIPPING_FEE_TYPE_LABEL) as ShippingFeeType[]).map((t) => (
            <label key={t} className="flex items-center gap-1.5 text-[12.5px]">
              <input type="radio" name="shippingFeeType" checked={shippingFeeType === t} onChange={() => setShippingFeeType(t)} />
              {SHIPPING_FEE_TYPE_LABEL[t]}
            </label>
          ))}
        </div>
        <div className="flex flex-wrap gap-2">
          <label className="min-w-[110px] flex-1 text-[11.5px] font-semibold text-text-muted">
            배송비
            <input
              className="mt-1 w-full rounded-[7px] border border-border bg-bg-card px-2 py-1.5 text-[13px]"
              placeholder="0"
              type="number"
              min={0}
              value={shippingFee}
              onChange={(e) => setShippingFee(e.target.value)}
            />
          </label>
          {shippingFeeType === "free_threshold" && (
            <label className="min-w-[140px] flex-1 text-[11.5px] font-semibold text-text-muted">
              무료배송 기준금액 <span className="font-normal">(0이면 미사용)</span>
              <input
                className="mt-1 w-full rounded-[7px] border border-border bg-bg-card px-2 py-1.5 text-[13px]"
                placeholder="0"
                type="number"
                min={0}
                value={freeShippingThreshold}
                onChange={(e) => setFreeShippingThreshold(e.target.value)}
              />
            </label>
          )}
          {shippingFeeType === "per_quantity" && (
            <label className="min-w-[140px] flex-1 text-[11.5px] font-semibold text-text-muted">
              몇 개마다 부과 <span className="font-normal">(예: 5)</span>
              <input
                className="mt-1 w-full rounded-[7px] border border-border bg-bg-card px-2 py-1.5 text-[13px]"
                placeholder="5"
                type="number"
                min={1}
                value={shippingFeeQtyUnit}
                onChange={(e) => setShippingFeeQtyUnit(e.target.value)}
              />
            </label>
          )}
          <label className="min-w-[110px] flex-1 text-[11.5px] font-semibold text-text-muted">
            택배사
            <select
              className="mt-1 w-full rounded-[7px] border border-border bg-bg-card px-2 py-1.5 text-[13px]"
              value={courierSelect}
              onChange={(e) => setCourierSelect(e.target.value)}
            >
              <option value="">선택 안 함</option>
              {COURIER_OPTIONS.map((c) => (
                <option key={c.code} value={c.code}>
                  {c.label}
                </option>
              ))}
              <option value={CUSTOM_COURIER}>직접 입력</option>
            </select>
          </label>
          {courierSelect === CUSTOM_COURIER && (
            <label className="min-w-[110px] flex-1 text-[11.5px] font-semibold text-text-muted">
              택배사명 직접 입력
              <input
                className="mt-1 w-full rounded-[7px] border border-border bg-bg-card px-2 py-1.5 text-[13px]"
                placeholder="예: 대신택배"
                value={customCourier}
                onChange={(e) => setCustomCourier(e.target.value)}
              />
            </label>
          )}
        </div>
        {shippingFeeType === "per_quantity" && (
          <p className="mt-1.5 text-[11px] text-text-muted">
            {shippingFeeQtyUnit || "N"}개마다 배송비 1회 부과돼요 (예: {shippingFeeQtyUnit || "5"}개 단위, 배송비 {shippingFee || "0"}원이면 {Number(shippingFeeQtyUnit || 5) * 2}개 주문 시 배송비{" "}
            {Number(shippingFee || 0) * 2}원)
          </p>
        )}
        <p className="mt-2 mb-1.5 text-[11.5px] font-bold text-text-muted">출고 방식</p>
        <div className="flex flex-wrap gap-3">
          {(Object.keys(FULFILLMENT_TYPE_LABEL) as FulfillmentType[]).map((ft) => (
            <label key={ft} className="flex items-center gap-1.5 text-[12.5px]">
              <input type="radio" name="fulfillmentType" checked={fulfillmentType === ft} onChange={() => setFulfillmentType(ft)} />
              {FULFILLMENT_TYPE_LABEL[ft]}
            </label>
          ))}
        </div>
        {fulfillmentType === "scheduled" && (
          <input
            className="mt-2 w-full max-w-[180px] rounded-[7px] border border-border bg-bg-card px-2 py-1.5 text-[13px]"
            type="date"
            value={shipsAt}
            onChange={(e) => setShipsAt(e.target.value)}
          />
        )}
      </section>

      <section className="rounded-[9px] border border-border p-3">
        <p className="mb-1.5 text-[12px] font-bold text-text-muted">상세설명 (제목/본문/사진)</p>
        <DetailBlockEditor blocks={detailBlocks} onChange={setDetailBlocks} />
      </section>

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

// 이 카탈로그 상품이 걸려있는 이벤트 목록 — 연결 해제(리스팅 제거)와 다른
// 이벤트에 바로 추가하는 기능을 한 곳에서 처리한다. 재고가 상품 하나로
// 합쳐졌으니(Epic 1 Phase 3) "이 상품을 파는 회차가 어디어디인지"를 admin이
// 한눈에 볼 수 있어야 해서 추가한 패널.
function ConnectedEventsPanel({ catalogProduct }: { catalogProduct: CatalogProduct }) {
  const [events, setEvents] = useState<MarketEvent[] | null>(null);
  const [addingEventId, setAddingEventId] = useState("");
  const [addPrice, setAddPrice] = useState(catalogProduct.basePrice !== undefined ? String(catalogProduct.basePrice) : "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function refresh() {
    listEvents().then(setEvents);
  }
  useEffect(refresh, []);

  const linked = (events ?? [])
    .flatMap((e) => e.products.filter((p) => p.catalogProductId === catalogProduct.id).map((listing) => ({ event: e, listing })))
    .sort((a, b) => new Date(a.event.deliveryAt).getTime() - new Date(b.event.deliveryAt).getTime());
  const linkedEventIds = new Set(linked.map((l) => l.event.id));
  const addableEvents = (events ?? []).filter((e) => !linkedEventIds.has(e.id));

  async function unlink(listingId: string, eventTitle: string) {
    if (!confirm(`"${eventTitle}"에서 이 상품 연결을 해제할까요? (상품 자체는 삭제되지 않아요)`)) return;
    setBusy(true);
    try {
      await removeEventProduct(listingId);
      refresh();
    } catch (e) {
      alert(e instanceof Error ? e.message : "연결 해제 중 오류가 발생했어요.");
    } finally {
      setBusy(false);
    }
  }

  async function addToEvent() {
    const event = addableEvents.find((e) => e.id === addingEventId);
    if (!event || !addPrice) return;
    setBusy(true);
    setError(null);
    try {
      await addEventProduct(event.id, {
        catalogProductId: catalogProduct.id,
        price: Number(addPrice) || 0,
        costPrice: catalogProduct.costPrice,
        deliveryType: event.type,
        visible: true,
      });
      setAddingEventId("");
      refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "추가 중 오류가 발생했어요.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="rounded-[9px] border border-dashed border-border bg-bg-sunken p-2.5">
      {events === null && <p className="text-[12px] text-text-muted">불러오는 중...</p>}
      {events !== null && linked.length === 0 && <p className="text-[12px] text-text-muted">연결된 이벤트가 없어요.</p>}
      {linked.length > 0 && (
        <div className="flex flex-col gap-1.5">
          {linked.map(({ event, listing }) => (
            <div key={listing.id} className="flex items-center justify-between gap-2 rounded-[7px] bg-bg-card px-2.5 py-1.5">
              <span className="min-w-0 truncate text-[12.5px]">
                {event.title}{" "}
                <span className="text-text-muted">
                  · {EVENT_TYPE_LABEL[event.type]}
                  {event.type !== "PARCEL" && ` · ${formatEventDateChip(event.deliveryAt)}`} · {formatPrice(listing.price)}
                </span>
              </span>
              <button
                onClick={() => unlink(listing.id, event.title)}
                disabled={busy}
                className="shrink-0 rounded-[6px] border border-border px-2 py-0.5 text-[11.5px] font-semibold text-red-600 disabled:opacity-50"
              >
                연결 해제
              </button>
            </div>
          ))}
        </div>
      )}

      {events !== null && addableEvents.length > 0 && (
        <div className="mt-2.5 flex flex-wrap items-center gap-1.5 border-t border-border pt-2.5">
          <select
            className="min-w-[140px] flex-1 rounded-[7px] border border-border bg-bg-card px-2 py-1.5 text-[12.5px]"
            value={addingEventId}
            onChange={(e) => setAddingEventId(e.target.value)}
          >
            <option value="">이벤트에 바로 추가...</option>
            {addableEvents.map((e) => (
              <option key={e.id} value={e.id}>
                {e.title}
                {e.type !== "PARCEL" && ` (${formatEventDateChip(e.deliveryAt)})`}
              </option>
            ))}
          </select>
          {addingEventId && (
            <>
              <input
                className="w-20 rounded-[7px] border border-border bg-bg-card px-2 py-1.5 text-[12.5px]"
                placeholder="가격"
                type="number"
                min={0}
                value={addPrice}
                onChange={(e) => setAddPrice(e.target.value)}
              />
              <button
                onClick={addToEvent}
                disabled={busy || !addPrice}
                className="rounded-[7px] bg-accent px-3 py-1.5 text-[12px] font-bold text-white disabled:opacity-50"
              >
                추가
              </button>
            </>
          )}
        </div>
      )}
      {error && <p className="mt-1.5 text-[11.5px] font-semibold text-red-600">{error}</p>}
    </div>
  );
}
