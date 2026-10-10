import { OrderDetailView } from "@/components/Orders/OrderDetailView";

export default async function OrderDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ gn?: string; pin?: string; new?: string }>;
}) {
  const { id } = await params;
  const { gn, pin, new: justOrdered } = await searchParams;
  // gn/pin 쿼리는 예전 링크 호환용 — OrderDetailView가 탭에 옮겨 담고 주소에서 지운다.
  // new=1은 체크아웃 직후 — "주문 접수 완료" 안내를 띄운다.
  return <OrderDetailView orderId={id} legacyGuestName={gn} legacyGuestPin={pin} justOrdered={justOrdered === "1"} />;
}
