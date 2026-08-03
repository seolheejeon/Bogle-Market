"use client";

import { useEffect, useState } from "react";
import { useAuth } from "@/lib/auth-context";
import { listAddresses, updateAddress } from "@/lib/data";
import type { Address, Profile } from "@/types";
import { AddressFields, EMPTY_ADDRESS_FIELDS, type AddressFieldsValue } from "@/components/AddressFields";
import { SupportLinks } from "@/components/SupportLinks";

type UsernameStatus = "unchecked" | "checking" | "available" | "taken";

export function MyPageView() {
  const { profile, loading, isMockMode, signIn, signUp, signOut, updateProfile, changePassword, checkUsernameTaken, checkPhoneTaken } = useAuth();
  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  // 로그인
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");

  // 회원가입
  const [suUsername, setSuUsername] = useState("");
  const [usernameStatus, setUsernameStatus] = useState<UsernameStatus>("unchecked");
  const [suPassword, setSuPassword] = useState("");
  const [suPasswordConfirm, setSuPasswordConfirm] = useState("");
  const [nickname, setNickname] = useState("");
  const [phone, setPhone] = useState("");
  const [address, setAddress] = useState<AddressFieldsValue>(EMPTY_ADDRESS_FIELDS);
  const [asAdmin, setAsAdmin] = useState(false);

  if (loading) return <p className="p-4 text-sm text-text-muted">불러오는 중...</p>;

  if (profile) {
    return <ProfilePanel profile={profile} updateProfile={updateProfile} changePassword={changePassword} signOut={signOut} />;
  }

  async function checkUsername() {
    const value = suUsername.trim();
    if (!value) return;
    setUsernameStatus("checking");
    try {
      const taken = await checkUsernameTaken(value);
      setUsernameStatus(taken ? "taken" : "available");
    } catch {
      setUsernameStatus("unchecked");
      setError("중복확인 중 오류가 발생했어요. 다시 시도해 주세요.");
    }
  }

  async function submitSignIn() {
    setError(null);
    if (!username.trim() || !password.trim()) {
      setError("아이디와 비밀번호를 입력해 주세요.");
      return;
    }
    setSubmitting(true);
    try {
      const result = await signIn(username.trim(), password);
      if (result.error) setError(result.error);
    } catch (e) {
      setError(e instanceof Error ? e.message : "로그인 중 오류가 발생했어요.");
    } finally {
      setSubmitting(false);
    }
  }

  async function submitSignUp() {
    setError(null);
    if (!suUsername.trim()) {
      setError("아이디를 입력해 주세요.");
      return;
    }
    if (usernameStatus !== "available") {
      setError("아이디 중복확인을 해주세요.");
      return;
    }
    if (suPassword.length < 4) {
      setError("비밀번호는 4자 이상으로 입력해 주세요.");
      return;
    }
    if (suPassword !== suPasswordConfirm) {
      setError("비밀번호가 일치하지 않아요.");
      return;
    }
    if (!nickname.trim()) {
      setError("오픈채팅 닉네임을 입력해 주세요.");
      return;
    }
    const phoneDigits = phone.replace(/\D/g, "");
    if (phoneDigits.length < 9) {
      setError("휴대폰번호를 정확히 입력해 주세요.");
      return;
    }
    if (!address.roadAddress.trim()) {
      setError("주소검색으로 도로명주소를 입력해 주세요.");
      return;
    }
    if (!address.detailAddress.trim()) {
      setError("상세주소(동/호수 등)를 입력해 주세요.");
      return;
    }
    if (!address.entranceMethod.trim()) {
      setError("공동현관 출입방법을 입력해 주세요.");
      return;
    }
    setSubmitting(true);
    try {
      const phoneTaken = await checkPhoneTaken(phoneDigits);
      if (phoneTaken) {
        setError("이미 가입된 휴대폰번호예요.");
        return;
      }
      const result = await signUp({
        username: suUsername.trim(),
        password: suPassword,
        nickname: nickname.trim(),
        phone: phoneDigits,
        address: {
          zonecode: address.zonecode,
          roadAddress: address.roadAddress,
          apartmentName: address.apartmentName,
          detailAddress: address.detailAddress.trim(),
          entranceMethod: address.entranceMethod.trim() || undefined,
          memo: address.memo.trim() || undefined,
        },
        asAdmin,
      });
      if (result.error) setError(result.error);
    } catch (e) {
      setError(e instanceof Error ? e.message : "회원가입 중 오류가 발생했어요.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="p-4">
      <strong className="mb-3 block text-[15px]">마이페이지</strong>
      <SupportLinks />
      <p className="mb-4 text-[12.5px] text-text-muted">로그인 없이도 주문할 수 있어요. 회원가입하면 배송지를 저장해둘 수 있어요.</p>

      <div className="mb-4 flex gap-2">
        <button
          onClick={() => {
            setMode("signin");
            setError(null);
          }}
          className={`flex-1 rounded-[9px] py-2 text-[13px] font-semibold ${mode === "signin" ? "bg-accent text-white" : "bg-bg-sunken text-text-muted"}`}
        >
          로그인
        </button>
        <button
          onClick={() => {
            setMode("signup");
            setError(null);
          }}
          className={`flex-1 rounded-[9px] py-2 text-[13px] font-semibold ${mode === "signup" ? "bg-accent text-white" : "bg-bg-sunken text-text-muted"}`}
        >
          회원가입
        </button>
      </div>

      {mode === "signin" ? (
        <div className="flex flex-col gap-2">
          <input className="rounded-[9px] border border-border bg-bg-card px-3 py-2.5 text-[13px]" placeholder="아이디" value={username} onChange={(e) => setUsername(e.target.value)} />
          <input
            className="rounded-[9px] border border-border bg-bg-card px-3 py-2.5 text-[13px]"
            placeholder="비밀번호"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        </div>
      ) : (
        <div className="flex flex-col gap-2">
          <div className="flex gap-2">
            <input
              className="min-w-0 flex-1 rounded-[9px] border border-border bg-bg-card px-3 py-2.5 text-[13px]"
              placeholder="아이디"
              value={suUsername}
              onChange={(e) => {
                setSuUsername(e.target.value);
                setUsernameStatus("unchecked");
              }}
            />
            <button
              className="shrink-0 rounded-[9px] border border-border px-3 text-[12.5px] font-semibold disabled:opacity-50"
              disabled={usernameStatus === "checking"}
              onClick={checkUsername}
            >
              중복확인
            </button>
          </div>
          {usernameStatus === "available" && <p className="text-[11.5px] font-semibold text-accent-dark">사용 가능한 아이디예요.</p>}
          {usernameStatus === "taken" && <p className="text-[11.5px] font-semibold text-red-600">이미 사용 중인 아이디예요.</p>}

          <input
            className="rounded-[9px] border border-border bg-bg-card px-3 py-2.5 text-[13px]"
            placeholder="비밀번호"
            type="password"
            value={suPassword}
            onChange={(e) => setSuPassword(e.target.value)}
          />
          <input
            className="rounded-[9px] border border-border bg-bg-card px-3 py-2.5 text-[13px]"
            placeholder="비밀번호 확인"
            type="password"
            value={suPasswordConfirm}
            onChange={(e) => setSuPasswordConfirm(e.target.value)}
          />
          <input className="rounded-[9px] border border-border bg-bg-card px-3 py-2.5 text-[13px]" placeholder="오픈채팅 닉네임" value={nickname} onChange={(e) => setNickname(e.target.value)} />
          <input className="rounded-[9px] border border-border bg-bg-card px-3 py-2.5 text-[13px]" placeholder="휴대폰번호" value={phone} onChange={(e) => setPhone(e.target.value)} />

          <p className="mt-2 text-[12.5px] font-bold text-text-muted">기본 배송지</p>
          <AddressFields value={address} onChange={(patch) => setAddress((v) => ({ ...v, ...patch }))} />

          {isMockMode && (
            <label className="flex items-center gap-2 text-[12px] text-text-muted">
              <input type="checkbox" checked={asAdmin} onChange={(e) => setAsAdmin(e.target.checked)} />
              관리자 계정으로 만들기 (개발 모드 전용)
            </label>
          )}
        </div>
      )}

      {error && <p className="mt-3 text-[12.5px] font-semibold text-red-600">{error}</p>}

      <button
        className="mt-4 w-full rounded-[10px] bg-accent py-3 text-[13.5px] font-bold text-white disabled:opacity-50"
        disabled={submitting}
        onClick={mode === "signin" ? submitSignIn : submitSignUp}
      >
        {submitting ? "처리 중..." : mode === "signin" ? "로그인" : "회원가입"}
      </button>
    </div>
  );
}

function ProfilePanel({
  profile,
  updateProfile,
  changePassword,
  signOut,
}: {
  profile: Profile;
  updateProfile: (patch: Partial<Pick<Profile, "nickname" | "phone">>) => Promise<{ error?: string }>;
  changePassword: (newPassword: string) => Promise<{ error?: string }>;
  signOut: () => Promise<void>;
}) {
  // 배송지도 회원정보의 일부라는 판단 아래, "정보 수정" 하나로 프로필+배송지를
  // 한 화면에서 같이 고친다(예전엔 배송지가 항상 펼쳐진 별도 카드였음). 요약
  // 화면(!editing)에는 닉네임/휴대폰만 간단히 보여주고, 수정 화면은 아래 섹션
  // 순서(기본 정보 → 배송지 → 비밀번호)로 구성해뒀다 — 나중에 "알림 설정"
  // 같은 섹션을 추가하고 싶으면 비밀번호 섹션 앞뒤로 같은 모양의 블록만
  // 하나 더 넣으면 된다.
  const [editing, setEditing] = useState(false);
  const [nickname, setNickname] = useState(profile.nickname);
  const [phone, setPhone] = useState(profile.phone);
  const [newPassword, setNewPassword] = useState("");
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [savedAddress, setSavedAddress] = useState<Address | null>(null);
  const [address, setAddress] = useState<AddressFieldsValue>(EMPTY_ADDRESS_FIELDS);

  function loadSavedAddress(def: Address | null) {
    setSavedAddress(def);
    setAddress(
      def
        ? {
            zonecode: def.zonecode,
            roadAddress: def.roadAddress,
            apartmentName: def.apartmentName,
            detailAddress: def.detailAddress,
            entranceMethod: def.entranceMethod ?? "",
            memo: def.memo ?? "",
          }
        : EMPTY_ADDRESS_FIELDS,
    );
  }

  useEffect(() => {
    listAddresses(profile.id).then((addrs) => loadSavedAddress(addrs.find((a) => a.isDefault) ?? addrs[0] ?? null));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profile.id]);

  function startEditing() {
    setNickname(profile.nickname);
    setPhone(profile.phone);
    setNewPassword("");
    if (savedAddress) loadSavedAddress(savedAddress);
    setError(null);
    setEditing(true);
  }

  async function saveAll() {
    setError(null);
    if (!address.roadAddress.trim() || !address.detailAddress.trim() || !address.entranceMethod.trim()) {
      setError("배송지(주소검색/상세주소/공동현관 출입방법)를 모두 입력해 주세요.");
      return;
    }
    setSaving(true);
    try {
      const result = await updateProfile({ nickname, phone });
      if (result.error) {
        setError(result.error);
        return;
      }
      if (newPassword.trim()) {
        const pwResult = await changePassword(newPassword.trim());
        if (pwResult.error) {
          setError(pwResult.error);
          return;
        }
      }
      if (savedAddress) {
        await updateAddress(savedAddress.id, profile.id, {
          zonecode: address.zonecode,
          roadAddress: address.roadAddress,
          apartmentName: address.apartmentName,
          detailAddress: address.detailAddress.trim(),
          entranceMethod: address.entranceMethod.trim(),
          memo: address.memo.trim() || undefined,
        });
      }
      setNewPassword("");
      setEditing(false);
      setSaved(true);
      setTimeout(() => setSaved(false), 1800);
    } catch (e) {
      setError(e instanceof Error ? e.message : "저장 중 오류가 발생했어요.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="p-4">
      <strong className="mb-3 block text-[15px]">마이페이지</strong>
      <SupportLinks />

      <div className="rounded-xl border border-border p-4">
        <div className="text-[15px] font-bold">
          {profile.nickname}님{profile.isAdmin && " (관리자)"}
        </div>
        <div className="mt-1 text-[12.5px] text-text-muted">아이디 {profile.username}</div>

        {!editing ? (
          <>
            <div className="mt-1 text-[12.5px] text-text-muted">{profile.phone}</div>
            {saved && <p className="mt-2 text-[11.5px] font-semibold text-accent-dark">저장했어요.</p>}
            <button className="mt-3 rounded-[8px] border border-border px-3 py-1.5 text-[12px] font-semibold" onClick={startEditing}>
              정보 수정
            </button>
          </>
        ) : (
          <div className="mt-3 flex flex-col gap-4">
            <div className="flex flex-col gap-2">
              <p className="text-[11.5px] font-bold text-text-muted">기본 정보</p>
              <input className="rounded-[9px] border border-border bg-bg-card px-3 py-2.5 text-[13px]" placeholder="오픈채팅 닉네임" value={nickname} onChange={(e) => setNickname(e.target.value)} />
              <input className="rounded-[9px] border border-border bg-bg-card px-3 py-2.5 text-[13px]" placeholder="휴대폰번호" value={phone} onChange={(e) => setPhone(e.target.value)} />
            </div>

            <div className="flex flex-col gap-2">
              <p className="text-[11.5px] font-bold text-text-muted">배송지</p>
              <AddressFields value={address} onChange={(patch) => setAddress((v) => ({ ...v, ...patch }))} />
            </div>

            <div className="flex flex-col gap-2">
              <p className="text-[11.5px] font-bold text-text-muted">비밀번호 변경</p>
              <input
                className="rounded-[9px] border border-border bg-bg-card px-3 py-2.5 text-[13px]"
                placeholder="새 비밀번호 (변경 시에만 입력)"
                type="password"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
              />
            </div>

            {error && <p className="text-[12px] font-semibold text-red-600">{error}</p>}
            <div className="flex gap-2">
              <button className="flex-1 rounded-[8px] bg-accent py-2 text-[12.5px] font-bold text-white disabled:opacity-50" disabled={saving} onClick={saveAll}>
                {saving ? "저장 중..." : "저장"}
              </button>
              <button className="flex-1 rounded-[8px] border border-border py-2 text-[12.5px] font-semibold" onClick={() => setEditing(false)}>
                취소
              </button>
            </div>
          </div>
        )}
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
