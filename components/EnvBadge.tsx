"use client";

import { useEffect, useSyncExternalStore } from "react";

// 개발(STG) 사이트와 운영 사이트를 한눈에 구분하기 위한 딱지 — 화면이 완전히
// 똑같아서 관리자 작업을 엉뚱한 쪽에서 하는 실수를 막으려는 용도.
// NEXT_PUBLIC_ENV_LABEL을 넣으면 그 글자를 그대로 쓰고, 없으면 접속 주소로
// 판단한다(개발 Netlify 사이트·그 배포 미리보기 = STG, 내 컴퓨터 = LOCAL).
// 운영 사이트는 어느 쪽에도 안 걸려서 아무것도 안 보인다.
const STG_HOST = "bogle-market.netlify.app";

function labelForHost(host: string): string | null {
  const fromEnv = process.env.NEXT_PUBLIC_ENV_LABEL?.trim();
  if (fromEnv) return fromEnv;
  if (host === STG_HOST || host.endsWith(`--${STG_HOST}`)) return "STG";
  if (host === "localhost" || host === "127.0.0.1") return "LOCAL";
  return null;
}

const noopSubscribe = () => () => {};

export function EnvBadge() {
  // 서버 렌더링 때는 접속 주소를 모르므로 null → 브라우저에서만 딱지가 붙는다.
  const label = useSyncExternalStore(
    noopSubscribe,
    () => labelForHost(window.location.hostname),
    () => null,
  );

  // 브라우저 탭 제목에도 붙여서 탭만 보고도 구분되게 한다. 페이지 이동 시
  // Next가 <title> 요소를 통째로 갈아끼우므로 <head> 전체를 지켜보다가 다시 붙인다.
  useEffect(() => {
    if (!label) return;
    const prefix = `[${label}] `;
    const apply = () => {
      if (!document.title.startsWith(prefix)) document.title = prefix + document.title;
    };
    apply();
    const observer = new MutationObserver(apply);
    observer.observe(document.head, { childList: true, characterData: true, subtree: true });
    return () => observer.disconnect();
  }, [label]);

  if (!label) return null;
  return (
    <div className="pointer-events-none fixed top-1 left-1/2 z-[100] -translate-x-1/2 rounded-full bg-[#2563eb] px-2.5 py-0.5 text-[11px] font-extrabold tracking-wide text-white shadow">
      {label} 테스트 서버
    </div>
  );
}
