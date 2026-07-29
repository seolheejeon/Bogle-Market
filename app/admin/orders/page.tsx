import { redirect } from "next/navigation";

// 주문 관리는 운영 메인(/admin)에 통합됐다 — 옛 링크/북마크가 계속 동작하도록
// 리다이렉트만 남겨둔다.
export default function AdminOrdersRedirectPage() {
  redirect("/admin");
}
