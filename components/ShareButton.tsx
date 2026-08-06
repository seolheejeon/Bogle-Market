"use client";

import { useState } from "react";
import { buildProductShareUrl } from "@/lib/share";

// Web Share API 지원 브라우저(대부분의 모바일)는 네이티브 공유창을 띄우고,
// 미지원(대부분의 데스크톱 브라우저)은 링크를 클립보드에 복사한 뒤 토스트로
// 알려준다 — 완료 기준의 "미지원 브라우저 링크 복사" 요구사항.
// title만 넘기고 별도 text(상품명/가격 문구)는 안 넘긴다 — 카카오톡 등 일부
// 공유 대상이 text와 url을 이어붙여 보여줘서 긴 문구+URL이 그대로 노출되는
// 문제가 있었음. 링크 미리보기(썸네일/상품명/가격)는 OG 메타데이터
// (lib/og.ts)가 담당하므로 text로 중복 전달할 필요도 없다.
export function ShareButton({ productId, name }: { productId: string; name: string }) {
  const [toast, setToast] = useState<string | null>(null);

  function showToast(message: string) {
    setToast(message);
    setTimeout(() => setToast(null), 1800);
  }

  async function share() {
    const url = buildProductShareUrl(productId);

    if (typeof navigator !== "undefined" && navigator.share) {
      try {
        await navigator.share({ title: name, url });
      } catch {
        // 사용자가 공유 시트를 취소한 경우 등 — 에러로 취급하지 않는다.
      }
      return;
    }

    try {
      await navigator.clipboard.writeText(url);
      showToast("상품 링크가 복사되었습니다.");
    } catch {
      window.prompt("아래 링크를 복사해주세요", url);
    }
  }

  return (
    <div className="relative shrink-0">
      <button onClick={share} aria-label="상품 공유하기" className="p-1 text-[17px]">
        🔗
      </button>
      {toast && (
        <div className="absolute top-full right-0 z-20 mt-1.5 rounded-[8px] bg-text px-2.5 py-1.5 text-[11.5px] font-semibold whitespace-nowrap text-bg-card shadow-lg">
          {toast}
        </div>
      )}
    </div>
  );
}
