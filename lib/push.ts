// 웹 푸시 구독 관리 — 순수 브라우저 API(PushManager)를 다루는 부분과, 구독
// 정보를 서버에 저장/발송 요청하는 부분을 한 파일에 모았다. 회원/공지 발송처럼
// 다른 사용자의 구독을 조회해야 하는 경로는 app/api/push/send가 관리자 확인
// 후 서비스 롤 키로 처리하고(lib/supabase/server.ts 참고), 여기는 그 API를
// 호출만 한다. Supabase가 설정 안 된 mock 모드에서는 구독 자체(브라우저 쪽)는
// 되지만 서버에 저장이 안 되니, 나중에(배송시작 등) 다시 찾아 보내는 발송은
// 동작하지 않는다 — "방금 만든 구독으로 바로 한 번 보내기"(주문 완료)는
// DB 조회가 필요 없어서 mock 모드에서도 그대로 동작한다.

import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import type { PushNotificationPayload, PushSubscriptionPayload } from "@/types";

export function isPushSupported(): boolean {
  return typeof window !== "undefined" && "serviceWorker" in navigator && "PushManager" in window && "Notification" in window;
}

export function getNotificationPermission(): NotificationPermission | "unsupported" {
  if (!isPushSupported()) return "unsupported";
  return Notification.permission;
}

function urlBase64ToUint8Array(base64String: string): Uint8Array<ArrayBuffer> {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(base64);
  const output = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) output[i] = raw.charCodeAt(i);
  return output;
}

function toPayload(subscription: PushSubscription): PushSubscriptionPayload {
  const json = subscription.toJSON();
  return { endpoint: json.endpoint as string, keys: { p256dh: json.keys!.p256dh as string, auth: json.keys!.auth as string } };
}

// 알림 권한을 요청하고(이미 허용/거부된 상태면 그대로) 구독을 만들어 서버에
// 저장한다. profileId가 있으면 이 회원 앞으로 오는 알림(배송시작/완료 등)을
// 나중에도 이 기기로 받을 수 있다.
export async function enablePush(profileId: string | null): Promise<PushSubscriptionPayload | null> {
  if (!isPushSupported()) return null;
  const vapidPublicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
  if (!vapidPublicKey) return null;

  const permission = await Notification.requestPermission();
  if (permission !== "granted") return null;

  const registration = await navigator.serviceWorker.ready;
  let subscription = await registration.pushManager.getSubscription();
  if (!subscription) {
    subscription = await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(vapidPublicKey),
    });
  }
  const payload = toPayload(subscription);

  const supabase = getSupabaseBrowserClient();
  if (supabase) {
    await supabase.rpc("save_push_subscription", {
      p_profile_id: profileId,
      p_endpoint: payload.endpoint,
      p_p256dh: payload.keys.p256dh,
      p_auth: payload.keys.auth,
      p_user_agent: navigator.userAgent,
    });
  }
  return payload;
}

export async function disablePush(): Promise<void> {
  if (!isPushSupported()) return;
  const registration = await navigator.serviceWorker.getRegistration();
  const subscription = await registration?.pushManager.getSubscription();
  if (!subscription) return;
  const endpoint = subscription.endpoint;
  await subscription.unsubscribe();
  const supabase = getSupabaseBrowserClient();
  if (supabase) await supabase.rpc("delete_push_subscription", { p_endpoint: endpoint });
}

export async function getCurrentPushSubscription(): Promise<PushSubscriptionPayload | null> {
  if (!isPushSupported()) return null;
  const registration = await navigator.serviceWorker.getRegistration();
  const subscription = await registration?.pushManager.getSubscription();
  return subscription ? toPayload(subscription) : null;
}

export async function getAccessToken(): Promise<string | null> {
  const supabase = getSupabaseBrowserClient();
  if (!supabase) return null;
  const { data } = await supabase.auth.getSession();
  return data.session?.access_token ?? null;
}

async function callSendApi(body: Record<string, unknown>): Promise<void> {
  try {
    await fetch("/api/push/send", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  } catch (e) {
    console.error("[push] 발송 요청 실패", e);
  }
}

// 방금 만든 구독 하나로 즉시 보낸다(예: 주문 완료 직후) — 다른 사용자 데이터를
// 건드리지 않아 별도 인증 없이 호출한다.
export async function sendPushToSelf(subscription: PushSubscriptionPayload, payload: PushNotificationPayload): Promise<void> {
  await callSendApi({ subscription, payload });
}

// 특정 회원에게 — 관리자 세션의 액세스 토큰이 필요하다.
export async function sendPushToProfile(profileId: string, payload: PushNotificationPayload, accessToken: string): Promise<void> {
  await fetch("/api/push/send", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${accessToken}` },
    body: JSON.stringify({ profileId, payload }),
  }).catch((e) => console.error("[push] 발송 요청 실패", e));
}

// 전체 발송 — 관리자 세션의 액세스 토큰이 필요하다.
export async function sendPushBroadcast(payload: PushNotificationPayload, accessToken: string): Promise<void> {
  await fetch("/api/push/send", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${accessToken}` },
    body: JSON.stringify({ broadcast: true, payload }),
  }).catch((e) => console.error("[push] 발송 요청 실패", e));
}
