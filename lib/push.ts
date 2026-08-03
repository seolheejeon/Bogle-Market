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

// enablePush가 실패할 수 있는 이유들 — "받기" 버튼을 눌렀는데 아무 반응이
// 없어 보이는 문제를 막기 위해, 실패하면 항상 이 중 하나로 구체적인 이유를
// 돌려준다(관리자/사용자가 화면에서 바로 원인을 볼 수 있도록).
export type PushEnableFailureReason =
  | "insecure" // HTTPS(또는 localhost)가 아니라 Push API 자체가 없음
  | "unsupported" // 이 브라우저가 Service Worker/PushManager/Notification 중 하나라도 없음
  | "no_vapid_key" // NEXT_PUBLIC_VAPID_PUBLIC_KEY가 빌드에 없음(배포 설정 누락)
  | "permission_denied" // Notification.requestPermission() 결과가 granted가 아님
  | "sw_registration_failed" // 서비스워커가 활성화되지 않음(등록 실패 또는 타임아웃)
  | "subscribe_failed"; // pushManager.subscribe()가 실패(브라우저/네트워크 문제 등)

export type PushEnableResult = { ok: true; subscription: PushSubscriptionPayload } | { ok: false; reason: PushEnableFailureReason; message: string };

export const PUSH_FAILURE_MESSAGE: Record<PushEnableFailureReason, string> = {
  insecure: "HTTPS 연결에서만 알림을 켤 수 있어요.",
  unsupported: "이 브라우저는 웹 푸시를 지원하지 않아요.",
  no_vapid_key: "서버에 푸시 설정이 아직 안 돼 있어요. 잠시 후 다시 시도하거나 관리자에게 알려주세요.",
  permission_denied: "브라우저에서 알림이 차단돼 있어요. 주소창의 사이트 정보에서 알림 권한을 허용으로 바꾼 뒤 다시 시도해주세요.",
  sw_registration_failed: "서비스워커 등록에 실패했어요. 새로고침 후 다시 시도해주세요.",
  subscribe_failed: "구독을 만드는 중 오류가 발생했어요. 다시 시도해주세요.",
};

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

// navigator.serviceWorker.ready는 서비스워커가 "한 번이라도" 활성화되기 전까지는
// 영원히 안 풀리는 프라미스라, 등록 자체가 실패했거나(예: sw.js 404) 아직 아무도
// register()를 안 부른 상태면 여기서 하염없이 멈춰 있는 것처럼 보인다 — 그 상태가
// 바로 "버튼이 비활성화된 것처럼 보인다"는 버그 리포트의 실제 원인일 수 있어서,
// 등록이 없으면 직접 한 번 register()를 시도하고, 그래도 일정 시간 안에 활성화가
// 안 되면 타임아웃으로 확실히 실패 처리한다(무한 대기 대신 원인 표시).
async function getReadyRegistration(timeoutMs = 8000): Promise<ServiceWorkerRegistration> {
  let registration = await navigator.serviceWorker.getRegistration();
  if (!registration) {
    registration = await navigator.serviceWorker.register("/sw.js");
  }
  if (registration.active) return registration;
  return Promise.race([
    navigator.serviceWorker.ready,
    new Promise<ServiceWorkerRegistration>((_, reject) => setTimeout(() => reject(new Error("service-worker-timeout")), timeoutMs)),
  ]);
}

// 알림 권한을 요청하고(이미 허용/거부된 상태면 그대로) 구독을 만들어 서버에
// 저장한다. profileId가 있으면 이 회원 앞으로 오는 알림(배송시작/완료 등)을
// 나중에도 이 기기로 받을 수 있다. 실패하면 항상 구체적인 이유를 돌려준다 —
// 조용히 null만 반환하던 예전 버전이 "눌러도 아무 반응 없음" 버그의 원인이었다.
export async function enablePush(profileId: string | null): Promise<PushEnableResult> {
  if (typeof window === "undefined") {
    return { ok: false, reason: "unsupported", message: PUSH_FAILURE_MESSAGE.unsupported };
  }
  if (!window.isSecureContext) {
    console.error("[push] HTTPS(secure context)가 아니에요:", location.href);
    return { ok: false, reason: "insecure", message: PUSH_FAILURE_MESSAGE.insecure };
  }
  if (!isPushSupported()) {
    console.error("[push] 브라우저 미지원:", {
      serviceWorker: "serviceWorker" in navigator,
      pushManager: "PushManager" in window,
      notification: "Notification" in window,
    });
    return { ok: false, reason: "unsupported", message: PUSH_FAILURE_MESSAGE.unsupported };
  }

  const vapidPublicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
  if (!vapidPublicKey) {
    console.error("[push] NEXT_PUBLIC_VAPID_PUBLIC_KEY가 설정되지 않았어요.");
    return { ok: false, reason: "no_vapid_key", message: PUSH_FAILURE_MESSAGE.no_vapid_key };
  }

  const permission = await Notification.requestPermission();
  if (permission !== "granted") {
    console.warn("[push] 알림 권한이 거부됐어요:", permission);
    return { ok: false, reason: "permission_denied", message: PUSH_FAILURE_MESSAGE.permission_denied };
  }

  let registration: ServiceWorkerRegistration;
  try {
    registration = await getReadyRegistration();
  } catch (e) {
    console.error("[push] 서비스워커 등록/활성화 실패", e);
    return { ok: false, reason: "sw_registration_failed", message: PUSH_FAILURE_MESSAGE.sw_registration_failed };
  }

  try {
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
      const { error } = await supabase.rpc("save_push_subscription", {
        p_profile_id: profileId,
        p_endpoint: payload.endpoint,
        p_p256dh: payload.keys.p256dh,
        p_auth: payload.keys.auth,
        p_user_agent: navigator.userAgent,
      });
      if (error) console.error("[push] 구독 정보 저장 실패(구독 자체는 성공)", error);
    }
    return { ok: true, subscription: payload };
  } catch (e) {
    console.error("[push] pushManager.subscribe 실패", e);
    return { ok: false, reason: "subscribe_failed", message: PUSH_FAILURE_MESSAGE.subscribe_failed };
  }
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
