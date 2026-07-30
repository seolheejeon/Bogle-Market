import type { Banner, MarketEvent } from "@/types";

// 카탈로그 상품(products) id를 실제로 이동 가능한 리스팅(event_products) id로
// 바꾼다 — /product/:id는 리스팅 id를 기대하지, 카탈로그 id를 받지 않기 때문.
// 노출 중 + 품절 아님 + 마감 전을 우선순위로 "가장 적합한" 리스팅 하나를
// 고른다. 배너/알림 둘 다 상품을 카탈로그 id로 저장해두고 클릭·발송 시점에
// 이 함수로 그때그때 해석한다.
export function resolveListingId(catalogId: string, events: MarketEvent[]): string | null {
  const candidates = events.flatMap((e) => e.products.filter((p) => p.catalogProductId === catalogId).map((p) => ({ product: p, event: e })));
  if (candidates.length === 0) return null;
  const now = Date.now();
  function score(c: (typeof candidates)[number]) {
    let s = 0;
    if (c.product.visible !== false) s += 100;
    if (c.product.stock === undefined || c.product.stock > 0) s += 10;
    if (new Date(c.event.deadlineAt).getTime() > now) s += 1;
    return s;
  }
  return candidates.sort((a, b) => score(b) - score(a))[0].product.id;
}

// 배너를 눌렀을 때 이동할 경로. PRODUCT는 그 시점에 가장 적합한 리스팅으로
// 해석하고(해당 상품이 지금 걸린 이벤트가 하나도 없으면 null), EVENT/URL은
// 그대로, NONE은 이동할 곳이 없다.
export function resolveBannerHref(banner: Banner, events: MarketEvent[]): string | null {
  if (banner.linkType === "PRODUCT" && banner.linkId) {
    const listingId = resolveListingId(banner.linkId, events);
    return listingId ? `/product/${listingId}` : null;
  }
  if (banner.linkType === "EVENT" && banner.linkId) return `/event/${banner.linkId}`;
  if (banner.linkType === "URL" && banner.linkUrl) return banner.linkUrl;
  return null;
}
