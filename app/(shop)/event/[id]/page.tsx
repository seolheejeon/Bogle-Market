import { EventDetailView } from "@/components/Event/EventDetailView";

// 껍데기만 서버에서 만들고 데이터는 브라우저가 받아오므로 CDN에 캐시해 둔다(상품 상세와 같은 이유).
export const revalidate = 300;
// 미리 만들어 둘 페이지는 없고, 처음 들어온 순간 만들어 캐시한다(빈 목록이어야 ISR로 동작).
export async function generateStaticParams() {
  return [];
}

export default async function EventPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <EventDetailView eventId={id} />;
}
