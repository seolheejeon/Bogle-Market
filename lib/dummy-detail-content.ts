import type { ProductDetailBlock } from "@/types";

// Self-contained placeholder image (no network dependency) so the dummy
// content renders reliably everywhere. Swap for real admin-uploaded URLs
// later — the renderer just needs any valid <img> src.
function placeholderImage(label: string): string {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="750" height="500" viewBox="0 0 750 500">
    <rect width="750" height="500" fill="#ecfdf5" />
    <text x="50%" y="50%" dominant-baseline="middle" text-anchor="middle" font-family="sans-serif" font-size="30" fill="#047857">${label}</text>
  </svg>`;
  return `data:image/svg+xml,${encodeURIComponent(svg)}`;
}

// Placeholder "상세설명" content shown until admins can author real content
// per product. Swap the source in ProductDetailView once that exists —
// the renderer (components/Product/ProductDetailContent.tsx) doesn't change.
export const DUMMY_DETAIL_BLOCKS: ProductDetailBlock[] = [
  { type: "heading", text: "상품 소개" },
  {
    type: "text",
    text: "매일 아침 산지에서 상태를 확인하고, 주문이 들어온 만큼만 그날그날 준비해요.\n대량으로 미리 받아두지 않기 때문에 신선도가 오래갑니다.",
  },
  { type: "images", urls: [placeholderImage("상품 대표 이미지")], columns: 1 },
  { type: "heading", text: "이렇게 준비했어요" },
  {
    type: "text",
    text: "생산자님과 직접 소통하며 물건을 받아요.\n중간 유통 단계를 최대한 줄여서 신선함은 그대로, 가격은 합리적으로 맞췄습니다.",
  },
  { type: "images", urls: [placeholderImage("포장 전"), placeholderImage("포장 후")], columns: 2 },
  { type: "heading", text: "보관 및 섭취 방법" },
  {
    type: "text",
    text: "받으신 즉시 냉장/냉동 보관해주세요.\n소분해서 보관하시면 더 오래 신선하게 드실 수 있어요.\n조리 전 실온에 잠시 두었다가 조리하시면 좋아요.",
  },
  { type: "images", urls: [placeholderImage("보관 1"), placeholderImage("보관 2"), placeholderImage("보관 3")], columns: 3 },
  { type: "heading", text: "이런 분들께 추천해요" },
  {
    type: "text",
    text: "· 믿을 수 있는 산지 직송 먹거리를 찾으시는 분\n· 매번 장보기 번거로우신 분\n· 우리 동네 이웃과 함께 나눠 받고 싶으신 분",
  },
  { type: "images", urls: [placeholderImage("신선 배송")], columns: 1 },
  {
    type: "text",
    text: "궁금하신 점은 언제든 마이페이지 문의로 남겨주세요. 사장님이 직접 답변드려요 :)",
  },
];
