import { NextRequest, NextResponse } from "next/server";

// 스마트택배(SweetTracker) 조회 API를 프록시한다 — API 키를 서버에만 두기
// 위해 클라이언트가 직접 호출하지 않고 이 라우트를 거친다. 키가 아직 없거나
// (SWEETTRACKER_API_KEY 미설정) 호출이 실패하면 ok:false를 돌려주고,
// 클라이언트는 그 경우 택배사 공식 조회 페이지로 대신 안내한다(COURIER_TRACKING_URL).
//
// 응답 필드명은 스마트택배 공개 문서/사례를 기반으로 했다 — 실제 서비스 전에
// 발급받은 키로 한 번 호출해 실제 응답과 대조해볼 것.

const LEVEL_LABEL: Record<number, string> = {
  1: "상품 접수",
  2: "집화 완료",
  3: "간선 상차",
  4: "간선 하차",
  5: "배송 출발",
  6: "배송 완료",
};

interface SweetTrackerDetail {
  kind?: string;
  timeString?: string;
  where?: string;
  telno?: string;
  manName?: string;
}

interface SweetTrackerResponse {
  status?: boolean;
  msg?: string;
  level?: number;
  complete?: boolean;
  itemName?: string;
  estimate?: string;
  trackingDetails?: SweetTrackerDetail[];
}

export async function GET(request: NextRequest) {
  const courier = request.nextUrl.searchParams.get("courier");
  const invoice = request.nextUrl.searchParams.get("invoice");
  if (!courier || !invoice) {
    return NextResponse.json({ ok: false, reason: "error", message: "잘못된 요청이에요." }, { status: 400 });
  }

  const apiKey = process.env.SWEETTRACKER_API_KEY;
  if (!apiKey) {
    return NextResponse.json({ ok: false, reason: "not_configured" });
  }

  try {
    const url = `https://info.sweettracker.co.kr/api/v1/trackingInfo?t_key=${encodeURIComponent(apiKey)}&t_code=${encodeURIComponent(courier)}&t_invoice=${encodeURIComponent(invoice)}`;
    const res = await fetch(url, { cache: "no-store" });
    if (!res.ok) return NextResponse.json({ ok: false, reason: "error" });
    const data: SweetTrackerResponse = await res.json();
    if (data.status === false) {
      return NextResponse.json({ ok: false, reason: "error", message: data.msg ?? "배송 정보를 찾을 수 없어요." });
    }

    const events = (data.trackingDetails ?? []).map((d) => ({
      time: d.timeString ?? "",
      location: d.where ?? "",
      description: d.kind ?? "",
    }));

    return NextResponse.json({
      ok: true,
      statusText: LEVEL_LABEL[data.level ?? 0] ?? (data.complete ? "배송 완료" : "배송 중"),
      itemName: data.itemName,
      estimate: data.estimate,
      events,
    });
  } catch {
    return NextResponse.json({ ok: false, reason: "error" });
  }
}
