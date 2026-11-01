"use client";

import { useEffect, useState } from "react";

// 주어진 시각들 중 가장 가까운 미래 시각이 되는 순간 한 번 다시 그린다 — 예약 오픈
// 상품이 새로고침 없이 정각에 "담기"로 바뀌게 하려고 쓴다(손님들이 오픈을 기다리며
// 새로고침을 연타하던 문제, 2026-11-01). 시각이 없거나 다 지났으면 아무것도 안 한다.
export function useRerenderAt(isoTimes: (string | undefined)[]): void {
  const [tick, setTick] = useState(0);
  const key = isoTimes.filter(Boolean).join("|");
  useEffect(() => {
    if (!key) return;
    const now = Date.now();
    const next = key
      .split("|")
      .map((t) => new Date(t).getTime())
      .filter((t) => t > now)
      .sort((a, b) => a - b)[0];
    if (next === undefined) return;
    // setTimeout 최대치(약 24.8일)를 넘으면 바로 실행돼 버려서 하루 단위로 끊어 다시 잰다.
    const id = setTimeout(() => setTick((n) => n + 1), Math.min(next - now + 200, 86400000));
    return () => clearTimeout(id);
  }, [key, tick]);
}
