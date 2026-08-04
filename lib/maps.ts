// 관리자 주문/고객 상세에서 "지도에서 보기"용 검색 링크 — 앱 연동 없이 그냥
// 웹 검색 결과 링크라 별도 API 키가 필요 없다.
export function naverMapSearchUrl(query: string): string {
  return `https://map.naver.com/p/search/${encodeURIComponent(query)}`;
}

export function kakaoMapSearchUrl(query: string): string {
  return `https://map.kakao.com/link/search/${encodeURIComponent(query)}`;
}
