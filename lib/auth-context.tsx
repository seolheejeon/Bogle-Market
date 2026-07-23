"use client";

import { createContext, useCallback, useContext, useEffect, useState } from "react";
import { getSupabaseBrowserClient, isSupabaseConfigured } from "@/lib/supabase/client";
import { loadAccounts, saveAccounts, loadAuthProfile, saveAuthProfile, genId } from "@/lib/local-store";
import type { Profile } from "@/types";

interface AuthResult {
  error?: string;
}

interface AuthContextValue {
  profile: Profile | null;
  loading: boolean;
  isMockMode: boolean;
  signUp: (input: { email: string; password: string; name: string; phone: string; asAdmin?: boolean }) => Promise<AuthResult>;
  signIn: (email: string, password: string) => Promise<AuthResult>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (isSupabaseConfigured) {
      const supabase = getSupabaseBrowserClient()!;
      supabase.auth.getSession().then(async ({ data }) => {
        if (data.session?.user) {
          const { data: row } = await supabase.from("profiles").select("*").eq("id", data.session.user.id).single();
          if (row) {
            setProfile({ id: row.id, email: row.email, name: row.name, phone: row.phone, isAdmin: row.is_admin });
          }
        }
        setLoading(false);
      });
      const { data: sub } = supabase.auth.onAuthStateChange(async (_event, session) => {
        if (!session?.user) {
          setProfile(null);
          return;
        }
        const { data: row } = await supabase.from("profiles").select("*").eq("id", session.user.id).single();
        if (row) setProfile({ id: row.id, email: row.email, name: row.name, phone: row.phone, isAdmin: row.is_admin });
      });
      return () => sub.subscription.unsubscribe();
    } else {
      setProfile(loadAuthProfile());
      setLoading(false);
    }
  }, []);

  const signUp = useCallback<AuthContextValue["signUp"]>(async ({ email, password, name, phone, asAdmin }) => {
    if (isSupabaseConfigured) {
      const supabase = getSupabaseBrowserClient()!;
      const { data, error } = await supabase.auth.signUp({ email, password });
      if (error) return { error: error.message };
      const userId = data.user?.id;
      if (!userId) return { error: "이메일 인증 후 로그인해주세요." };
      const { error: profileError } = await supabase.from("profiles").insert({ id: userId, email, name, phone, is_admin: false });
      if (profileError) return { error: profileError.message };
      setProfile({ id: userId, email, name, phone, isAdmin: false });
      return {};
    }
    const accounts = loadAccounts();
    if (accounts[email]) return { error: "이미 가입된 이메일이에요." };
    const newProfile: Profile = { id: genId("user"), email, name, phone, isAdmin: Boolean(asAdmin) };
    accounts[email] = { password, profile: newProfile };
    saveAccounts(accounts);
    saveAuthProfile(newProfile);
    setProfile(newProfile);
    return {};
  }, []);

  const signIn = useCallback<AuthContextValue["signIn"]>(async (email, password) => {
    if (isSupabaseConfigured) {
      const supabase = getSupabaseBrowserClient()!;
      const { data, error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) return { error: error.message };
      const userId = data.user?.id;
      if (userId) {
        const { data: row } = await supabase.from("profiles").select("*").eq("id", userId).single();
        if (row) setProfile({ id: row.id, email: row.email, name: row.name, phone: row.phone, isAdmin: row.is_admin });
      }
      return {};
    }
    const accounts = loadAccounts();
    const account = accounts[email];
    if (!account || account.password !== password) return { error: "이메일 또는 비밀번호가 올바르지 않아요." };
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

  return (
    <AuthContext.Provider value={{ profile, loading, isMockMode: !isSupabaseConfigured, signUp, signIn, signOut }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
