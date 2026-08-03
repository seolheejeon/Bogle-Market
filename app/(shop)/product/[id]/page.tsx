import type { Metadata } from "next";
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
  const url = buildProductShareUrl(id);
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
