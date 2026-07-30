"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useAuth } from "@/lib/auth-context";

const NAV = [
  { href: "/admin", label: "운영 메인" },
  { href: "/admin/events", label: "이벤트 관리" },
  { href: "/admin/products", label: "상품 관리" },
  { href: "/admin/banners", label: "배너 관리" },
  { href: "/admin/customers", label: "고객 관리" },
  { href: "/admin/notifications", label: "알림 발송" },
  { href: "/admin/settings", label: "설정" },
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
      <nav className="flex gap-1 border-b border-border px-5">
        {NAV.map((item) => {
          const active = item.href === "/admin" ? pathname === "/admin" : pathname.startsWith(item.href);
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`border-b-2 px-3 py-2.5 text-[13px] font-semibold ${active ? "border-accent text-accent-dark" : "border-transparent text-text-muted"}`}
            >
              {item.label}
            </Link>
          );
        })}
      </nav>
      <div className="p-5">{children}</div>
    </div>
  );
}
