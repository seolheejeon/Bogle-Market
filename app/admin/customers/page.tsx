"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { listAllProfiles, getDefaultAddress, listOrdersForProfile, listAllOrders } from "@/lib/data";
import { formatAddress, type Address, type Order, type Profile } from "@/types";
import { formatDateTime } from "@/lib/format";
import { formatPhone } from "@/lib/phone";
import { CustomerDetailModal } from "@/components/admin/CustomerDetailModal";

interface CustomerRow {
  profile: Profile;
  address: Address | null;
  // 주문내역 모달에서 재조회 없이 그대로 쓸 수 있도록 개수/최근일뿐 아니라
  // 전체 주문 배열을 들고 있는다.
  orders: Order[];
}

export default function AdminCustomersPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [rows, setRows] = useState<CustomerRow[] | null>(null);
  const [apartmentFilter, setApartmentFilter] = useState("all");
  const [query, setQuery] = useState("");
  const [selectedProfileId, setSelectedProfileId] = useState<string | null>(null);
  // 비회원 주문자 수 — 이름+연락처가 같으면 같은 사람으로 본다(취소 주문 포함, 주문한 적 있는 사람 기준).
  const [guestCount, setGuestCount] = useState<number | null>(null);

  useEffect(() => {
    listAllOrders().then((orders) => {
      const keys = new Set(
        orders.filter((o) => !o.profileId).map((o) => `${(o.guestName ?? o.recipientName).trim()}|${(o.guestPhone ?? o.recipientPhone).replace(/\D/g, "")}`),
      );
      setGuestCount(keys.size);
    });
  }, []);

  useEffect(() => {
    (async () => {
      const profiles = await listAllProfiles();
      const built = await Promise.all(
        profiles.map(async (profile) => {
          const [address, orders] = await Promise.all([getDefaultAddress(profile.id), listOrdersForProfile(profile.id)]);
          return { profile, address, orders };
        }),
      );
      setRows(built);
    })();
  }, []);

  // 주문 상세 모달에서 "고객상세"로 들어온 경우 그 고객 상세를 바로 연다.
  useEffect(() => {
    const customerId = searchParams.get("customer");
    if (customerId) setSelectedProfileId(customerId);
  }, [searchParams]);

  // 검색 결과가 공동주택이 아닌 회원(아파트명이 빈 값)은 필터 목록에서 제외.
  const apartments = useMemo(() => Array.from(new Set((rows ?? []).map((r) => r.address?.apartmentName).filter((v): v is string => !!v))).sort(), [rows]);

  // 이름·닉네임·아이디·전화번호·아파트·주소 어디든 들어 있으면 찾는다. 전화번호는
  // 하이픈 유무와 상관없이 숫자로도 맞춰 본다(예: "1111" → 010-1111-2222).
  const filteredRows = useMemo(() => {
    const q = query.trim().toLowerCase();
    const qDigits = q.replace(/\D/g, "");
    return (rows ?? []).filter((r) => {
      if (apartmentFilter !== "all" && r.address?.apartmentName !== apartmentFilter) return false;
      if (!q) return true;
      const p = r.profile;
      const text = [p.name, p.nickname, p.username, p.phone, r.address?.apartmentName, r.address ? formatAddress(r.address) : ""].join(" ").toLowerCase();
      if (text.includes(q)) return true;
      // 숫자(와 하이픈·공백)만 친 경우에만 전화번호 숫자 비교 — "a1b2c3" 같은 건 제외.
      return qDigits.length >= 3 && qDigits === q.replace(/[\s-]/g, "") && (p.phone ?? "").replace(/\D/g, "").includes(qDigits);
    });
  }, [rows, apartmentFilter, query]);

  const selectedRow = rows?.find((r) => r.profile.id === selectedProfileId) ?? null;

  // 고객 수 요약 — 관리자 계정은 손님이 아니라 뺀다. 비회원은 계정이 없어 목록엔
  // 안 나오지만, 주문 기록의 이름+연락처로 몇 명인지는 따로 센다.
  const customerRows = (rows ?? []).filter((r) => !r.profile.isAdmin);
  const orderedMembers = customerRows.filter((r) => r.orders.length > 0).length;
  const filteredCustomerCount = (filteredRows ?? []).filter((r) => !r.profile.isAdmin).length;

  if (rows === null) return <p className="text-sm text-text-muted">불러오는 중...</p>;

  return (
    <div className="max-w-2xl">
      <p className="mb-2 text-[15px] font-bold">고객 관리</p>
      <div className="mb-4 grid grid-cols-3 gap-2">
        <div className="rounded-xl border border-border p-3">
          <p className="text-xl font-extrabold">{customerRows.length}명</p>
          <p className="mt-0.5 text-[11.5px] font-semibold text-text-muted">전체 회원</p>
        </div>
        <div className="rounded-xl border border-border p-3">
          <p className="text-xl font-extrabold">{orderedMembers}명</p>
          <p className="mt-0.5 text-[11.5px] font-semibold text-text-muted">주문한 회원</p>
        </div>
        <div className="rounded-xl border border-border p-3">
          <p className="text-xl font-extrabold">{guestCount ?? "-"}명</p>
          <p className="mt-0.5 text-[11.5px] font-semibold text-text-muted">비회원 주문자</p>
        </div>
      </div>
      <input
        type="search"
        className="mb-2 w-full rounded-[9px] border border-border bg-bg-card px-3 py-2 text-[13px]"
        placeholder="이름·닉네임·아이디·전화번호·아파트로 검색"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
      />
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
      {(apartmentFilter !== "all" || query.trim()) && (
        <p className="mb-2 text-[12.5px] font-semibold text-accent-dark">
          {apartmentFilter !== "all" && `${apartmentFilter} `}
          {query.trim() && `"${query.trim()}" 검색 `}
          회원 {filteredCustomerCount}명
        </p>
      )}
      <div className="flex flex-col gap-2">
        {(filteredRows ?? []).map(({ profile, address, orders }) => {
          const lastOrderAt = orders[0]?.createdAt ?? null;
          return (
            <div key={profile.id} onClick={() => setSelectedProfileId(profile.id)} className="cursor-pointer rounded-xl border border-border p-3.5">
              <div className="flex items-center justify-between gap-2">
                <span className="text-[13.5px] font-bold">
                  {profile.name}
                  {profile.isAdmin && " (관리자)"}
                </span>
                <span className="shrink-0 text-[11.5px] text-text-muted">아이디 {profile.username}</span>
              </div>
              <p className="mt-1 text-[12.5px] text-text-muted">오픈채팅 닉네임 {profile.nickname}</p>
              <p className="mt-1 text-[12.5px] text-text-muted">{formatPhone(profile.phone)}</p>
              {address?.apartmentName && <p className="mt-1 text-[12.5px] font-semibold text-text-muted">🏢 {address.apartmentName}</p>}
              <p className="mt-1 text-[12.5px] text-text-muted">{address ? formatAddress(address) : "등록된 배송지 없음"}</p>
              <p className="mt-1.5 text-[12px] font-semibold text-accent-dark">
                주문 {orders.length}건{lastOrderAt && ` · 최근 ${formatDateTime(lastOrderAt)}`}
              </p>
            </div>
          );
        })}
        {rows.length === 0 && <p className="text-[12.5px] text-text-muted">가입한 회원이 없어요.</p>}
        {rows.length > 0 && (filteredRows ?? []).length === 0 && <p className="text-[12.5px] text-text-muted">조건에 맞는 회원이 없어요.</p>}
      </div>

      {selectedRow && (
        <CustomerDetailModal
          profile={selectedRow.profile}
          address={selectedRow.address}
          orders={selectedRow.orders}
          onClose={() => setSelectedProfileId(null)}
          onViewOrder={(orderId) => router.push(`/admin?order=${orderId}`)}
        />
      )}
    </div>
  );
}
