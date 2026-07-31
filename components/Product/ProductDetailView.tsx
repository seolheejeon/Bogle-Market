"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { findProductWithEvent } from "@/lib/data";
import type { MarketEvent, Product } from "@/types";
import { EVENT_TYPE_LABEL } from "@/types";
import { formatPrice, formatDeadlineLabel, formatEventDateChip } from "@/lib/format";
import { isEventOrderable } from "@/lib/order-policy";
import { useCart } from "@/lib/cart-context";
import { ProductDetailContent } from "@/components/Product/ProductDetailContent";
import { DUMMY_DETAIL_BLOCKS } from "@/lib/dummy-detail-content";
import { ProductPhoto, isPhotoUrl } from "@/components/ProductPhoto";
import { EventTypeBadge, EventBadgeTag } from "@/components/Badge";
import { unitPrice, maxQtyForSelection, validateOptionSelection, stockTrackedGroupCount } from "@/lib/product-options";
import type { ProductOptionGroup, ProductOptionValue } from "@/types";

// A small clone of the product photo flies from the "담기" button to the
// header's cart icon as lightweight visual confirmation that something was
// actually added (as opposed to just adjusting the on-page quantity).
function flyToCart(fromEl: HTMLElement, photo: string) {
  const target = document.getElementById("header-cart-link");
  if (!target) return;
  const fromRect = fromEl.getBoundingClientRect();
  const toRect = target.getBoundingClientRect();

  const el = document.createElement("div");
  Object.assign(el.style, {
    position: "fixed",
    left: `${fromRect.left + fromRect.width / 2 - 16}px`,
    top: `${fromRect.top + fromRect.height / 2 - 16}px`,
    width: "32px",
    height: "32px",
    borderRadius: "9999px",
    overflow: "hidden",
    zIndex: "9999",
    pointerEvents: "none",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    fontSize: "18px",
    background: "var(--accent-soft, #f7e4d3)",
    boxShadow: "0 2px 8px rgba(0,0,0,0.2)",
    transition: "transform 0.55s cubic-bezier(0.4, 0, 0.2, 1), opacity 0.55s ease",
  });

  if (isPhotoUrl(photo)) {
    const img = document.createElement("img");
    img.src = photo;
    Object.assign(img.style, { width: "100%", height: "100%", objectFit: "cover" });
    el.appendChild(img);
  } else {
    el.textContent = photo;
  }

  document.body.appendChild(el);

  const dx = toRect.left + toRect.width / 2 - (fromRect.left + fromRect.width / 2);
  const dy = toRect.top + toRect.height / 2 - (fromRect.top + fromRect.height / 2);

  requestAnimationFrame(() => {
    el.style.transform = `translate(${dx}px, ${dy}px) scale(0.15)`;
    el.style.opacity = "0.15";
  });

  const remove = () => el.remove();
  el.addEventListener("transitionend", remove, { once: true });
  setTimeout(remove, 700);
}

export function ProductDetailView({ productId }: { productId: string }) {
  const router = useRouter();
  const { getQty, changeQty } = useCart();
  const [data, setData] = useState<{ product: Product; event: MarketEvent } | null | undefined>(undefined);
  const [photoIndex, setPhotoIndex] = useState(0);
  // How many to add next — independent of the actual cart until "담기" is pressed.
  const [qty, setQty] = useState(1);
  // 그룹id -> 선택된 옵션값id 목록(single-select 그룹은 항상 길이 0/1).
  const [selected, setSelected] = useState<Record<string, string[]>>({});
  const [optionError, setOptionError] = useState<string | null>(null);
  const [toastVisible, setToastVisible] = useState(false);
  const toastTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);
  const addButtonRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    findProductWithEvent(productId).then(setData);
    setSelected({});
    setOptionError(null);
    setQty(1);
  }, [productId]);

  useEffect(() => () => {
    if (toastTimeout.current) clearTimeout(toastTimeout.current);
  }, []);

  if (data === undefined) return <p className="p-4 text-sm text-text-muted">불러오는 중...</p>;
  if (data === null) return <p className="p-4 text-sm text-text-muted">상품을 찾을 수 없어요.</p>;

  const { product, event } = data;

  // 카테고리 화면(문고리/사다드림/택배 탭 + 날짜)에서 들어온 경우, "←"를 누르면
  // 이벤트 상세가 아니라 방금 보던 그 화면(선택했던 탭/날짜/스크롤 위치까지)으로
  // 그대로 돌아간다 — router.back()은 진짜 브라우저 뒤로가기라 CategoryView가
  // URL에 저장해둔 선택 상태와 브라우저의 스크롤 복원을 그대로 활용한다. 직접
  // 링크로 들어와 뒤로 갈 곳이 없을 때만 이벤트 상세로 대체 이동한다.
  function goBack() {
    if (typeof window !== "undefined" && window.history.length > 1) {
      router.back();
    } else {
      router.push(`/event/${event.id}`);
    }
  }

  const photos = product.photos && product.photos.length > 0 ? product.photos : [product.emoji];
  const selectedOptionValueIds = Object.values(selected).flat();
  const unitPriceWithOptions = unitPrice(product, selectedOptionValueIds);
  // 이미 장바구니에 담은 수량까지 합쳐서 재고를 넘지 않게 한다(같은 옵션
  // 조합끼리만 — 다른 조합은 별개 재고 취급).
  const inCart = getQty(product.id, selectedOptionValueIds);
  const soldOut = product.stock === 0;
  const closed = !isEventOrderable(event);
  const maxQty = maxQtyForSelection(product, selectedOptionValueIds);
  const remaining = maxQty !== undefined ? Math.max(0, maxQty - inCart) : undefined;
  // 필수 옵션이 여러 개인 상품은 전부 고르기 전까지 수량 조절/담기 자체를
  // 막는다 — 예전엔 옵션을 안 고르고도 수량은 올릴 수 있었다가 "담기"를
  // 눌러야만 에러가 떴는데, 그보다 먼저 막는 게 더 명확하다.
  const selectionIncomplete = validateOptionSelection(product, selectedOptionValueIds) !== null;
  const comboSoldOut = !selectionIncomplete && maxQty !== undefined && maxQty <= 0;
  // 재고관리 그룹이 2개 이상이면 값 하나만으로는 품절 여부를 알 수 없다(조합
  // 전체를 봐야 함) — 이 경우 버튼별 품절 표시 대신 위 comboSoldOut으로만
  // 안내한다. 그룹이 1개(또는 0개)일 때만 예전처럼 버튼에 바로 표시한다.
  const showPerButtonStock = stockTrackedGroupCount(product) <= 1;

  function selectOption(group: ProductOptionGroup, value: ProductOptionValue) {
    setOptionError(null);
    // 옵션 조합이 바뀌면 이전 조합 기준으로 고른 수량은 의미가 없어져서(재고
    // 한도도 조합마다 다름) 항상 1개로 되돌린다 — 일반적인 쇼핑몰 UX.
    setQty(1);
    setSelected((prev) => {
      const current = prev[group.id] ?? [];
      if (group.multi) {
        const next = current.includes(value.id) ? current.filter((id) => id !== value.id) : [...current, value.id];
        return { ...prev, [group.id]: next };
      }
      return { ...prev, [group.id]: [value.id] };
    });
  }

  function addToCart() {
    const error = validateOptionSelection(product, selectedOptionValueIds);
    if (error) {
      setOptionError(error);
      return;
    }
    changeQty(product.id, qty, selectedOptionValueIds);
    if (addButtonRef.current) flyToCart(addButtonRef.current, photos[photoIndex]);
    setQty(1);
    setToastVisible(true);
    if (toastTimeout.current) clearTimeout(toastTimeout.current);
    toastTimeout.current = setTimeout(() => setToastVisible(false), 1800);
  }

  return (
    <div>
      <div className="sticky top-[71px] z-10 flex items-center gap-2 border-b border-border bg-bg-card px-4 py-2.5">
        <button onClick={goBack} className="shrink-0 p-1 text-xl text-text" aria-label="뒤로가기">
          ‹
        </button>
        <div className="min-w-0 flex-1">
          <p className="truncate text-[11px] font-semibold text-text-muted">
            {EVENT_TYPE_LABEL[product.deliveryType ?? event.type]} · {formatEventDateChip(event.deliveryAt)}
          </p>
          <p className="truncate text-[13.5px] leading-tight font-extrabold">{product.name}</p>
        </div>
      </div>
      <div className="p-4">
        <div className="relative flex aspect-square w-full items-center justify-center rounded-2xl bg-accent-soft text-[76px]">
          <ProductPhoto
            photo={photos[photoIndex]}
            fit="contain"
            className="flex h-full w-full items-center justify-center rounded-[inherit] text-[76px]"
          />
          {photos.length > 1 && (
            <span className="absolute right-2.5 bottom-2 rounded-full bg-black/50 px-2 py-0.5 text-[11px] font-semibold text-white">
              {photoIndex + 1}/{photos.length}
            </span>
          )}
        </div>
        {photos.length > 1 && (
          <div className="mt-2 flex justify-center gap-1.5">
            {photos.map((_, i) => (
              <button
                key={i}
                onClick={() => setPhotoIndex(i)}
                className={`h-1.5 rounded-full transition-all ${i === photoIndex ? "w-4 bg-accent" : "w-1.5 bg-[var(--badge-parcel-bg)]"}`}
              />
            ))}
          </div>
        )}

        <button onClick={() => router.push(`/event/${event.id}`)} className="mt-3.5 flex items-center gap-1.5">
          <EventTypeBadge type={product.deliveryType ?? event.type} />
          <EventBadgeTag badge={event.badge} />
          <span className="text-[12px] font-semibold text-text-muted">{event.title}</span>
        </button>
        <p className="mt-1 text-[12px] text-text-muted">
          {formatDeadlineLabel(event.deadlineAt)} · 배송예정 {formatEventDateChip(event.deliveryAt)}
        </p>

        <p className="mt-2 text-[17px] font-extrabold">{product.name}</p>
        <p className="my-1.5 text-xl font-extrabold">{formatPrice(unitPriceWithOptions)}</p>

        {(product.optionGroups ?? []).length > 0 && (
          <div className="mb-4 flex flex-col gap-3">
            {product.optionGroups!.map((g) => (
              <div key={g.id}>
                <p className="mb-1.5 text-[12.5px] font-bold text-text-muted">
                  {g.name}
                  {g.required && <span className="ml-0.5 text-red-500">*</span>}
                  {g.multi && <span className="ml-1.5 font-normal">(중복 선택 가능)</span>}
                </p>
                <div className="flex flex-wrap gap-1.5">
                  {g.values.map((v) => {
                    const isSelected = (selected[g.id] ?? []).includes(v.id);
                    const valueSoldOut = showPerButtonStock && v.hasStock && (v.stock ?? 0) <= 0;
                    return (
                      <button
                        key={v.id}
                        disabled={valueSoldOut}
                        onClick={() => selectOption(g, v)}
                        className={`rounded-full border px-3 py-1.5 text-[12.5px] font-semibold disabled:opacity-40 ${
                          isSelected ? "border-accent bg-accent-soft text-accent-dark" : "border-border text-text"
                        }`}
                      >
                        {v.name}
                        {v.priceDelta !== 0 && ` (${v.priceDelta > 0 ? "+" : ""}${formatPrice(v.priceDelta)})`}
                        {valueSoldOut && " · 품절"}
                      </button>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        )}

        <div className="overflow-hidden rounded-[10px] border border-border">
          {[
            ["원산지", product.origin],
            ["중량", product.weight],
            ["보관법", product.storage],
            ["조리법", product.eat],
          ]
            .filter(([, v]) => v)
            .map(([k, v]) => (
              <div key={k} className="flex border-b border-border px-3 py-2.5 text-[13px] last:border-none">
                <span className="w-[76px] shrink-0 text-text-muted">{k}</span>
                <span>{v}</span>
              </div>
            ))}
        </div>

        {product.description && <p className="mt-4 text-[13px] leading-relaxed whitespace-pre-line text-text-muted">{product.description}</p>}

        <ProductDetailContent blocks={product.detailBlocks ?? DUMMY_DETAIL_BLOCKS} />
      </div>

      {/* fixed, not sticky-in-flow: a sticky footer nested in <main> ends up
          "stuck" at the same viewport-bottom offset as BottomNav's own
          sticky bar, so BottomNav paints over it whenever the page is tall
          enough to scroll. Fixed + offset above BottomNav's height avoids
          that overlap regardless of page length. */}
      <div className="fixed inset-x-0 bottom-[67px] z-20 border-t border-border bg-bg-card">
        <div className="relative mx-auto max-w-2xl px-4 py-3.5">
          {toastVisible && (
            <div className="absolute bottom-full left-1/2 mb-2 -translate-x-1/2 rounded-full bg-black/80 px-4 py-2 text-[12.5px] font-semibold whitespace-nowrap text-white shadow-lg">
              장바구니에 담겼습니다
            </div>
          )}
          {closed ? (
            <p className="mb-2.5 text-center text-[13px] font-semibold text-text-muted">마감된 이벤트라 더 이상 주문할 수 없어요.</p>
          ) : soldOut ? (
            <p className="mb-2.5 text-center text-[13px] font-semibold text-text-muted">품절된 상품이에요.</p>
          ) : selectionIncomplete ? (
            <p className="mb-2.5 text-center text-[13px] font-semibold text-text-muted">옵션을 모두 선택해 주세요.</p>
          ) : comboSoldOut ? (
            <p className="mb-2.5 text-center text-[13px] font-semibold text-text-muted">선택하신 옵션 조합은 품절이에요.</p>
          ) : (
            <div className="mb-2.5 flex items-center justify-center gap-4">
              <button
                className="h-[30px] w-[30px] rounded-full border border-border bg-bg-card text-[15px] text-text disabled:opacity-40"
                disabled={qty <= 1}
                onClick={() => setQty((q) => Math.max(1, q - 1))}
              >
                −
              </button>
              <span className="w-5 text-center font-bold">{qty}</span>
              <button
                className="h-[30px] w-[30px] rounded-full border border-border bg-bg-card text-[15px] text-text disabled:opacity-40"
                disabled={remaining !== undefined && qty >= remaining}
                onClick={() => setQty((q) => q + 1)}
              >
                +
              </button>
              <span className="ml-auto text-[13px] font-bold text-text-muted">{formatPrice(qty * unitPriceWithOptions)}</span>
            </div>
          )}
          {optionError && <p className="mb-2.5 text-center text-[12.5px] font-semibold text-red-600">{optionError}</p>}
          <button
            ref={addButtonRef}
            className="w-full rounded-[10px] bg-accent py-3 text-[13.5px] font-bold text-white disabled:opacity-40"
            disabled={soldOut || closed || selectionIncomplete || comboSoldOut}
            onClick={addToCart}
          >
            {closed ? "마감" : soldOut || comboSoldOut ? "품절" : selectionIncomplete ? "옵션 선택" : "장바구니 담기"}
          </button>
        </div>
      </div>
      <div className="h-[150px]" />
    </div>
  );
}
