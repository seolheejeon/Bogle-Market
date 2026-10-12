"use client";

import { useEffect, useRef, useState } from "react";

const THRESHOLD = 70; // 이만큼(px) 당기면 놓았을 때 새로고침
const MAX_PULL = 110;

// 맨 위에서 화면을 아래로 당겼다 놓으면 새로고침 — 일반 크롬/사파리는 브라우저가
// 이미 해주니까 건드리지 않고, 브라우저 주소창이 없는 "홈 화면에 설치한 앱(PWA)"과
// 당겨서 새로고침이 잘 안 되는 카카오톡 안 브라우저에서만 켠다(두 번 새로고침 방지).
function shouldEnable(): boolean {
  if (typeof window === "undefined") return false;
  const standalone = window.matchMedia?.("(display-mode: standalone)").matches || (navigator as Navigator & { standalone?: boolean }).standalone === true;
  const kakao = /KAKAOTALK/i.test(navigator.userAgent);
  return standalone || kakao;
}

// 손가락이 닿은 곳 위쪽에 이미 스크롤된 영역(모달·가로 목록 등)이 있으면 그 영역을
// 스크롤하려는 거라 새로고침으로 가로채지 않는다.
function insideScrolledArea(target: EventTarget | null): boolean {
  let el = target as HTMLElement | null;
  while (el && el !== document.body) {
    if (el.scrollTop > 0) return true;
    el = el.parentElement;
  }
  return false;
}

export function PullToRefresh() {
  const [enabled, setEnabled] = useState(false);
  const [pull, setPull] = useState(0);
  const [refreshing, setRefreshing] = useState(false);
  const start = useRef<{ y: number; x: number } | null>(null);
  const pullRef = useRef(0);

  useEffect(() => {
    // 브라우저에서만 판단 가능 — 화면이 처음 그려진 뒤 한 번만 켠다.
    const id = setTimeout(() => setEnabled(shouldEnable()), 0);
    return () => clearTimeout(id);
  }, []);

  useEffect(() => {
    if (!enabled) return;
    const onStart = (e: TouchEvent) => {
      if (window.scrollY > 0 || e.touches.length !== 1 || insideScrolledArea(e.target)) {
        start.current = null;
        return;
      }
      start.current = { y: e.touches[0].clientY, x: e.touches[0].clientX };
    };
    const onMove = (e: TouchEvent) => {
      if (!start.current) return;
      const dy = e.touches[0].clientY - start.current.y;
      const dx = Math.abs(e.touches[0].clientX - start.current.x);
      // 옆으로 넘기는 동작(배너 스와이프 등)이면 새로고침이 아니다.
      if (dy <= 0 || dx > dy || window.scrollY > 0) {
        pullRef.current = 0;
        setPull(0);
        return;
      }
      pullRef.current = Math.min(dy * 0.5, MAX_PULL);
      setPull(pullRef.current);
    };
    const onEnd = () => {
      if (!start.current) return;
      start.current = null;
      if (pullRef.current >= THRESHOLD) {
        setRefreshing(true);
        window.location.reload();
        return;
      }
      pullRef.current = 0;
      setPull(0);
    };
    window.addEventListener("touchstart", onStart, { passive: true });
    window.addEventListener("touchmove", onMove, { passive: true });
    window.addEventListener("touchend", onEnd);
    window.addEventListener("touchcancel", onEnd);
    return () => {
      window.removeEventListener("touchstart", onStart);
      window.removeEventListener("touchmove", onMove);
      window.removeEventListener("touchend", onEnd);
      window.removeEventListener("touchcancel", onEnd);
    };
  }, [enabled]);

  if (!enabled || (pull === 0 && !refreshing)) return null;
  const ready = pull >= THRESHOLD || refreshing;
  return (
    <div className="pointer-events-none fixed inset-x-0 top-0 z-[90] flex justify-center" style={{ transform: `translateY(${refreshing ? 24 : Math.max(pull - 30, 0)}px)` }}>
      <div className="flex items-center gap-1.5 rounded-full bg-bg-card px-3.5 py-1.5 text-[12px] font-bold text-accent-dark shadow-md">
        <span className={refreshing ? "inline-block animate-spin" : "inline-block transition-transform"} style={refreshing ? undefined : { transform: `rotate(${pull * 3}deg)` }}>
          ⟳
        </span>
        {refreshing ? "새로고침 중..." : ready ? "놓으면 새로고침" : "당겨서 새로고침"}
      </div>
    </div>
  );
}
