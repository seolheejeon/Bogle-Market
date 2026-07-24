"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { findProductWithEvent } from "@/lib/data";
import type { MarketEvent, Product } from "@/types";
import { formatPrice } from "@/lib/format";
import { useCart } from "@/lib/cart-context";
import { ProductDetailContent } from "@/components/Product/ProductDetailContent";
import { DUMMY_DETAIL_BLOCKS } from "@/lib/dummy-detail-content";
import { ProductPhoto, isPhotoUrl } from "@/components/ProductPhoto";

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
    background: "var(--accent-soft, #d7f3e3)",
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
  const { changeQty } = useCart();
  const [data, setData] = useState<{ product: Product; event: MarketEvent } | null | undefined>(undefined);
  const [photoIndex, setPhotoIndex] = useState(0);
  // How many to add next — independent of the actual cart until "담기" is pressed.
  const [qty, setQty] = useState(1);
  const [toastVisible, setToastVisible] = useState(false);
  const toastTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);
  const addButtonRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    findProductWithEvent(productId).then(setData);
  }, [productId]);

  useEffect(() => () => {
    if (toastTimeout.current) clearTimeout(toastTimeout.current);
  }, []);

  if (data === undefined) return <p className="p-4 text-sm text-text-muted">불러오는 중...</p>;
  if (data === null) return <p className="p-4 text-sm text-text-muted">상품을 찾을 수 없어요.</p>;

  const { product, event } = data;
  const photos = product.photos && product.photos.length > 0 ? product.photos : [product.emoji];

  function addToCart() {
    changeQty(product.id, qty);
    if (addButtonRef.current) flyToCart(addButtonRef.current, photos[photoIndex]);
    setQty(1);
    setToastVisible(true);
    if (toastTimeout.current) clearTimeout(toastTimeout.current);
    toastTimeout.current = setTimeout(() => setToastVisible(false), 1800);
  }

  return (
    <div>
      <div className="flex items-center gap-2 border-b border-border px-4 py-3">
        <button onClick={() => router.push(`/event/${event.id}`)} className="p-1 text-xl text-text">
          ‹
        </button>
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

        <p className="mt-3.5 text-[17px] font-extrabold">{product.name}</p>
        <p className="my-1.5 text-xl font-extrabold">{formatPrice(product.price)}</p>

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

      <div className="sticky bottom-0 mt-4 border-t border-border bg-bg-card px-4 py-3.5">
        {toastVisible && (
          <div className="absolute bottom-full left-1/2 mb-2 -translate-x-1/2 rounded-full bg-black/80 px-4 py-2 text-[12.5px] font-semibold whitespace-nowrap text-white shadow-lg">
            장바구니에 담겼습니다
          </div>
        )}
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
            className="h-[30px] w-[30px] rounded-full border border-border bg-bg-card text-[15px] text-text"
            onClick={() => setQty((q) => q + 1)}
          >
            +
          </button>
          <span className="ml-auto text-[13px] font-bold text-text-muted">{formatPrice(qty * product.price)}</span>
        </div>
        <button ref={addButtonRef} className="w-full rounded-[10px] bg-accent py-3 text-[13.5px] font-bold text-white" onClick={addToCart}>
          장바구니 담기
        </button>
      </div>
    </div>
  );
}
