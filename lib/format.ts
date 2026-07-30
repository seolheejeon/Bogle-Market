export function formatPrice(value: number): string {
  return `${value.toLocaleString("ko-KR")}원`;
}

export function formatCountdown(targetIso: string): string {
  const ms = new Date(targetIso).getTime() - Date.now();
  if (ms <= 0) return "마감되었어요";
  const totalSeconds = Math.floor(ms / 1000);
  const h = Math.floor(totalSeconds / 3600);
  const m = Math.floor((totalSeconds % 3600) / 60);
  const s = totalSeconds % 60;
  const pad = (n: number) => String(n).padStart(2, "0");
  return `마감까지 ${h > 0 ? pad(h) + ":" : ""}${pad(m)}:${pad(s)} 남았어요`;
}

export function formatDeadlineLabel(targetIso: string): string {
  const date = new Date(targetIso);
  const now = new Date();
  const isToday = date.toDateString() === now.toDateString();
  const timeStr = date.toLocaleTimeString("ko-KR", { hour: "numeric", minute: "2-digit", hour12: true });
  return `${isToday ? "오늘" : `${date.getMonth() + 1}.${date.getDate()}.`} ${timeStr} 마감`;
}

// Concise variants used on the home screen only (deadline-soon cards).
export function formatDeadlineShort(targetIso: string): string {
  const date = new Date(targetIso);
  const now = new Date();
  const isToday = date.toDateString() === now.toDateString();
  const hourLabel = date.toLocaleTimeString("ko-KR", { hour: "numeric", hour12: true });
  return isToday ? `오늘 ${hourLabel} 마감` : `${date.getMonth() + 1}.${date.getDate()} ${hourLabel} 마감`;
}

export function formatCountdownShort(targetIso: string): string {
  const ms = new Date(targetIso).getTime() - Date.now();
  if (ms <= 0) return "마감됨";
  const totalMinutes = Math.floor(ms / 60000);
  if (totalMinutes < 60) return `${totalMinutes}분 남음`;
  const totalHours = Math.floor(totalMinutes / 60);
  if (totalHours < 24) {
    const m = totalMinutes % 60;
    return m > 0 ? `${totalHours}시간 ${m}분 남음` : `${totalHours}시간 남음`;
  }
  const days = Math.floor(totalHours / 24);
  return `${days}일 남음`;
}

const WEEKDAY_KR = ["일", "월", "화", "수", "목", "금", "토"];

// e.g. "7/24(금)" — used for the category screen's event date chips.
export function formatEventDateChip(iso: string): string {
  const date = new Date(iso);
  return `${date.getMonth() + 1}/${date.getDate()}(${WEEKDAY_KR[date.getDay()]})`;
}

export function formatDateTime(iso: string): string {
  return new Date(iso).toLocaleString("ko-KR", { year: "numeric", month: "long", day: "numeric", hour: "numeric", minute: "2-digit" });
}

// <input type="date">가 쓰는 "YYYY-MM-DD" 값. 배송일처럼 시각은 의미 없고
// 날짜만 관리하는 필드에 쓴다 — 주문 마감처럼 시각까지 필요한 곳은 여전히
// datetime-local(각 화면의 toLocalInputValue)을 그대로 쓴다.
export function toDateInputValue(iso: string): string {
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

// "YYYY-MM-DD" 입력값을 ISO 문자열로 되돌린다. 자정(00:00)으로 저장하면 UTC
// 변환 과정에서 타임존에 따라 날짜가 하루 밀릴 수 있어, 정오(12:00) 기준으로
// 저장해 그 여지를 없앤다(어차피 시각은 화면 어디에도 노출되지 않음).
export function dateInputValueToIso(dateStr: string): string {
  return new Date(`${dateStr}T12:00`).toISOString();
}
