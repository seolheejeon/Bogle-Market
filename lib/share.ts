// 공유 URL 생성 — 나중에 추천인 시스템(?ref=xxx)을 붙이기 쉽도록 URL 조합
// 로직을 한 곳에 모아둔다. 서버(generateMetadata)와 클라이언트(공유 버튼)
// 양쪽에서 다 쓰인다: 서버에는 window가 없어서 SITE_URL 상수로 절대경로를
// 만들고, 클라이언트에서는 실제 접속 도메인(window.location.origin)을
// 우선한다 — 프리뷰/커스텀 도메인이 생겨도 코드 변경 없이 맞는 링크가 나감.
const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || "https://bogle-market.netlify.app";

export interface ShareUrlOptions {
  // 지금은 아무 데서도 안 넘기지만, 추천인 기능이 생기면 이 값만 채워서
  // 호출하면 된다(예: buildProductShareUrl(id, { ref: myReferralCode })).
  ref?: string;
}

export function getSiteUrl(): string {
  if (typeof window !== "undefined") return window.location.origin;
  return SITE_URL;
}

export function buildShareUrl(path: string, options: ShareUrlOptions = {}): string {
  const url = new URL(path, getSiteUrl());
  if (options.ref) url.searchParams.set("ref", options.ref);
  return url.toString();
}

export function buildProductShareUrl(productId: string, options?: ShareUrlOptions): string {
  return buildShareUrl(`/product/${productId}`, options);
}
