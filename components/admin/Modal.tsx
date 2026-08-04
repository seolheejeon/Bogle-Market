"use client";

import { useEffect } from "react";

// 주문/고객 상세 등 관리자 화면 전용 모달 — 모바일에서는 하단 시트, 데스크톱
// 에서는 가운데 카드로 뜬다. 배경 클릭/Esc로 닫힘.
export function Modal({ onClose, children, wide }: { onClose: () => void; children: React.ReactNode; wide?: boolean }) {
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("keydown", onKey);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prevOverflow;
    };
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 sm:items-center sm:p-4" onClick={onClose}>
      <div
        className={`flex max-h-[88vh] w-full flex-col overflow-y-auto rounded-t-2xl bg-bg-card p-4 sm:max-h-[85vh] sm:rounded-2xl sm:p-5 ${wide ? "sm:max-w-lg" : "sm:max-w-md"}`}
        onClick={(e) => e.stopPropagation()}
      >
        {children}
      </div>
    </div>
  );
}
