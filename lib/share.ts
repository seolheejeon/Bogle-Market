// 공유 URL 생성 — 나중에 추천인 시스템(?ref=xxx)을 붙이기 쉽도록 URL 조합
// 로직을 한 곳에 모아둔다. 서버(generateMetadata)와 클라이언트(공유 버튼)
// 양쪽에서 다 쓰인다: 클라이언트는 실제 접속 도메인(window.location.origin),
// 서버는 호출부가 요청 주소(host 헤더)를 넘겨주면 그걸 쓴다 — 사이트 이름을
// 바꾸거나 커스텀 도메인이 생겨도 코드 변경 없이 맞는 링크가 나간다.
// 둘 다 없을 때만 설정값/Netlify가 주는 사이트 주소(URL)/운영 주소 순으로 쓴다.
const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || process.env.URL || "https://bogle-market-prd.netlify.app";

export interface ShareUrlOptions {
  // 지금은 아무 데서도 안 넘기지만, 추천인 기능이 생기면 이 값만 채워서
  // 호출하면 된다(예: buildProductShareUrl(id, { ref: myReferralCode })).
  ref?: string;
}

export function getSiteUrl(requestOrigin?: string): string {
  if (typeof window !== "undefined") return window.location.origin;
  return requestOrigin ?? SITE_URL;
}

export function buildShareUrl(path: string, options: ShareUrlOptions = {}, requestOrigin?: string): string {
  const url = new URL(path, getSiteUrl(requestOrigin));
  if (options.ref) url.searchParams.set("ref", options.ref);
  return url.toString();
}

export function buildProductShareUrl(productId: string, options?: ShareUrlOptions, requestOrigin?: string): string {
  return buildShareUrl(`/product/${productId}`, options, requestOrigin);
}
