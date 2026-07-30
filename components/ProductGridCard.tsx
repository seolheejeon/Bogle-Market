import Link from "next/link";
import type { Product } from "@/types";
import { formatPrice } from "@/lib/format";
import { QtyControl } from "@/components/QtyControl";
import { ProductPhoto } from "@/components/ProductPhoto";

export function ProductGridCard({ product, rankBadge }: { product: Product; rankBadge?: string }) {
  return (
    <Link href={`/product/${product.id}`} className="block">
      <div className="relative">
        <ProductPhoto
          photo={product.photos?.[0] ?? product.emoji}
          className="flex aspect-square w-full items-center justify-center rounded-xl bg-accent-soft text-[58px] leading-none"
        />
        {rankBadge && (
          <span className="absolute top-1.5 left-1.5 rounded-md bg-accent px-1.5 py-0.5 text-[10px] font-extrabold text-white">{rankBadge}</span>
        )}
      </div>
      <p className="mt-1.5 mb-0.5 text-[13.5px] font-semibold">{product.name}</p>
      <div className="flex items-center justify-between">
        <span className="text-[13.5px] font-bold">{formatPrice(product.price)}</span>
        <QtyControl productId={product.id} max={product.stock} />
      </div>
    </Link>
  );
}
