import { createClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;

// RLS를 완전히 우회하는 서버 전용 클라이언트 — 웹 푸시 발송처럼 여러 사용자의
// 데이터를 넘나들며 읽어야 하는 신뢰된 서버 코드에서만 쓴다. 이 클라이언트가
// 만들어내는 데이터는 절대 그대로 브라우저 응답에 실어 보내면 안 된다.
export function getSupabaseServiceRoleClient() {
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceRoleKey) return null;
  return createClient(url, serviceRoleKey, { auth: { persistSession: false } });
}

// 요청을 보낸 사용자의 액세스 토큰을 그대로 실어, 그 사용자 권한으로 RLS가
// 적용되는 클라이언트를 만든다 — is_admin() RPC로 "이 요청이 정말 관리자가
// 보낸 게 맞는지"를 서버에서 다시 한번 확인할 때 쓴다(클라이언트가 보낸
// "나는 관리자예요" 주장을 그대로 믿지 않기 위함).
export function getSupabaseUserClient(accessToken: string) {
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anonKey) return null;
  return createClient(url, anonKey, {
    auth: { persistSession: false },
    global: { headers: { Authorization: `Bearer ${accessToken}` } },
  });
}
