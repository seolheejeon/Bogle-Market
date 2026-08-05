"use client";

import { useEffect, useState } from "react";
import { useAuth } from "@/lib/auth-context";
import { listAddresses, updateAddress, saveAddress, deleteAddress, setDefaultAddress } from "@/lib/data";
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
  const [name, setName] = useState("");
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
    if (!name.trim()) {
      setError("이름을 입력해 주세요.");
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
        name: name.trim(),
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
          <input className="rounded-[9px] border border-border bg-bg-card px-3 py-2.5 text-[13px]" placeholder="이름" value={name} onChange={(e) => setName(e.target.value)} />
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
  updateProfile: (patch: Partial<Pick<Profile, "name" | "nickname" | "phone">>) => Promise<{ error?: string }>;
  changePassword: (newPassword: string) => Promise<{ error?: string }>;
  signOut: () => Promise<void>;
}) {
  // 기본 정보(이름/닉네임/휴대폰/비밀번호)는 "정보 수정" 토글로 한 번에
  // 고친다. 배송지는 여러 개를 저장할 수 있어서 별도 섹션으로 분리하고,
  // 각 배송지 카드마다 자기 자신만 수정/삭제/기본설정하는 식으로 둔다 —
  // "정보 수정" 토글에 배송지까지 얹으면 하나 고치려고 전체를 편집모드로
  // 돌려야 해서 번거롭다.
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(profile.name);
  const [nickname, setNickname] = useState(profile.nickname);
  const [phone, setPhone] = useState(profile.phone);
  const [newPassword, setNewPassword] = useState("");
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [addresses, setAddresses] = useState<Address[]>([]);
  const [addressesLoading, setAddressesLoading] = useState(true);
  // null이면 아무 배송지도 편집 중이 아님, "new"면 새 배송지 추가 폼,
  // 그 외엔 그 id를 가진 기존 배송지를 수정 중.
  const [editingAddressId, setEditingAddressId] = useState<string | "new" | null>(null);
  const [addressDraft, setAddressDraft] = useState<AddressFieldsValue>(EMPTY_ADDRESS_FIELDS);
  const [addressError, setAddressError] = useState<string | null>(null);
  const [addressSaving, setAddressSaving] = useState(false);

  function refreshAddresses() {
    return listAddresses(profile.id).then((list) => {
      setAddresses(list);
      setAddressesLoading(false);
    });
  }

  useEffect(() => {
    refreshAddresses();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profile.id]);

  function startEditing() {
    setName(profile.name);
    setNickname(profile.nickname);
    setPhone(profile.phone);
    setNewPassword("");
    setError(null);
    cancelAddressEdit();
    setEditing(true);
  }

  async function saveAll() {
    setError(null);
    if (!name.trim()) {
      setError("이름을 입력해 주세요.");
      return;
    }
    setSaving(true);
    try {
      const result = await updateProfile({ name: name.trim(), nickname, phone });
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

  function startAddAddress() {
    setEditingAddressId("new");
    setAddressDraft(EMPTY_ADDRESS_FIELDS);
    setAddressError(null);
  }

  function startEditAddress(a: Address) {
    setEditingAddressId(a.id);
    setAddressDraft({
      zonecode: a.zonecode,
      roadAddress: a.roadAddress,
      apartmentName: a.apartmentName,
      detailAddress: a.detailAddress,
      entranceMethod: a.entranceMethod ?? "",
      memo: a.memo ?? "",
    });
    setAddressError(null);
  }

  function cancelAddressEdit() {
    setEditingAddressId(null);
    setAddressError(null);
  }

  async function saveAddressDraft() {
    setAddressError(null);
    if (!addressDraft.roadAddress.trim() || !addressDraft.detailAddress.trim() || !addressDraft.entranceMethod.trim()) {
      setAddressError("배송지(주소검색/상세주소/공동현관 출입방법)를 모두 입력해 주세요.");
      return;
    }
    setAddressSaving(true);
    try {
      if (editingAddressId === "new") {
        await saveAddress({
          profileId: profile.id,
          name: profile.name,
          phone: profile.phone,
          zonecode: addressDraft.zonecode,
          roadAddress: addressDraft.roadAddress,
          apartmentName: addressDraft.apartmentName,
          detailAddress: addressDraft.detailAddress.trim(),
          entranceMethod: addressDraft.entranceMethod.trim(),
          memo: addressDraft.memo.trim() || undefined,
          // 처음 저장하는 배송지라면 자동으로 기본 배송지가 된다 — 그 외엔
          // 명시적으로 "기본으로 설정"을 눌러야 바뀐다(다른 배송지의 기본
          // 지위를 조용히 뺏지 않기 위해).
          isDefault: addresses.length === 0,
        });
      } else if (editingAddressId) {
        await updateAddress(editingAddressId, profile.id, {
          zonecode: addressDraft.zonecode,
          roadAddress: addressDraft.roadAddress,
          apartmentName: addressDraft.apartmentName,
          detailAddress: addressDraft.detailAddress.trim(),
          entranceMethod: addressDraft.entranceMethod.trim(),
          memo: addressDraft.memo.trim() || undefined,
        });
      }
      await refreshAddresses();
      setEditingAddressId(null);
    } catch (e) {
      setAddressError(e instanceof Error ? e.message : "배송지 저장 중 오류가 발생했어요.");
    } finally {
      setAddressSaving(false);
    }
  }

  async function removeAddress(a: Address) {
    if (!confirm("이 배송지를 삭제할까요?")) return;
    try {
      await deleteAddress(a.id, profile.id);
      await refreshAddresses();
    } catch (e) {
      alert(e instanceof Error ? e.message : "삭제 중 오류가 발생했어요.");
    }
  }

  async function makeDefaultAddress(a: Address) {
    try {
      await setDefaultAddress(a.id, profile.id);
      await refreshAddresses();
    } catch (e) {
      alert(e instanceof Error ? e.message : "기본 배송지 설정 중 오류가 발생했어요.");
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
            <div className="mt-1 text-[12.5px] text-text-muted">이름 {profile.name}</div>
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
              <input className="rounded-[9px] border border-border bg-bg-card px-3 py-2.5 text-[13px]" placeholder="이름" value={name} onChange={(e) => setName(e.target.value)} />
              <input className="rounded-[9px] border border-border bg-bg-card px-3 py-2.5 text-[13px]" placeholder="오픈채팅 닉네임" value={nickname} onChange={(e) => setNickname(e.target.value)} />
              <input className="rounded-[9px] border border-border bg-bg-card px-3 py-2.5 text-[13px]" placeholder="휴대폰번호" value={phone} onChange={(e) => setPhone(e.target.value)} />
            </div>

            <div className="flex flex-col gap-2">
              <div className="flex items-center justify-between">
                <p className="text-[11.5px] font-bold text-text-muted">배송지 관리</p>
                {editingAddressId === null && (
                  <button className="text-[12px] font-semibold text-accent-dark" onClick={startAddAddress}>
                    + 새 배송지 추가
                  </button>
                )}
              </div>
              {addressesLoading ? (
                <p className="text-[12px] text-text-muted">불러오는 중...</p>
              ) : (
                <div className="flex flex-col gap-2">
                  {addresses.length === 0 && editingAddressId !== "new" && <p className="text-[12px] text-text-muted">저장된 배송지가 없어요.</p>}
                  {addresses.map((a) =>
                    editingAddressId === a.id ? (
                      <div key={a.id} className="rounded-[9px] border border-accent p-3">
                        <div className="flex flex-col gap-2">
                          <AddressFields value={addressDraft} onChange={(patch) => setAddressDraft((v) => ({ ...v, ...patch }))} />
                          {addressError && <p className="text-[11.5px] font-semibold text-red-600">{addressError}</p>}
                          <div className="flex gap-2">
                            <button
                              className="flex-1 rounded-[8px] bg-accent py-2 text-[12px] font-bold text-white disabled:opacity-50"
                              disabled={addressSaving}
                              onClick={saveAddressDraft}
                            >
                              {addressSaving ? "저장 중..." : "저장"}
                            </button>
                            <button className="flex-1 rounded-[8px] border border-border py-2 text-[12px] font-semibold" onClick={cancelAddressEdit}>
                              취소
                            </button>
                          </div>
                        </div>
                      </div>
                    ) : (
                      <div key={a.id} className="rounded-[9px] border border-border p-3">
                        <div className="flex items-center gap-1.5">
                          {a.isDefault && <span className="rounded-full bg-accent-soft px-2 py-0.5 text-[10.5px] font-bold text-accent-dark">기본</span>}
                          <p className="text-[12.5px] font-semibold">
                            {a.roadAddress} {a.detailAddress}
                          </p>
                        </div>
                        {a.apartmentName && <p className="mt-0.5 text-[11px] text-text-muted">🏢 {a.apartmentName}</p>}
                        <div className="mt-2 flex gap-3 text-[11.5px] font-semibold">
                          {!a.isDefault && (
                            <button className="text-accent-dark" onClick={() => makeDefaultAddress(a)}>
                              기본으로 설정
                            </button>
                          )}
                          <button className="text-text-muted" onClick={() => startEditAddress(a)}>
                            수정
                          </button>
                          <button className="text-red-600" onClick={() => removeAddress(a)}>
                            삭제
                          </button>
                        </div>
                      </div>
                    ),
                  )}
                  {editingAddressId === "new" && (
                    <div className="rounded-[9px] border border-accent p-3">
                      <div className="flex flex-col gap-2">
                        <AddressFields value={addressDraft} onChange={(patch) => setAddressDraft((v) => ({ ...v, ...patch }))} />
                        {addressError && <p className="text-[11.5px] font-semibold text-red-600">{addressError}</p>}
                        <div className="flex gap-2">
                          <button
                            className="flex-1 rounded-[8px] bg-accent py-2 text-[12px] font-bold text-white disabled:opacity-50"
                            disabled={addressSaving}
                            onClick={saveAddressDraft}
                          >
                            {addressSaving ? "저장 중..." : "저장"}
                          </button>
                          <button className="flex-1 rounded-[8px] border border-border py-2 text-[12px] font-semibold" onClick={cancelAddressEdit}>
                            취소
                          </button>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              )}
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
              <button
                className="flex-1 rounded-[8px] border border-border py-2 text-[12.5px] font-semibold"
                onClick={() => {
                  cancelAddressEdit();
                  setEditing(false);
                }}
              >
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
