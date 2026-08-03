"use client";

import { useEffect } from "react";

// 저장하지 않은 변경사항이 있을 때 페이지를 벗어나려고 하면 확인창을 띄운다.
// 새로고침/탭 닫기/주소창 직접 이동은 beforeunload로(브라우저 기본 확인창,
// 메시지 커스터마이즈는 대부분 브라우저가 무시하고 자기 문구를 보여줌),
// 앱 안에서 <Link>를 눌러 다른 페이지로 가는 것은 클라이언트 라우팅이라
// beforeunload가 안 뜨므로 문서 레벨 클릭을 캡처 단계에서 가로채 따로 확인한다.
export function useUnsavedChangesGuard(dirty: boolean, message = "저장하지 않은 변경사항이 있습니다.\n정말 이동하시겠습니까?") {
  useEffect(() => {
    if (!dirty) return;

    function handleBeforeUnload(e: BeforeUnloadEvent) {
      e.preventDefault();
      e.returnValue = "";
    }

    // Link 클릭은 앵커의 클릭 이벤트 리스너(버블 단계)에서 라우팅을 시작하므로,
    // 캡처 단계에서 먼저 가로채 확인창을 띄우고 취소 시 preventDefault로 막는다.
    function handleClickCapture(e: MouseEvent) {
      const anchor = (e.target as HTMLElement | null)?.closest("a");
      if (!anchor || anchor.target === "_blank" || !anchor.href) return;
      const url = new URL(anchor.href, window.location.href);
      if (url.pathname === window.location.pathname && url.search === window.location.search) return;
      if (!window.confirm(message)) {
        e.preventDefault();
        e.stopPropagation();
      }
    }

    window.addEventListener("beforeunload", handleBeforeUnload);
    document.addEventListener("click", handleClickCapture, true);
    return () => {
      window.removeEventListener("beforeunload", handleBeforeUnload);
      document.removeEventListener("click", handleClickCapture, true);
    };
  }, [dirty, message]);
}
