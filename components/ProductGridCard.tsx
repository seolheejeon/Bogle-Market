import Link from "next/link";
import type { Product } from "@/types";
import { formatPrice } from "@/lib/format";
import { QtyControl } from "@/components/QtyControl";
import { ProductPhoto } from "@/components/ProductPhoto";
import { EventBadgeTag } from "@/components/Badge";
import { hasRequiredOptions } from "@/lib/product-options";

// 색상/사이즈처럼 반드시 골라야 하는 옵션이 있는 상품은 그리드에서 바로
// 수량을 못 담는다(어떤 옵션 조합인지 알 수 없어서) — 대신 상품 상세로
// 보내는 뱃지를 보여준다. 그 안에 QtyControl이 nested <a>가 되지 않도록
// 사진/이름/옵션뱃지를 각각 별도 Link로 감싼다(EventDetailView와 같은 패턴).
// closed는 이 상품이 속한 이벤트가 마감(종료 포함)돼서 더 이상 주문할 수
// 없다는 뜻 — 호출부가 !isEventOrderable(event)로 계산해 넘겨준다. 이벤트는
// 그대로 진행 중이어도 이 상품 하나만 관리자가 따로 마감시켰을 수 있어서
// (product.closed, 예약상품 발주마감 등) 둘 중 하나라도 참이면 마감 취급한다.
export function ProductGridCard({ product, rankBadge, closed }: { product: Product; rankBadge?: string; closed?: boolean }) {
  const isClosed = closed || product.closed === true;
  const optionsRequired = hasRequiredOptions(product);
  return (
    <div>
      <Link href={`/product/${product.id}`} className="relative block">
        <ProductPhoto
          photo={product.photos?.[0] ?? product.emoji}
          className="flex aspect-square w-full items-center justify-center rounded-xl bg-accent-soft text-[58px] leading-none"
        />
        {rankBadge && (
          <span className="absolute top-1.5 left-1.5 rounded-md bg-accent px-2 py-1 text-[12px] font-extrabold text-white">{rankBadge}</span>
        )}
        {product.badge && product.badge !== "NONE" && (
          <span className="absolute top-1.5 right-1.5">
            <EventBadgeTag badge={product.badge} />
          </span>
        )}
      </Link>
      <Link href={`/product/${product.id}`} className="mt-1.5 mb-0.5 block text-[13.5px] font-semibold">
        {product.name}
      </Link>
      <div className="flex items-center justify-between">
        <span className="text-[13.5px] font-bold">{formatPrice(product.price)}</span>
        {isClosed ? (
          <span className="shrink-0 rounded-full bg-bg-sunken px-2.5 py-1 text-[11px] font-bold text-text-muted">마감</span>
        ) : optionsRequired ? (
          <Link href={`/product/${product.id}`} className="shrink-0 rounded-full border border-accent px-2.5 py-1 text-[11px] font-bold text-accent">
            옵션선택
          </Link>
        ) : (
          <QtyControl productId={product.id} max={product.stock} minQty={product.minQty} photo={product.photos?.[0] ?? product.emoji} />
        )}
      </div>
    </div>
  );
}
