"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useAuth } from "@/lib/auth-context";

// 자주 쓰는 4개(운영/이벤트/상품/고객)와 가끔 쓰는 3개(배너/알림/설정)를
// 시각적으로 구분한다 — 한 줄에 텍스트만 7개 나열돼 있으면 훑어보기 어렵다는
// 피드백으로 아이콘을 붙이고, 자주 안 쓰는 항목은 구분선(border-l)으로 살짝
// 떨어뜨려서 우선순위가 눈에 들어오게 했다.
const NAV = [
  { href: "/admin", label: "운영 메인", icon: "🏠" },
  { href: "/admin/events", label: "이벤트 관리", icon: "🎪" },
  { href: "/admin/products", label: "상품 관리", icon: "📦" },
  { href: "/admin/customers", label: "고객 관리", icon: "👥", groupBreak: true },
  { href: "/admin/banners", label: "배너 관리", icon: "🖼️" },
  { href: "/admin/notifications", label: "알림 발송", icon: "🔔" },
  { href: "/admin/settings", label: "설정", icon: "⚙️" },
];

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const { profile, loading } = useAuth();
  const pathname = usePathname();

  if (loading) return <div className="p-6 text-sm text-text-muted">불러오는 중...</div>;

  if (!profile || !profile.isAdmin) {
    return (
      <div className="mx-auto max-w-md p-6 text-center">
        <p className="mb-3 text-[15px] font-bold">관리자만 접근할 수 있어요.</p>
        <p className="mb-4 text-[13px] text-text-muted">마이페이지에서 관리자 계정으로 로그인해 주세요.</p>
        <Link href="/mypage" className="inline-block rounded-[10px] bg-accent px-4 py-2.5 text-[13px] font-bold text-white">
          마이페이지로 이동
        </Link>
      </div>
    );
  }

  return (
    <div className="mx-auto min-h-screen max-w-4xl bg-bg-card">
      <header className="flex items-center justify-between border-b border-border px-5 py-3.5">
        <Link href="/" className="flex items-center gap-2 font-extrabold text-accent-dark">
          <Image src="/images/bogle.png" alt="보글마켓 마스코트" width={28} height={28} className="object-contain" />
          보글마켓 관리자
        </Link>
        <Link href="/mypage" className="text-[12.5px] text-text-muted">
          {profile.nickname || profile.username}
        </Link>
      </header>
      <nav className="flex flex-wrap items-center gap-0.5 overflow-x-auto border-b border-border px-5">
        {NAV.map((item) => {
          const active = item.href === "/admin" ? pathname === "/admin" : pathname.startsWith(item.href);
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`flex shrink-0 items-center gap-1 border-b-2 px-2.5 py-2.5 text-[13px] font-semibold whitespace-nowrap ${
                item.groupBreak ? "ml-1 border-l border-l-border pl-3" : ""
              } ${active ? "border-b-accent text-accent-dark" : "border-b-transparent text-text-muted"}`}
            >
              <span className="text-[14px]">{item.icon}</span>
              {item.label}
            </Link>
          );
        })}
      </nav>
      <div className="p-5">{children}</div>
    </div>
  );
}
