// 고객이 최근에 들어가 본 상품(리스팅) id를 기기 로컬에 남겨서 마이페이지
// "최근 본 상품"에 보여준다. 로그인 여부와 무관하게 이 기기에서 본 것 —
// 장바구니처럼 계정 전용 데이터가 아니라 순수 열람 이력이라 굳이 계정별로
// 나누지 않는다(다른 사람과 기기를 같이 쓰면 섞일 수 있지만, 구매 의도가
// 담긴 장바구니와 달리 열람 이력은 그 정도로 민감하지 않다고 판단).
const STORAGE_KEY = "bogle_recently_viewed";
const MAX_ITEMS = 20;

export interface RecentlyViewedEntry {
  productId: string;
  viewedAt: string; // ISO
}

function load(): RecentlyViewedEntry[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function save(entries: RecentlyViewedEntry[]) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(entries));
  } catch {
    // localStorage 용량 초과 등 — 열람 이력은 없어도 그만이라 조용히 무시.
  }
}

// 상품 상세를 열 때마다 호출 — 같은 상품을 다시 보면 맨 앞으로 끌어올리고
// (중복 없이), 최대 개수를 넘으면 오래된 것부터 잘라낸다.
export function recordRecentlyViewed(productId: string) {
  const entries = load().filter((e) => e.productId !== productId);
  entries.unshift({ productId, viewedAt: new Date().toISOString() });
  save(entries.slice(0, MAX_ITEMS));
}

export function getRecentlyViewedIds(): string[] {
  return load().map((e) => e.productId);
}
