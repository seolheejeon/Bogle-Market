"use client";

import { useEffect, useState } from "react";
import { useAuth } from "@/lib/auth-context";
import { listAddresses, saveAddress, deleteAddress, setDefaultAddress } from "@/lib/data";
import type { Address, Profile } from "@/types";

export function MyPageView() {
  const { profile, loading, isMockMode, signIn, signUp, signOut, updateProfile } = useAuth();
  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [asAdmin, setAsAdmin] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  if (loading) return <p className="p-4 text-sm text-text-muted">불러오는 중...</p>;

  if (profile) {
    return <ProfilePanel profile={profile} updateProfile={updateProfile} signOut={signOut} />;
  }

  async function submit() {
    setError(null);
    if (!email.trim() || !password.trim()) {
      setError("이메일과 비밀번호를 입력해 주세요.");
      return;
    }
    setSubmitting(true);
    const result = mode === "signin" ? await signIn(email.trim(), password) : await signUp({ email: email.trim(), password, name, phone, asAdmin });
    setSubmitting(false);
    if (result.error) setError(result.error);
  }

  return (
    <div className="p-4">
      <strong className="mb-3 block text-[15px]">마이페이지</strong>
      <p className="mb-4 text-[12.5px] text-text-muted">로그인 없이도 주문할 수 있어요. 회원가입하면 배송지를 저장해둘 수 있어요.</p>

      <div className="mb-4 flex gap-2">
        <button onClick={() => setMode("signin")} className={`flex-1 rounded-[9px] py-2 text-[13px] font-semibold ${mode === "signin" ? "bg-accent text-white" : "bg-bg-sunken text-text-muted"}`}>
          로그인
        </button>
        <button onClick={() => setMode("signup")} className={`flex-1 rounded-[9px] py-2 text-[13px] font-semibold ${mode === "signup" ? "bg-accent text-white" : "bg-bg-sunken text-text-muted"}`}>
          회원가입
        </button>
      </div>

      <div className="flex flex-col gap-2">
        <input className="rounded-[9px] border border-border bg-bg-card px-3 py-2.5 text-[13px]" placeholder="이메일" value={email} onChange={(e) => setEmail(e.target.value)} />
        <input className="rounded-[9px] border border-border bg-bg-card px-3 py-2.5 text-[13px]" placeholder="비밀번호" type="password" value={password} onChange={(e) => setPassword(e.target.value)} />
        {mode === "signup" && (
          <>
            <input className="rounded-[9px] border border-border bg-bg-card px-3 py-2.5 text-[13px]" placeholder="이름" value={name} onChange={(e) => setName(e.target.value)} />
            <input className="rounded-[9px] border border-border bg-bg-card px-3 py-2.5 text-[13px]" placeholder="전화번호" value={phone} onChange={(e) => setPhone(e.target.value)} />
            {isMockMode && (
              <label className="flex items-center gap-2 text-[12px] text-text-muted">
                <input type="checkbox" checked={asAdmin} onChange={(e) => setAsAdmin(e.target.checked)} />
                관리자 계정으로 만들기 (개발 모드 전용)
              </label>
            )}
          </>
        )}
      </div>

      {error && <p className="mt-3 text-[12.5px] font-semibold text-red-600">{error}</p>}

      <button className="mt-4 w-full rounded-[10px] bg-accent py-3 text-[13.5px] font-bold text-white disabled:opacity-50" disabled={submitting} onClick={submit}>
        {submitting ? "처리 중..." : mode === "signin" ? "로그인" : "회원가입"}
      </button>
    </div>
  );
}

function ProfilePanel({
  profile,
  updateProfile,
  signOut,
}: {
  profile: Profile;
  updateProfile: (patch: Partial<Pick<Profile, "name" | "phone">>) => Promise<{ error?: string }>;
  signOut: () => Promise<void>;
}) {
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(profile.name);
  const [phone, setPhone] = useState(profile.phone);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [addresses, setAddresses] = useState<Address[] | null>(null);
  const [addrName, setAddrName] = useState("");
  const [addrPhone, setAddrPhone] = useState("");
  const [addrAddress, setAddrAddress] = useState("");
  const [addingAddress, setAddingAddress] = useState(false);

  function refreshAddresses() {
    listAddresses(profile.id).then(setAddresses);
  }
  useEffect(refreshAddresses, [profile.id]);

  async function saveInfo() {
    setError(null);
    setSaving(true);
    const result = await updateProfile({ name, phone });
    setSaving(false);
    if (result.error) setError(result.error);
    else setEditing(false);
  }

  async function addAddress() {
    if (!addrName.trim() || !addrPhone.trim() || !addrAddress.trim()) return;
    setAddingAddress(true);
    await saveAddress({
      profileId: profile.id,
      name: addrName.trim(),
      phone: addrPhone.trim(),
      address: addrAddress.trim(),
      isDefault: (addresses ?? []).length === 0,
    });
    setAddrName("");
    setAddrPhone("");
    setAddrAddress("");
    setAddingAddress(false);
    refreshAddresses();
  }

  async function removeAddress(id: string) {
    if (!confirm("이 배송지를 삭제할까요?")) return;
    await deleteAddress(profile.id, id);
    refreshAddresses();
  }

  async function makeDefault(id: string) {
    await setDefaultAddress(profile.id, id);
    refreshAddresses();
  }

  return (
    <div className="p-4">
      <strong className="mb-3 block text-[15px]">마이페이지</strong>

      <div className="rounded-xl border border-border p-4">
        {!editing ? (
          <>
            <div className="text-[15px] font-bold">
              {profile.name || profile.email}님{profile.isAdmin && " (관리자)"}
            </div>
            <div className="mt-1 text-[12.5px] text-text-muted">{profile.email}</div>
            {profile.phone && <div className="mt-1 text-[12.5px] text-text-muted">{profile.phone}</div>}
            <button
              className="mt-3 rounded-[8px] border border-border px-3 py-1.5 text-[12px] font-semibold"
              onClick={() => {
                setName(profile.name);
                setPhone(profile.phone);
                setEditing(true);
              }}
            >
              정보 수정
            </button>
          </>
        ) : (
          <div className="flex flex-col gap-2">
            <input className="rounded-[9px] border border-border bg-bg-card px-3 py-2.5 text-[13px]" placeholder="이름" value={name} onChange={(e) => setName(e.target.value)} />
            <input className="rounded-[9px] border border-border bg-bg-card px-3 py-2.5 text-[13px]" placeholder="전화번호" value={phone} onChange={(e) => setPhone(e.target.value)} />
            {error && <p className="text-[12px] font-semibold text-red-600">{error}</p>}
            <div className="flex gap-2">
              <button className="flex-1 rounded-[8px] bg-accent py-2 text-[12.5px] font-bold text-white disabled:opacity-50" disabled={saving} onClick={saveInfo}>
                {saving ? "저장 중..." : "저장"}
              </button>
              <button className="flex-1 rounded-[8px] border border-border py-2 text-[12.5px] font-semibold" onClick={() => setEditing(false)}>
                취소
              </button>
            </div>
          </div>
        )}
      </div>

      <p className="mt-5 mb-2 text-[12.5px] font-bold text-text-muted">배송지 관리</p>
      <div className="flex flex-col gap-2">
        {(addresses ?? []).map((a) => (
          <div key={a.id} className="rounded-[10px] border border-border p-3">
            <div className="flex items-center justify-between gap-2">
              <span className="truncate text-[13px] font-semibold">
                {a.name} · {a.phone}
              </span>
              {a.isDefault && <span className="shrink-0 rounded-full bg-accent-soft px-2 py-0.5 text-[10.5px] font-bold text-accent-dark">기본배송지</span>}
            </div>
            <p className="mt-1 text-[12.5px] text-text-muted">{a.address}</p>
            <div className="mt-2 flex gap-2">
              {!a.isDefault && (
                <button className="rounded-[7px] border border-border px-2.5 py-1 text-[11.5px] font-semibold" onClick={() => makeDefault(a.id)}>
                  기본으로 설정
                </button>
              )}
              <button className="rounded-[7px] border border-border px-2.5 py-1 text-[11.5px] font-semibold text-red-600" onClick={() => removeAddress(a.id)}>
                삭제
              </button>
            </div>
          </div>
        ))}
        {addresses !== null && addresses.length === 0 && <p className="text-[12.5px] text-text-muted">저장된 배송지가 없어요.</p>}
      </div>

      <div className="mt-3 rounded-xl border border-dashed border-border p-3">
        <p className="mb-2 text-[12.5px] font-bold text-text-muted">배송지 추가</p>
        <div className="flex flex-col gap-2">
          <input className="rounded-[9px] border border-border bg-bg-card px-3 py-2.5 text-[13px]" placeholder="받는 분 이름" value={addrName} onChange={(e) => setAddrName(e.target.value)} />
          <input className="rounded-[9px] border border-border bg-bg-card px-3 py-2.5 text-[13px]" placeholder="전화번호" value={addrPhone} onChange={(e) => setAddrPhone(e.target.value)} />
          <input className="rounded-[9px] border border-border bg-bg-card px-3 py-2.5 text-[13px]" placeholder="배송지 주소" value={addrAddress} onChange={(e) => setAddrAddress(e.target.value)} />
          <button className="rounded-[8px] bg-accent py-2 text-[12.5px] font-bold text-white disabled:opacity-50" disabled={addingAddress} onClick={addAddress}>
            추가
          </button>
        </div>
      </div>

      {profile.isAdmin && (
        <a href="/admin" className="mt-4 block rounded-[10px] bg-accent py-3 text-center text-[13.5px] font-bold text-white">
          관리자 화면으로 이동
        </a>
      )}
      <button className="mt-3 w-full rounded-[10px] border border-border py-3 text-[13.5px] font-semibold" onClick={() => signOut()}>
        로그아웃
      </button>
    </div>
  );
}
