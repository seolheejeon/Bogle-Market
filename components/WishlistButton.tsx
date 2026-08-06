"use client";

import { useEffect, useState } from "react";
import { useAuth } from "@/lib/auth-context";
import { getWishlistIds, toggleWishlistId, wishlistKey } from "@/lib/wishlist";

// lib/wishlist.ts는 진작에 만들어뒀지만(마이페이지 "찜한 상품" 구조), 이 버튼이
// 생기기 전까지는 실제로 채울 방법이 없었다 — 이 컴포넌트가 그 유일한
// 진입점이다. 그리드 카드(Link로 감싸여 있음)에도 쓰이므로 클릭 시 그 Link로
// 이동하지 않도록 막는다.
export function WishlistButton({ productId, className }: { productId: string; className?: string }) {
  const { profile, loading } = useAuth();
  const [liked, setLiked] = useState(false);

  useEffect(() => {
    if (loading) return;
    setLiked(getWishlistIds(wishlistKey(profile?.id)).includes(productId));
  }, [loading, profile, productId]);

  function toggle(e: React.MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    const next = toggleWishlistId(wishlistKey(profile?.id), productId);
    setLiked(next.includes(productId));
  }

  return (
    <button
      type="button"
      onClick={toggle}
      aria-label={liked ? "찜 해제" : "찜하기"}
      aria-pressed={liked}
      className={className ?? "p-1 text-[17px]"}
    >
      {liked ? "❤️" : "🤍"}
    </button>
  );
}
