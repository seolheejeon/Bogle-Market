import type { Metadata } from "next";
import { ProductDetailView } from "@/components/Product/ProductDetailView";
import { getProductOgData } from "@/lib/og";
import { formatPrice } from "@/lib/format";

// 페이지를 5분간 캐시(CDN)한다 — 인기 상품 오픈 때 손님들이 상품 상세를 계속
// 새로고침해도 매번 서버(Netlify 함수)를 돌리지 않게(2026-11-01). 가격·재고 같은
// 실제 화면 데이터는 브라우저가 따로 실시간으로 받아오니, 캐시되는 건 카톡 미리보기용
// 제목·설명·사진뿐이다(최대 5분 늦게 바뀜).
export const revalidate = 300;
// 미리 만들어 둘 페이지는 없고, 처음 들어온 순간 만들어 캐시한다(빈 목록이어야 ISR로 동작).
export async function generateStaticParams() {
  return [];
}

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const { id } = await params;
  const data = await getProductOgData(id);
  if (!data) return { title: "보글마켓" };

  const title = data.name;
  const description = `${formatPrice(data.price)} · ${data.description?.trim() || "보글마켓에서 만나보세요"}`;
  // og:url은 일부러 넣지 않는다 — 없으면 카톡이 공유된 링크 그대로 연다. 예전엔 요청
  // 주소(host 헤더)로 채웠는데, 헤더를 읽으면 페이지를 캐시할 수 없고 고정 주소를 쓰면
  // 사이트 이름을 바꿨을 때 "Site not found"가 떴다.
  const images = data.imageUrl ? [{ url: data.imageUrl }] : undefined;

  return {
    title,
    description,
    openGraph: { title, description, siteName: "보글마켓", images, type: "website", locale: "ko_KR" },
    twitter: { card: images ? "summary_large_image" : "summary", title, description, images: data.imageUrl ? [data.imageUrl] : undefined },
  };
}

export default async function ProductPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <ProductDetailView productId={id} />;
}
