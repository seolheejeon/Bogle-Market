// 휴대폰번호를 입력하는 대로 010-1111-2222 모양으로 맞춘다. 숫자만 남기고
// 최대 11자리까지 받으며, 지역번호(02)·10자리 번호도 자연스럽게 끊어 준다.
export function formatPhone(input: string | null | undefined): string {
  const d = (input ?? "").replace(/\D/g, "").slice(0, 11);
  if (d.startsWith("02")) {
    if (d.length <= 2) return d;
    if (d.length <= 5) return `${d.slice(0, 2)}-${d.slice(2)}`;
    if (d.length <= 9) return `${d.slice(0, 2)}-${d.slice(2, d.length - 4)}-${d.slice(-4)}`;
    return `${d.slice(0, 2)}-${d.slice(2, 6)}-${d.slice(6, 10)}`;
  }
  if (d.length <= 3) return d;
  if (d.length <= 7) return `${d.slice(0, 3)}-${d.slice(3)}`;
  // 010은 항상 11자리라 입력 도중에도 3-4-4로 끊어야 하이픈이 왔다갔다하지 않는다.
  if (d.length <= 10 && !d.startsWith("010")) return `${d.slice(0, 3)}-${d.slice(3, 6)}-${d.slice(6)}`;
  return `${d.slice(0, 3)}-${d.slice(3, 7)}-${d.slice(7)}`;
}
