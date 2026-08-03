"use client";

import { useEffect, useState } from "react";
import { getStoreSettings } from "@/lib/data";
import type { StoreSettings } from "@/types";

// 관리자 설정(/admin/settings)에서 입력한 링크가 있을 때만 버튼이 보인다 —
// 코드 배포 없이 관리자 설정만 바꾸면 바로 반영된다. "문의하기"는 오픈채팅
// URL을 우선 쓰고, 안 채워져 있으면 카카오채널 URL로 대신한다(둘 다
// "고객이 연락할 방법"이라는 같은 목적이라 버튼 하나로 충분함).
export function SupportLinks() {
  const [settings, setSettings] = useState<StoreSettings | null>(null);

  useEffect(() => {
    getStoreSettings().then(setSettings);
  }, []);

  if (!settings) return null;

  const inquiryUrl = settings.inquiryChatUrl || settings.kakaoChannelUrl;
  const links = [
    inquiryUrl && { key: "inquiry", href: inquiryUrl, label: "문의하기", icon: "💬" },
    settings.opentalkUrl && { key: "opentalk", href: settings.opentalkUrl, label: "보글마켓 오픈톡방 입장하기", icon: "🧡" },
  ].filter((l): l is { key: string; href: string; label: string; icon: string } => Boolean(l));

  if (links.length === 0) return null;

  return (
    <div className="mb-4 flex flex-col gap-2">
      {links.map((link) => (
        <a
          key={link.key}
          href={link.href}
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center justify-center gap-1.5 rounded-[10px] border border-border py-2.5 text-[13px] font-semibold"
        >
          <span>{link.icon}</span>
          {link.label}
        </a>
      ))}
    </div>
  );
}
