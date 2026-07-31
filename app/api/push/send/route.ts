import { NextRequest, NextResponse } from "next/server";
import webpush, { WebPushError } from "web-push";
import { getSupabaseServiceRoleClient, getSupabaseUserClient } from "@/lib/supabase/server";
import type { PushNotificationPayload, PushSubscriptionPayload } from "@/types";

// 웹 푸시 발송 — 세 가지 방식 중 하나로 호출된다.
// 1) subscription을 직접 실어 보내면(예: 주문 완료 직후, 방금 구독한 이 기기
//    앞으로) DB 조회 없이 그 자리에서 바로 보낸다 — 별도 인증이 필요 없다.
// 2) profileId를 실어 보내면 그 회원의 모든 구독 기기로 보낸다(관리자의
//    주문 상태 변경 알림).
// 3) broadcast:true면 전체 구독 기기로 보낸다(관리자 공지).
// 2)/3)은 다른 사용자의 구독 정보를 읽어야 해서, 요청자의 액세스 토큰으로
// is_admin()을 다시 확인한 뒤에만 서비스 롤 키로 조회/발송한다.

const vapidPublicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
const vapidPrivateKey = process.env.VAPID_PRIVATE_KEY;

if (vapidPublicKey && vapidPrivateKey) {
  webpush.setVapidDetails("mailto:hello@boglemarket.kr", vapidPublicKey, vapidPrivateKey);
}

interface SendBody {
  payload: PushNotificationPayload;
  subscription?: PushSubscriptionPayload;
  profileId?: string;
  broadcast?: boolean;
}

async function sendToOne(subscription: PushSubscriptionPayload, payload: PushNotificationPayload): Promise<boolean> {
  try {
    await webpush.sendNotification(subscription, JSON.stringify(payload));
    return true;
  } catch (e) {
    // 410 Gone / 404 Not Found = 브라우저가 구독을 이미 해지했다는 뜻이라
    // DB에도 더 이상 남겨둘 필요가 없다(다음 발송에서 또 실패하지 않도록).
    if (e instanceof WebPushError && (e.statusCode === 410 || e.statusCode === 404)) {
      const service = getSupabaseServiceRoleClient();
      await service?.from("push_subscriptions").delete().eq("endpoint", subscription.endpoint);
    } else {
      console.error("[push] 발송 실패", e);
    }
    return false;
  }
}

export async function POST(request: NextRequest) {
  if (!vapidPublicKey || !vapidPrivateKey) {
    return NextResponse.json({ ok: false, reason: "not_configured" });
  }

  let body: SendBody;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ ok: false, reason: "error" }, { status: 400 });
  }
  if (!body.payload?.title || !body.payload?.body) {
    return NextResponse.json({ ok: false, reason: "error" }, { status: 400 });
  }

  if (body.subscription) {
    const sent = await sendToOne(body.subscription, body.payload);
    return NextResponse.json({ ok: sent });
  }

  if (!body.profileId && !body.broadcast) {
    return NextResponse.json({ ok: false, reason: "error" }, { status: 400 });
  }

  const authHeader = request.headers.get("authorization");
  const accessToken = authHeader?.startsWith("Bearer ") ? authHeader.slice(7) : null;
  if (!accessToken) return NextResponse.json({ ok: false, reason: "unauthorized" }, { status: 401 });

  const userClient = getSupabaseUserClient(accessToken);
  if (!userClient) return NextResponse.json({ ok: false, reason: "not_configured" });
  const { data: isAdmin, error: adminCheckError } = await userClient.rpc("is_admin");
  if (adminCheckError || !isAdmin) return NextResponse.json({ ok: false, reason: "unauthorized" }, { status: 403 });

  const service = getSupabaseServiceRoleClient();
  if (!service) return NextResponse.json({ ok: false, reason: "not_configured" });

  const query = service.from("push_subscriptions").select("endpoint, p256dh, auth");
  const { data: subs, error } = body.broadcast ? await query : await query.eq("profile_id", body.profileId as string);
  if (error) return NextResponse.json({ ok: false, reason: "error" });

  const results = await Promise.all(
    (subs ?? []).map((s) => sendToOne({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } }, body.payload)),
  );
  return NextResponse.json({ ok: true, sent: results.filter(Boolean).length, total: results.length });
}
