import type { Metadata } from "next";
import { headers } from "next/headers";
import { ProductDetailView } from "@/components/Product/ProductDetailView";
import { getProductOgData } from "@/lib/og";
import { buildProductShareUrl } from "@/lib/share";
import { formatPrice } from "@/lib/format";

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const { id } = await params;
  const data = await getProductOgData(id);
  if (!data) return { title: "보글마켓" };

  const title = data.name;
  const description = `${formatPrice(data.price)} · ${data.description?.trim() || "보글마켓에서 만나보세요"}`;
  // 미리보기(og:url)는 지금 손님이 들어온 주소 그대로 — 고정 주소를 쓰면 Netlify
  // 사이트 이름을 바꿨을 때(예: STG를 bogle-market → bogle-market-stg) 카톡 미리보기가
  // 없어진 옛 주소로 열려 "Site not found"가 떴다.
  const requestHeaders = await headers();
  const host = requestHeaders.get("x-forwarded-host") ?? requestHeaders.get("host");
  const proto = requestHeaders.get("x-forwarded-proto") ?? "https";
  const url = buildProductShareUrl(id, {}, host ? `${proto}://${host}` : undefined);
  const images = data.imageUrl ? [{ url: data.imageUrl }] : undefined;

  return {
    title,
    description,
    openGraph: { title, description, url, siteName: "보글마켓", images, type: "website", locale: "ko_KR" },
    twitter: { card: images ? "summary_large_image" : "summary", title, description, images: data.imageUrl ? [data.imageUrl] : undefined },
  };
}

export default async function ProductPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <ProductDetailView productId={id} />;
}
