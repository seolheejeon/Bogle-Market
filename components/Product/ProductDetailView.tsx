"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { findProductWithEvent } from "@/lib/data";
import type { MarketEvent, Product } from "@/types";
import { EVENT_TYPE_LABEL, COURIER_LABEL, FULFILLMENT_TYPE_LABEL } from "@/types";
import { formatPrice, formatDeadlineLabel, formatEventDateChip } from "@/lib/format";
import { isEventOrderable } from "@/lib/order-policy";
import { useCart } from "@/lib/cart-context";
import { ProductDetailContent } from "@/components/Product/ProductDetailContent";
import { DUMMY_DETAIL_BLOCKS } from "@/lib/dummy-detail-content";
import { ProductPhoto } from "@/components/ProductPhoto";
import { ShareButton } from "@/components/ShareButton";
import { EventTypeBadge, EventBadgeTag } from "@/components/Badge";
import { unitPrice, maxQtyForSelection, validateOptionSelection, stockTrackedGroupCount, optionSelectionLabel, comboKey } from "@/lib/product-options";
import type { ProductOptionGroup, ProductOptionValue } from "@/types";
import { flyToCart } from "@/lib/cart-feedback";

export function ProductDetailView({ productId }: { productId: string }) {
  const router = useRouter();
  const { getQty, changeQty, lines } = useCart();
  const [data, setData] = useState<{ product: Product; event: MarketEvent } | null | undefined>(undefined);
  const [photoIndex, setPhotoIndex] = useState(0);
  // How many to add next — independent of the actual cart until "담기" is pressed.
  const [qty, setQty] = useState(1);
  // 그룹id -> 선택된 옵션값id 목록(single-select 그룹은 항상 길이 0/1).
  const [selected, setSelected] = useState<Record<string, string[]>>({});
  // 옵션이 있는 상품은 "옵션 담기"를 누를 때마다 조합을 하나씩 이 목록에
  // 쌓아두고(의류 쇼핑몰 UX), 마지막에 "총 N개 담기"로 한 번에 장바구니에
  // 반영한다 — 서로 다른 조합을 한 번의 담기로 여러 개 고를 수 있게 하기 위함.
  const [pendingLines, setPendingLines] = useState<{ optionValueIds: string[]; qty: number }[]>([]);
  const [optionError, setOptionError] = useState<string | null>(null);
  const [toastVisible, setToastVisible] = useState(false);
  const toastTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);
  const addButtonRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    findProductWithEvent(productId).then(setData);
    setSelected({});
    setOptionError(null);
    setQty(1);
    setPendingLines([]);
  }, [productId]);

  // data가 로드되기 전엔 최소 구매 수량을 몰라 일단 1로 뒀다가, 로드되면
  // 그 상품의 최소 구매 수량으로 다시 맞춘다("처음 진입 시 최소 구매 수량으로 시작").
  useEffect(() => {
    if (data) setQty(data.product.minQty ?? 1);
  }, [data]);

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
  // 옵션이 있는 상품은 조합을 여러 개 골라 쌓은 뒤 한 번에 담는 목록형 UX를
  // 쓰고(hasOptions), 없는 상품은 예전처럼 수량 스텝퍼 + 바로 담기를 그대로 쓴다.
  const hasOptions = (product.optionGroups ?? []).length > 0;

  // 이 조합(재고관리 대상 값 기준)이 실제 장바구니 + 다른 대기 목록 줄에서
  // 이미 얼마나 쓰이고 있는지 — excludeIndex는 "그 줄 자신은 빼고" 계산할 때
  // 쓴다(그 줄이 가질 수 있는 최대 수량을 구할 때).
  function stockUsedElsewhere(optionValueIds: string[], excludeIndex?: number): number {
    const key = comboKey(product, optionValueIds);
    if (key === "") return 0;
    let used = 0;
    for (const l of lines) {
      if (l.productId === product.id && comboKey(product, l.optionValueIds) === key) used += l.qty;
    }
    pendingLines.forEach((p, i) => {
      if (i === excludeIndex) return;
      if (comboKey(product, p.optionValueIds) === key) used += p.qty;
    });
    return used;
  }

  function remainingForIds(optionValueIds: string[], excludeIndex?: number): number | undefined {
    const max = maxQtyForSelection(product, optionValueIds);
    if (max === undefined) return undefined;
    return Math.max(0, max - stockUsedElsewhere(optionValueIds, excludeIndex));
  }

  const currentRemaining = remainingForIds(selectedOptionValueIds);
  const noMoreToAdd = !selectionIncomplete && !comboSoldOut && currentRemaining !== undefined && currentRemaining <= 0;

  const totalPendingQty = pendingLines.reduce((sum, l) => sum + l.qty, 0);
  const totalPendingPrice = pendingLines.reduce((sum, l) => sum + unitPrice(product, l.optionValueIds) * l.qty, 0);
  // 최소 구매 수량은 담은 조합 전체의 합계로 따진다(1번 옵션 1개 + 2번 옵션
  // 2개처럼 섞어도 합계가 최소 구매 수량 이상이면 충분) — 조합 하나하나가
  // 각각 최소 구매 수량을 넘길 필요는 없다.
  const pendingBelowMin = pendingLines.length > 0 && totalPendingQty < (product.minQty ?? 1);

  function selectOption(group: ProductOptionGroup, value: ProductOptionValue) {
    setOptionError(null);
    // 옵션 조합이 바뀌면 이전 조합 기준으로 고른 수량은 의미가 없어져서(재고
    // 한도도 조합마다 다름) 이 상품의 최소 구매 수량으로 되돌린다 — 일반적인
    // 쇼핑몰 UX(옵션 없는 상품 경로에서만 실제로 쓰이는 qty 상태).
    setQty(product.minQty ?? 1);
    setSelected((prev) => {
      const current = prev[group.id] ?? [];
      if (group.multi) {
        const next = current.includes(value.id) ? current.filter((id) => id !== value.id) : [...current, value.id];
        return { ...prev, [group.id]: next };
      }
      // 단일 선택 그룹도 이미 고른 값을 다시 누르면 선택이 취소돼야 한다 —
      // 예전엔 항상 그 값으로 다시 세팅만 해서(선택된 상태 그대로 유지),
      // "이 옵션 담기"를 누르기 전까지는 다시 눌러도 선택이 안 풀리는
      // 문제가 있었다.
      const next = current.includes(value.id) ? [] : [value.id];
      return { ...prev, [group.id]: next };
    });
  }

  // 지금 고른 옵션 조합을 대기 목록에 한 줄 추가한다(똑같은 조합이 이미
  // 있으면 수량만 1 더한다) — 그 다음 선택을 비워서 바로 다른 조합을 고를 수
  // 있게 한다("의류 쇼핑몰처럼 선택한 옵션들이 목록으로 쌓이는" UX). 최소
  // 구매 수량은 이 조합 하나가 아니라 이 상품에 담은 모든 조합의 합계로
  // 따지므로(예: 1번 옵션 1개 + 2번 옵션 2개 = 최소구매수량 3개 충족), 새
  // 줄은 항상 1개로 시작한다 — 합계 검증은 "총 N개 담기" 버튼에서 한다.
  function addSelectionToList() {
    const error = validateOptionSelection(product, selectedOptionValueIds);
    if (error) {
      setOptionError(error);
      return;
    }
    if (currentRemaining !== undefined && currentRemaining <= 0) {
      setOptionError("이 옵션 조합은 더 담을 수 있는 재고가 없어요.");
      return;
    }
    setOptionError(null);
    const key = [...selectedOptionValueIds].sort().join(",");
    setPendingLines((prev) => {
      const idx = prev.findIndex((p) => [...p.optionValueIds].sort().join(",") === key);
      if (idx >= 0) {
        const next = [...prev];
        next[idx] = { ...next[idx], qty: next[idx].qty + 1 };
        return next;
      }
      return [...prev, { optionValueIds: selectedOptionValueIds, qty: 1 }];
    });
    setSelected({});
  }

  function adjustPendingQty(index: number, delta: number) {
    setPendingLines((prev) => {
      const line = prev[index];
      const newQty = line.qty + delta;
      // 조합 하나의 수량은 1개까지만 줄일 수 있다(0으로 완전히 빼려면
      // removePendingLine/삭제 버튼을 써야 한다) — 최소 구매 수량은 이
      // 줄 하나가 아니라 담은 조합 전체 합계로 따지기 때문에 줄마다 최소
      // 구매 수량을 강제하지 않는다.
      if (newQty < 1) return prev;
      const cap = remainingForIds(line.optionValueIds, index);
      if (cap !== undefined && newQty > cap) return prev;
      return prev.map((p, i) => (i === index ? { ...p, qty: newQty } : p));
    });
  }

  function removePendingLine(index: number) {
    setPendingLines((prev) => prev.filter((_, i) => i !== index));
  }

  // 옵션 없는 상품은 예전처럼 수량 스텝퍼로 고른 뒤 바로 장바구니에 담는다.
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

  // 옵션 있는 상품은 대기 목록에 쌓아둔 조합들을 한 번에 장바구니로 반영한다.
  function addPendingLinesToCart() {
    if (pendingLines.length === 0) return;
    for (const line of pendingLines) {
      changeQty(product.id, line.qty, line.optionValueIds);
    }
    if (addButtonRef.current) flyToCart(addButtonRef.current, photos[photoIndex]);
    setPendingLines([]);
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
        <ShareButton productId={product.id} name={product.name} price={product.price} />
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
          <span className="text-[12px] font-semibold text-text-muted">{event.title}</span>
        </button>
        {/* 택배는 상시 판매라 마감/배송예정일이 회차 개념이 아니라 등록 시각으로
            자동 채워진 값일 뿐이라 고객에게 노출하지 않는다(카테고리 날짜탭과 동일한 예외). */}
        {(product.deliveryType ?? event.type) !== "PARCEL" && (
          <p className="mt-1 text-[12px] text-text-muted">
            {formatDeadlineLabel(event.deadlineAt)} · 배송예정 {formatEventDateChip(event.deliveryAt)}
          </p>
        )}

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

        {hasOptions && !closed && !soldOut && (
          <div className="mb-4">
            {selectionIncomplete ? (
              <p className="mb-2 text-[12.5px] font-semibold text-text-muted">옵션을 모두 선택해 주세요.</p>
            ) : comboSoldOut ? (
              <p className="mb-2 text-[12.5px] font-semibold text-text-muted">선택하신 옵션 조합은 품절이에요.</p>
            ) : noMoreToAdd ? (
              <p className="mb-2 text-[12.5px] font-semibold text-text-muted">이 조합은 담을 수 있는 만큼 이미 담았어요.</p>
            ) : null}
            {optionError && <p className="mb-2 text-[12.5px] font-semibold text-red-600">{optionError}</p>}
            <button
              type="button"
              onClick={addSelectionToList}
              disabled={selectionIncomplete || comboSoldOut || noMoreToAdd}
              className="w-full rounded-[9px] border border-accent py-2.5 text-[13px] font-bold text-accent disabled:opacity-40"
            >
              + 이 옵션 담기
            </button>

            {pendingLines.length > 0 && (
              <div className="mt-3 flex flex-col gap-2 rounded-[10px] border border-border p-3">
                {pendingLines.map((line, i) => {
                  const cap = remainingForIds(line.optionValueIds, i);
                  return (
                    <div key={`${line.optionValueIds.join(",")}::${i}`} className="flex items-center gap-2">
                      <span className="min-w-0 flex-1 truncate text-[13px] font-semibold">
                        {optionSelectionLabel(product, line.optionValueIds)}
                      </span>
                      <button
                        type="button"
                        onClick={() => adjustPendingQty(i, -1)}
                        disabled={line.qty <= 1}
                        className="h-7 w-7 shrink-0 rounded-full border border-border text-[13px] text-text disabled:opacity-40"
                      >
                        −
                      </button>
                      <span className="w-5 shrink-0 text-center text-[13px] font-bold">{line.qty}</span>
                      <button
                        type="button"
                        onClick={() => adjustPendingQty(i, 1)}
                        disabled={cap !== undefined && line.qty >= cap}
                        className="h-7 w-7 shrink-0 rounded-full border border-border text-[13px] text-text disabled:opacity-40"
                      >
                        +
                      </button>
                      <button type="button" onClick={() => removePendingLine(i)} className="ml-1 shrink-0 text-[12px] font-semibold text-text-muted">
                        삭제
                      </button>
                    </div>
                  );
                })}
                <div className="mt-1 flex justify-between border-t border-border pt-2 text-[13px] font-bold">
                  <span>총 {totalPendingQty}개</span>
                  <span>{formatPrice(totalPendingPrice)}</span>
                </div>
              </div>
            )}
          </div>
        )}

        {(product.deliveryType ?? event.type) === "PARCEL" &&
          (product.courierCode || (product.shippingFee ?? 0) > 0 || product.fulfillmentType) && (
            <div className="mb-3 rounded-[10px] bg-bg-sunken p-3 text-[12.5px]">
              <p className="mb-1 font-bold text-text-muted">배송 안내</p>
              <div className="flex flex-col gap-0.5 text-text-muted">
                {product.courierCode && <span>{COURIER_LABEL[product.courierCode] ?? product.courierCode}</span>}
                <span>
                  {FULFILLMENT_TYPE_LABEL[product.fulfillmentType ?? "same_day"]}
                  {product.fulfillmentType === "scheduled" && product.shipsAt && ` (${product.shipsAt})`}
                </span>
                <span>
                  {(product.shippingFee ?? 0) > 0 ? `배송비 ${formatPrice(product.shippingFee ?? 0)}` : "배송비 무료"}
                  {product.shippingFeeType === "free_threshold" &&
                    (product.freeShippingThreshold ?? 0) > 0 &&
                    ` · ${formatPrice(product.freeShippingThreshold ?? 0)} 이상 무료배송`}
                  {product.shippingFeeType === "per_quantity" && (product.shippingFeeQtyUnit ?? 0) > 0 && ` (${product.shippingFeeQtyUnit}개마다 부과)`}
                </span>
              </div>
            </div>
          )}

        <div className="overflow-hidden rounded-[10px] border border-border">
          {[
            ["원산지", product.origin],
            ["중량", product.weight],
            ["최소주문수량", (product.minQty ?? 1) > 1 ? `${product.minQty}개부터 주문 가능` : undefined],
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
            <>
              <p className="mb-2.5 text-center text-[13px] font-semibold text-text-muted">마감된 이벤트라 더 이상 주문할 수 없어요.</p>
              <button className="w-full rounded-[10px] bg-accent py-3 text-[13.5px] font-bold text-white disabled:opacity-40" disabled>
                마감
              </button>
            </>
          ) : soldOut ? (
            <>
              <p className="mb-2.5 text-center text-[13px] font-semibold text-text-muted">품절된 상품이에요.</p>
              <button className="w-full rounded-[10px] bg-accent py-3 text-[13.5px] font-bold text-white disabled:opacity-40" disabled>
                품절
              </button>
            </>
          ) : hasOptions ? (
            <>
              {pendingLines.length > 0 && (
                <div className="mb-2.5 flex items-center justify-between text-[13px]">
                  <span className="font-semibold text-text-muted">담을 상품 {totalPendingQty}개</span>
                  <span className="font-bold">{formatPrice(totalPendingPrice)}</span>
                </div>
              )}
              {pendingBelowMin && (
                <p className="mb-2.5 text-center text-[12.5px] font-semibold text-red-600">
                  옵션을 합쳐서 최소 {product.minQty}개 이상 담아야 해요. (현재 {totalPendingQty}개)
                </p>
              )}
              <button
                ref={addButtonRef}
                className="w-full rounded-[10px] bg-accent py-3 text-[13.5px] font-bold text-white disabled:opacity-40"
                disabled={pendingLines.length === 0 || pendingBelowMin}
                onClick={addPendingLinesToCart}
              >
                {pendingLines.length === 0 ? "옵션을 담아주세요" : `총 ${totalPendingQty}개 담기`}
              </button>
            </>
          ) : (
            <>
              <div className="mb-2.5 flex items-center justify-center gap-4">
                <button
                  className="h-[30px] w-[30px] rounded-full border border-border bg-bg-card text-[15px] text-text disabled:opacity-40"
                  disabled={qty <= (product.minQty ?? 1)}
                  onClick={() => setQty((q) => Math.max(product.minQty ?? 1, q - 1))}
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
              {optionError && <p className="mb-2.5 text-center text-[12.5px] font-semibold text-red-600">{optionError}</p>}
              <button
                ref={addButtonRef}
                className="w-full rounded-[10px] bg-accent py-3 text-[13.5px] font-bold text-white disabled:opacity-40"
                disabled={soldOut || closed}
                onClick={addToCart}
              >
                장바구니 담기
              </button>
            </>
          )}
        </div>
      </div>
      <div className="h-[150px]" />
    </div>
  );
}
