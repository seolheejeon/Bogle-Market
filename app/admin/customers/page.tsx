"use client";

import { useEffect, useMemo, useState } from "react";
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
  const [apartmentFilter, setApartmentFilter] = useState("all");

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

  // 검색 결과가 공동주택이 아닌 회원(아파트명이 빈 값)은 필터 목록에서 제외.
  const apartments = useMemo(() => Array.from(new Set((rows ?? []).map((r) => r.address?.apartmentName).filter((v): v is string => !!v))).sort(), [rows]);

  const filteredRows = useMemo(
    () => (apartmentFilter === "all" ? rows : (rows ?? []).filter((r) => r.address?.apartmentName === apartmentFilter)),
    [rows, apartmentFilter],
  );

  if (rows === null) return <p className="text-sm text-text-muted">불러오는 중...</p>;

  return (
    <div className="max-w-2xl">
      <p className="mb-4 text-[15px] font-bold">고객 관리</p>
      {apartments.length > 0 && (
        <select
          className="mb-4 rounded-[9px] border border-border bg-bg-card px-3 py-2 text-[13px]"
          value={apartmentFilter}
          onChange={(e) => setApartmentFilter(e.target.value)}
        >
          <option value="all">전체 아파트</option>
          {apartments.map((name) => (
            <option key={name} value={name}>
              {name}
            </option>
          ))}
        </select>
      )}
      <div className="flex flex-col gap-2">
        {(filteredRows ?? []).map(({ profile, address, orderCount, lastOrderAt }) => (
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
        {rows.length > 0 && (filteredRows ?? []).length === 0 && <p className="text-[12.5px] text-text-muted">해당 아파트에 가입한 회원이 없어요.</p>}
      </div>
    </div>
  );
}
