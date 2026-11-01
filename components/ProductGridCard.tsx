import Link from "next/link";
import type { Product } from "@/types";
import { QtyControl } from "@/components/QtyControl";
import { ProductPhoto } from "@/components/ProductPhoto";
import { EventBadgeTag } from "@/components/Badge";
import { hasRequiredOptions, productQtyCap, priceLabel } from "@/lib/product-options";
import { isListingBeforeOpen, isListingClosed } from "@/lib/order-policy";
import { formatOpenCountdown, formatOpenLabel } from "@/lib/format";
import { useRerenderAt } from "@/lib/use-rerender-at";
import { Countdown } from "@/components/Countdown";
import { WishlistButton } from "@/components/WishlistButton";

// 색상/사이즈처럼 반드시 골라야 하는 옵션이 있는 상품은 그리드에서 바로
// 수량을 못 담는다(어떤 옵션 조합인지 알 수 없어서) — 대신 상품 상세로
// 보내는 뱃지를 보여준다. 그 안에 QtyControl이 nested <a>가 되지 않도록
// 사진/이름/옵션뱃지를 각각 별도 Link로 감싼다(EventDetailView와 같은 패턴).
// closed는 이 상품이 속한 이벤트가 마감(종료 포함)돼서 더 이상 주문할 수
// 없다는 뜻 — 호출부가 !isEventOrderable(event)로 계산해 넘겨준다. 이벤트는
// 그대로 진행 중이어도 이 상품 하나만 관리자가 따로 마감시켰거나(수동
// product.closed) 예약 마감시간(orderDeadlineAt)이 지났을 수 있어서
// (isListingOrderable) 셋 중 하나라도 참이면 마감 취급한다.
export function ProductGridCard({ product, rankBadge, closed }: { product: Product; rankBadge?: string; closed?: boolean }) {
  // 예약 오픈 시각이 되면 새로고침 없이 바로 "담기"로 바뀌게 다시 그린다.
  useRerenderAt([product.orderOpenAt]);
  const isClosed = closed || isListingClosed(product);
  // 예약 오픈 전 — 마감처럼 흐리게 하지 않고 "오픈 예정"으로 보여준다.
  const beforeOpen = !isClosed && isListingBeforeOpen(product);
  const optionsRequired = hasRequiredOptions(product);
  return (
    <div>
      <div className="relative">
        <Link href={`/product/${product.id}`} className="block">
          {/* 마감된 상품은 사진을 흐리게 + 가운데 "주문 마감" 도장 — 작은 글자만으론
              손님이 잘 못 알아봐서 사진 자체로 한눈에 보이게 한다. */}
          <div className={isClosed ? "opacity-45 grayscale" : beforeOpen ? "opacity-50" : ""}>
            <ProductPhoto
              photo={product.photos?.[0] ?? product.emoji}
              className="flex aspect-square w-full items-center justify-center rounded-xl bg-accent-soft text-[58px] leading-none"
            />
          </div>
          {isClosed && (
            <span className="absolute inset-0 flex items-center justify-center">
              <span className="rounded-full bg-black/70 px-3.5 py-1.5 text-[13px] font-extrabold text-white">주문 마감</span>
            </span>
          )}
          {beforeOpen && product.orderOpenAt && (
            <span className="absolute inset-x-1.5 bottom-1.5 rounded-lg bg-black/70 px-2 py-1 text-center text-[11.5px] font-bold text-white">
              {formatOpenLabel(product.orderOpenAt)}
            </span>
          )}
          {rankBadge && (
            <span className="absolute top-1.5 left-1.5 rounded-md bg-accent px-2 py-1 text-[12px] font-extrabold text-white">{rankBadge}</span>
          )}
          {product.badge && product.badge !== "NONE" && (
            <span className="absolute top-1.5 right-1.5">
              <EventBadgeTag badge={product.badge} />
            </span>
          )}
        </Link>
        <WishlistButton
          productId={product.id}
          className="absolute right-1.5 bottom-1.5 flex h-7 w-7 items-center justify-center rounded-full bg-bg-card/90 text-[14px] shadow-sm"
        />
      </div>
      <Link href={`/product/${product.id}`} className={`mt-1.5 mb-0.5 block text-[13.5px] font-semibold ${isClosed ? "text-text-muted" : ""}`}>
        {product.name}
      </Link>
      <div className="flex items-center justify-between">
        <span className="text-[13.5px] font-bold">{priceLabel(product)}</span>
        {isClosed ? (
          <span className="shrink-0 rounded-full bg-bg-sunken px-2.5 py-1 text-[11px] font-bold text-text-muted">마감</span>
        ) : beforeOpen && product.orderOpenAt ? (
          <Countdown targetIso={product.orderOpenAt} format={formatOpenCountdown} className="shrink-0 rounded-full bg-accent-soft px-2 py-1 text-[10.5px] font-bold text-accent-dark" />
        ) : optionsRequired ? (
          <Link href={`/product/${product.id}`} className="shrink-0 rounded-full border border-accent px-2.5 py-1 text-[11px] font-bold text-accent">
            옵션선택
          </Link>
        ) : (
          <QtyControl productId={product.id} max={productQtyCap(product)} minQty={product.minQty} photo={product.photos?.[0] ?? product.emoji} />
        )}
      </div>
    </div>
  );
}
