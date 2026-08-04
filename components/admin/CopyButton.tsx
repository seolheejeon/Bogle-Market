"use client";

import { useState } from "react";
import { copyToClipboard } from "@/lib/clipboard";

// 주문/고객 상세에서 주소·전화번호·닉네임 옆에 붙이는 작은 복사 버튼 — 문고리
// 배송 다닐 때 주소를 지도 앱에 그대로 붙여넣는 용도로 가장 많이 쓴다.
export function CopyButton({ value, label = "복사" }: { value?: string | null; label?: string }) {
  const [copied, setCopied] = useState(false);

  if (!value) return null;

  async function handleClick(e: React.MouseEvent) {
    e.stopPropagation();
    const ok = await copyToClipboard(value!);
    if (ok) {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    }
  }

  return (
    <button
      type="button"
      onClick={handleClick}
      className="shrink-0 rounded-[6px] border border-border px-1.5 py-0.5 text-[10.5px] font-semibold text-text-muted"
    >
      {copied ? "복사됨" : label}
    </button>
  );
}
