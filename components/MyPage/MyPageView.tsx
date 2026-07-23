"use client";

import { useState } from "react";
import { useAuth } from "@/lib/auth-context";

export function MyPageView() {
  const { profile, loading, isMockMode, signIn, signUp, signOut } = useAuth();
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
    return (
      <div className="p-4">
        <strong className="mb-3 block text-[15px]">마이페이지</strong>
        <div className="rounded-xl border border-border p-4">
          <div className="text-[15px] font-bold">{profile.name || profile.email}님{profile.isAdmin && " (관리자)"}</div>
          <div className="mt-1 text-[12.5px] text-text-muted">{profile.email}</div>
          {profile.phone && <div className="mt-1 text-[12.5px] text-text-muted">{profile.phone}</div>}
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
