"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { findProductWithEvent } from "@/lib/data";
import type { MarketEvent, Product } from "@/types";
import { formatPrice } from "@/lib/format";
import { useCart } from "@/lib/cart-context";
import { ProductDetailContent } from "@/components/Product/ProductDetailContent";
import { DUMMY_DETAIL_BLOCKS } from "@/lib/dummy-detail-content";
import { ProductPhoto } from "@/components/ProductPhoto";

export function ProductDetailView({ productId }: { productId: string }) {
  const router = useRouter();
  const { cart, changeQty } = useCart();
  const [data, setData] = useState<{ product: Product; event: MarketEvent } | null | undefined>(undefined);
  const [photoIndex, setPhotoIndex] = useState(0);

  useEffect(() => {
    findProductWithEvent(productId).then(setData);
  }, [productId]);

  if (data === undefined) return <p className="p-4 text-sm text-text-muted">불러오는 중...</p>;
  if (data === null) return <p className="p-4 text-sm text-text-muted">상품을 찾을 수 없어요.</p>;

  const { product, event } = data;
  const photos = product.photos && product.photos.length > 0 ? product.photos : [product.emoji];
  const qty = cart[product.id] || 0;

  return (
    <div>
      <div className="flex items-center gap-2 border-b border-border px-4 py-3">
        <button onClick={() => router.push(`/event/${event.id}`)} className="p-1 text-xl text-text">
          ‹
        </button>
      </div>
      <div className="p-4">
        <div className="relative flex h-[220px] w-full items-center justify-center rounded-2xl bg-accent-soft text-[76px]">
          <ProductPhoto photo={photos[photoIndex]} className="flex h-full w-full items-center justify-center rounded-[inherit] text-[76px]" />
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
        <div className="mb-2.5 flex items-center justify-center gap-4">
          <button
            className="h-[30px] w-[30px] rounded-full border border-border bg-bg-card text-[15px] text-text"
            onClick={() => changeQty(product.id, -1)}
          >
            −
          </button>
          <span className="w-5 text-center font-bold">{qty}</span>
          <button
            className="h-[30px] w-[30px] rounded-full border border-border bg-bg-card text-[15px] text-text"
            onClick={() => changeQty(product.id, 1)}
          >
            +
          </button>
          <span className="ml-auto text-[13px] font-bold text-text-muted">{qty > 0 ? formatPrice(qty * product.price) : ""}</span>
        </div>
        <button
          className="w-full rounded-[10px] bg-accent py-3 text-[13.5px] font-bold text-white disabled:opacity-50"
          disabled={qty <= 0}
          onClick={() => router.push("/cart")}
        >
          장바구니 담기
        </button>
      </div>
    </div>
  );
}
