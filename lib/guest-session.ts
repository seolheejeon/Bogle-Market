"use client";

import { useSyncExternalStore } from "react";

// 비회원 주문 조회용 이름+확인번호를 URL 쿼리(?gn=&pin=) 대신 이 탭의
// sessionStorage에만 잠깐 보관한다 — 예전엔 체크아웃 직후 이동하는 주문 상세
// 주소에 확인번호가 그대로 붙어서, 그 링크를 단톡방 등에 공유하면 누구나 그
// 주문의 주소/전화번호를 볼 수 있었다. 탭을 닫으면 사라지고(공용 기기 대비),
// 그 뒤로는 "내 주문"에서 이름+확인번호로 다시 조회하면 된다.
const KEY = "bogle_guest_lookup";
const listeners = new Set<() => void>();

export interface GuestLookup {
  name: string;
  pin: string;
}

export function saveGuestLookup(name: string, pin: string) {
  try {
    sessionStorage.setItem(KEY, JSON.stringify({ name, pin }));
  } catch {
    // 저장이 막힌 환경(시크릿 모드 등)이면 그냥 이번 화면에서만 못 쓰는 것 — 다시 조회하면 된다.
  }
  listeners.forEach((l) => l());
}

function readRaw(): string | null {
  try {
    return sessionStorage.getItem(KEY);
  } catch {
    return null;
  }
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

const noopSubscribe = () => () => {};

// 하이드레이션 직후 첫 렌더에서는 sessionStorage를 아직 못 읽은 상태(null)라,
// 그걸 "조회 정보 없음"으로 착각해 "주문을 찾을 수 없어요"가 잠깐 깜빡이지
// 않도록 브라우저 값이 준비됐는지 따로 알려준다.
export function useIsClient(): boolean {
  return useSyncExternalStore(noopSubscribe, () => true, () => false);
}

// 서버 렌더링 때는 null(조회 정보 없음) → 브라우저에서 sessionStorage 값으로 채워진다.
export function useGuestLookup(): GuestLookup | null {
  const raw = useSyncExternalStore(subscribe, readRaw, () => null);
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as GuestLookup;
    return parsed.name && parsed.pin ? parsed : null;
  } catch {
    return null;
  }
}
