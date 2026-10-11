"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";
import { useAuth } from "@/lib/auth-context";
import { recordVisit } from "@/lib/data";

const VISITOR_KEY = "bogle_visitor_id";

// 브라우저마다 한 번 만든 임의의 방문자 id — 개인정보가 아니라 "같은 사람이 하루에
// 여러 번 들어와도 1명"으로 세기 위한 값. 저장이 막힌 환경이면 매번 새로 만든다.
function visitorId(): string {
  try {
    const saved = localStorage.getItem(VISITOR_KEY);
    if (saved) return saved;
    const id = crypto.randomUUID();
    localStorage.setItem(VISITOR_KEY, id);
    return id;
  } catch {
    return crypto.randomUUID();
  }
}

// 손님 화면을 볼 때마다(페이지 이동 포함) 방문을 기록한다 — 관리자 화면과
// 관리자 계정의 방문은 세지 않는다(사장님 본인 접속이 방문자 수에 섞이지 않게).
// 하루 방문자 수는 관리자 "매출·방문" 화면에서만 보인다.
export function VisitTracker() {
  const pathname = usePathname();
  const { profile, loading } = useAuth();

  useEffect(() => {
    if (loading || profile?.isAdmin || pathname.startsWith("/admin")) return;
    void recordVisit(visitorId());
  }, [pathname, profile, loading]);

  return null;
}
