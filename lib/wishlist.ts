// "찜한 상품" 저장소 — 지금은 어디에도 찜 버튼(하트 등)이 없어서 실제로
// 채워지진 않지만, 나중에 찜 버튼이 생기면 이 함수들만 호출하면 바로 이어질
// 수 있도록 구조를 미리 잡아둔다. 장바구니가 "로그인 계정 간에 공유되던"
// 버그를 겪은 뒤라(lib/cart-context.tsx 참고), 같은 실수를 반복하지 않도록
// 처음부터 신원별(비회원/계정)로 분리된 키를 쓴다.
const GUEST_KEY = "bogle_wishlist_guest";
function accountKey(profileId: string): string {
  return `bogle_wishlist_${profileId}`;
}

export function wishlistKey(profileId: string | null | undefined): string {
  return profileId ? accountKey(profileId) : GUEST_KEY;
}

function load(key: string): string[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(key);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function save(key: string, ids: string[]) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(key, JSON.stringify(ids));
  } catch {
    // 용량 초과 등 — 찜 목록은 없어도 그만이라 조용히 무시.
  }
}

export function getWishlistIds(key: string): string[] {
  return load(key);
}

export function isWishlisted(key: string, productId: string): boolean {
  return load(key).includes(productId);
}

// 찜 버튼이 생기면 이 함수 하나로 켜고 끌 수 있다 — 이미 있으면 빼고,
// 없으면 맨 앞에 추가.
export function toggleWishlistId(key: string, productId: string): string[] {
  const current = load(key);
  const next = current.includes(productId) ? current.filter((id) => id !== productId) : [productId, ...current];
  save(key, next);
  return next;
}
