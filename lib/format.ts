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

export function formatDateTime(iso: string): string {
  return new Date(iso).toLocaleString("ko-KR", { year: "numeric", month: "long", day: "numeric", hour: "numeric", minute: "2-digit" });
}
