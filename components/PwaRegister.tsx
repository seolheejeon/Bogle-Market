"use client";

import { useEffect } from "react";

// 서비스워커는 프로덕션 빌드에서만 등록한다 — 개발 모드(Turbopack HMR)에서
// 캐시가 끼어들면 새로고침해도 옛날 페이지가 보이는 등 혼란만 생긴다.
export function PwaRegister() {
  useEffect(() => {
    if (process.env.NODE_ENV !== "production") return;
    if (!("serviceWorker" in navigator)) return;
    navigator.serviceWorker.register("/sw.js").catch((e) => console.error("[PWA] 서비스워커 등록 실패", e));
  }, []);
  return null;
}
