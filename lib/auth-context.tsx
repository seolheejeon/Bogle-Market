"use client";

import { createContext, useCallback, useContext, useEffect, useState } from "react";
import { getSupabaseBrowserClient, isSupabaseConfigured } from "@/lib/supabase/client";
import { loadAccounts, saveAccounts, loadAuthProfile, saveAuthProfile, genId } from "@/lib/local-store";
import { saveAddress } from "@/lib/data";
import type { Profile } from "@/types";

interface AuthResult {
  error?: string;
}

export interface SignUpAddressInput {
  zonecode: string;
  roadAddress: string;
  apartmentName: string;
  detailAddress: string;
  entranceMethod?: string;
  memo?: string;
}

interface AuthContextValue {
  profile: Profile | null;
  loading: boolean;
  isMockMode: boolean;
  signUp: (input: { username: string; password: string; name: string; nickname: string; phone: string; address: SignUpAddressInput; asAdmin?: boolean }) => Promise<AuthResult>;
  signIn: (username: string, password: string) => Promise<AuthResult>;
  signOut: () => Promise<void>;
  updateProfile: (patch: Partial<Pick<Profile, "name" | "nickname" | "phone">>) => Promise<AuthResult>;
  changePassword: (newPassword: string) => Promise<AuthResult>;
  checkUsernameTaken: (username: string) => Promise<boolean>;
  checkPhoneTaken: (phone: string) => Promise<boolean>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

// Supabase Auth needs an email-shaped identifier; the user never picks or
// sees this — only a username. Never send anything to this domain.
// ⚠️ Must be a syntactically ordinary domain — Supabase Auth rejects IANA
// special-use/reserved TLDs (.internal, .test, .example, .invalid, ...) at
// signup with "Email address is invalid", so something like "bogle.internal"
// doesn't work even though no real mail is ever sent here.
function toInternalEmail(username: string): string {
  return `${username}@bogle-users.com`;
}

function mapProfileRow(row: Record<string, any>): Profile {
  return {
    id: row.id,
    username: row.username,
    name: row.name ?? "",
    nickname: row.nickname,
    phone: row.phone,
    isAdmin: row.is_admin,
    createdAt: row.created_at,
  };
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (isSupabaseConfigured) {
      const supabase = getSupabaseBrowserClient()!;
      supabase.auth.getSession().then(async ({ data }) => {
        if (data.session?.user) {
          const { data: row } = await supabase.from("profiles").select("*").eq("id", data.session.user.id).single();
          if (row) setProfile(mapProfileRow(row));
        }
        setLoading(false);
      });
      const { data: sub } = supabase.auth.onAuthStateChange(async (_event, session) => {
        if (!session?.user) {
          setProfile(null);
          return;
        }
        const { data: row } = await supabase.from("profiles").select("*").eq("id", session.user.id).single();
        if (row) setProfile(mapProfileRow(row));
      });
      return () => sub.subscription.unsubscribe();
    } else {
      setProfile(loadAuthProfile());
      setLoading(false);
    }
  }, []);

  const signUp = useCallback<AuthContextValue["signUp"]>(async ({ username, password, name, nickname, phone, address, asAdmin }) => {
    if (isSupabaseConfigured) {
      const supabase = getSupabaseBrowserClient()!;
      const { data, error } = await supabase.auth.signUp({ email: toInternalEmail(username), password });
      if (error) return { error: error.message };
      const userId = data.user?.id;
      if (!userId) return { error: "가입에 실패했어요. 잠시 후 다시 시도해주세요." };
      const { error: profileError } = await supabase.from("profiles").insert({ id: userId, username, name, nickname, phone, is_admin: false });
      if (profileError) return { error: profileError.message };
      await saveAddress({
        profileId: userId,
        name,
        phone,
        zonecode: address.zonecode,
        roadAddress: address.roadAddress,
        apartmentName: address.apartmentName,
        detailAddress: address.detailAddress,
        entranceMethod: address.entranceMethod,
        memo: address.memo,
        isDefault: true,
      });
      const newProfile: Profile = { id: userId, username, name, nickname, phone, isAdmin: false, createdAt: new Date().toISOString() };
      setProfile(newProfile);
      return {};
    }
    const accounts = loadAccounts();
    if (accounts[username]) return { error: "이미 사용 중인 아이디예요." };
    if (Object.values(accounts).some((a) => a.profile.phone === phone)) return { error: "이미 가입된 휴대폰번호예요." };
    const newProfile: Profile = { id: genId("user"), username, name, nickname, phone, isAdmin: Boolean(asAdmin), createdAt: new Date().toISOString() };
    accounts[username] = { password, profile: newProfile };
    saveAccounts(accounts);
    saveAuthProfile(newProfile);
    await saveAddress({
      profileId: newProfile.id,
      name,
      phone,
      zonecode: address.zonecode,
      roadAddress: address.roadAddress,
      apartmentName: address.apartmentName,
      detailAddress: address.detailAddress,
      entranceMethod: address.entranceMethod,
      memo: address.memo,
      isDefault: true,
    });
    setProfile(newProfile);
    return {};
  }, []);

  const signIn = useCallback<AuthContextValue["signIn"]>(async (username, password) => {
    if (isSupabaseConfigured) {
      const supabase = getSupabaseBrowserClient()!;
      const { data, error } = await supabase.auth.signInWithPassword({ email: toInternalEmail(username), password });
      if (error) return { error: "아이디 또는 비밀번호가 올바르지 않아요." };
      const userId = data.user?.id;
      if (userId) {
        const { data: row } = await supabase.from("profiles").select("*").eq("id", userId).single();
        if (row) setProfile(mapProfileRow(row));
      }
      return {};
    }
    const accounts = loadAccounts();
    const account = accounts[username];
    if (!account || account.password !== password) return { error: "아이디 또는 비밀번호가 올바르지 않아요." };
    saveAuthProfile(account.profile);
    setProfile(account.profile);
    return {};
  }, []);

  const signOut = useCallback(async () => {
    if (isSupabaseConfigured) {
      const supabase = getSupabaseBrowserClient()!;
      await supabase.auth.signOut();
    } else {
      saveAuthProfile(null);
    }
    setProfile(null);
  }, []);

  const updateProfile = useCallback<AuthContextValue["updateProfile"]>(
    async (patch) => {
      if (!profile) return { error: "로그인이 필요해요." };
      if (isSupabaseConfigured) {
        const supabase = getSupabaseBrowserClient()!;
        const row: Record<string, unknown> = {};
        if (patch.name !== undefined) row.name = patch.name;
        if (patch.nickname !== undefined) row.nickname = patch.nickname;
        if (patch.phone !== undefined) row.phone = patch.phone;
        const { error } = await supabase.from("profiles").update(row).eq("id", profile.id);
        if (error) return { error: error.message };
        setProfile({ ...profile, ...patch });
        return {};
      }
      const updated: Profile = { ...profile, ...patch };
      const accounts = loadAccounts();
      const account = accounts[profile.username];
      if (account) {
        account.profile = updated;
        saveAccounts(accounts);
      }
      saveAuthProfile(updated);
      setProfile(updated);
      return {};
    },
    [profile],
  );

  const changePassword = useCallback<AuthContextValue["changePassword"]>(
    async (newPassword) => {
      if (!profile) return { error: "로그인이 필요해요." };
      if (isSupabaseConfigured) {
        const supabase = getSupabaseBrowserClient()!;
        const { error } = await supabase.auth.updateUser({ password: newPassword });
        if (error) return { error: error.message };
        return {};
      }
      const accounts = loadAccounts();
      const account = accounts[profile.username];
      if (account) {
        account.password = newPassword;
        saveAccounts(accounts);
      }
      return {};
    },
    [profile],
  );

  const checkUsernameTaken = useCallback<AuthContextValue["checkUsernameTaken"]>(async (username) => {
    if (isSupabaseConfigured) {
      const supabase = getSupabaseBrowserClient()!;
      const { data, error } = await supabase.rpc("is_username_taken", { p_username: username });
      if (error) throw error;
      return Boolean(data);
    }
    return Boolean(loadAccounts()[username]);
  }, []);

  const checkPhoneTaken = useCallback<AuthContextValue["checkPhoneTaken"]>(async (phone) => {
    if (isSupabaseConfigured) {
      const supabase = getSupabaseBrowserClient()!;
      const { data, error } = await supabase.rpc("is_phone_taken", { p_phone: phone });
      if (error) throw error;
      return Boolean(data);
    }
    return Object.values(loadAccounts()).some((a) => a.profile.phone === phone);
  }, []);

  return (
    <AuthContext.Provider
      value={{
        profile,
        loading,
        isMockMode: !isSupabaseConfigured,
        signUp,
        signIn,
        signOut,
        updateProfile,
        changePassword,
        checkUsernameTaken,
        checkPhoneTaken,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
