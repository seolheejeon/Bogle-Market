"use client";

import { useEffect, useState } from "react";
import { listAllProfiles, getDefaultAddress, listOrdersForProfile } from "@/lib/data";
import { formatAddress, type Address, type Profile } from "@/types";
import { formatDateTime } from "@/lib/format";

interface CustomerRow {
  profile: Profile;
  address: Address | null;
  orderCount: number;
  lastOrderAt: string | null;
}

export default function AdminCustomersPage() {
  const [rows, setRows] = useState<CustomerRow[] | null>(null);

  useEffect(() => {
    (async () => {
      const profiles = await listAllProfiles();
      const built = await Promise.all(
        profiles.map(async (profile) => {
          const [address, orders] = await Promise.all([getDefaultAddress(profile.id), listOrdersForProfile(profile.id)]);
          return { profile, address, orderCount: orders.length, lastOrderAt: orders[0]?.createdAt ?? null };
        }),
      );
      setRows(built);
    })();
  }, []);

  if (rows === null) return <p className="text-sm text-text-muted">불러오는 중...</p>;

  return (
    <div className="max-w-2xl">
      <p className="mb-4 text-[15px] font-bold">고객 관리</p>
      <div className="flex flex-col gap-2">
        {rows.map(({ profile, address, orderCount, lastOrderAt }) => (
          <div key={profile.id} className="rounded-xl border border-border p-3.5">
            <div className="flex items-center justify-between gap-2">
              <span className="text-[13.5px] font-bold">
                {profile.nickname}
                {profile.isAdmin && " (관리자)"}
              </span>
              <span className="shrink-0 text-[11.5px] text-text-muted">아이디 {profile.username}</span>
            </div>
            <p className="mt-1 text-[12.5px] text-text-muted">{profile.phone}</p>
            <p className="mt-1 text-[12.5px] text-text-muted">{address ? formatAddress(address) : "등록된 배송지 없음"}</p>
            <p className="mt-1.5 text-[12px] font-semibold text-accent-dark">
              주문 {orderCount}건{lastOrderAt && ` · 최근 ${formatDateTime(lastOrderAt)}`}
            </p>
          </div>
        ))}
        {rows.length === 0 && <p className="text-[12.5px] text-text-muted">가입한 회원이 없어요.</p>}
      </div>
    </div>
  );
}
