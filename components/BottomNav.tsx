"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const ITEMS = [
  { href: "/", label: "홈", icon: "🏠" },
  { href: "/category", label: "카테고리", icon: "🗂️" },
  { href: "/orders", label: "내 주문", icon: "📋" },
  { href: "/mypage", label: "마이페이지", icon: "🙍" },
];

export function BottomNav() {
  const pathname = usePathname();
  return (
    <nav className="sticky bottom-0 z-10 grid grid-cols-4 border-t border-border bg-bg-card">
      {ITEMS.map((item) => {
        const active = item.href === "/" ? pathname === "/" : pathname.startsWith(item.href);
        return (
          <Link
            key={item.href}
            href={item.href}
            className={`flex flex-col items-center gap-0.5 py-2.5 text-[10.5px] ${active ? "text-accent-dark font-semibold" : "text-text-muted"}`}
          >
            <span className="text-lg">{item.icon}</span>
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}
