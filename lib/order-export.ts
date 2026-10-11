// 관리자 주문 목록을 엑셀에서 바로 열리는 CSV로 내려받는다(별도 라이브러리 없음).
// 한 줄 = 주문 상품 한 줄 — 발주(상품·옵션별 수량)와 배송(주소) 양쪽에 쓰기
// 좋도록. 주문 단위 값(할인/결제금액 등)은 그 주문의 첫 줄에만 적어서 엑셀에서
// 합계를 내도 두 번 더해지지 않게 한다. 한글이 엑셀에서 깨지지 않도록 UTF-8 BOM을 붙인다.

import type { MarketEvent, Order } from "@/types";
import { EVENT_TYPE_LABEL, ORDER_STATUS_LABEL, PAYMENT_METHOD_LABEL } from "@/types";
import { formatDateTime } from "@/lib/format";

const HEADERS = [
  "주문번호",
  "주문일시",
  "주문상태",
  "배송방식",
  "회차",
  "주문자",
  "주문자 연락처",
  "회원/비회원",
  "받는 분",
  "받는 분 연락처",
  "아파트",
  "주소",
  "상세주소",
  "공동현관 출입방법",
  "배송메모",
  "상품",
  "옵션",
  "수량",
  "단가",
  "상품금액",
  "결제수단",
  "입금자명",
  "할인(주문)",
  "배송비(주문)",
  "결제금액(주문)",
];

// 쉼표/줄바꿈/따옴표가 들어간 값은 따옴표로 감싸고, 엑셀이 수식으로 해석할 수
// 있는 값(=, +, -, @로 시작)은 앞에 '를 붙여 그냥 글자로 보이게 한다.
function cell(value: string | number | null | undefined): string {
  if (value === null || value === undefined) return "";
  if (typeof value === "number") return String(value);
  let s = value;
  if (/^[=+\-@]/.test(s)) s = `'${s}`;
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export function buildOrdersCsv(orders: Order[], eventById: Map<string, MarketEvent>, ordererName: (o: Order) => string): string {
  const rows: (string | number | null | undefined)[][] = [HEADERS];
  for (const o of orders) {
    const ev = eventById.get(o.eventId);
    o.items.forEach((item, i) => {
      const first = i === 0;
      rows.push([
        o.orderNumber,
        formatDateTime(o.createdAt),
        ORDER_STATUS_LABEL[o.status] + (o.cancelRequested ? "(취소요청)" : ""),
        ev ? EVENT_TYPE_LABEL[ev.type] : "",
        ev?.title ?? "",
        ordererName(o),
        o.profileId ? "" : o.guestPhone,
        o.profileId ? "회원" : "비회원",
        o.recipientName,
        o.recipientPhone,
        o.apartmentName,
        o.roadAddress ?? o.addressSnapshot,
        o.detailAddress,
        o.entranceMethod,
        o.deliveryMemo,
        item.productName,
        item.options?.map((opt) => opt.valueName).join(" / ") ?? "",
        item.quantity,
        item.price,
        item.price * item.quantity,
        first ? PAYMENT_METHOD_LABEL[o.paymentMethod] : "",
        first ? (o.depositorName ?? (o.paymentMethod === "bank_transfer" ? o.recipientName : "")) : "",
        first ? o.discountTotal : "",
        first ? o.shippingFee : "",
        first ? o.total : "",
      ]);
    });
  }
  return "﻿" + rows.map((r) => r.map(cell).join(",")).join("\r\n");
}

export function downloadCsv(filename: string, csv: string) {
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}
