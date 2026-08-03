// 상품 상세 페이지의 OG/Twitter 메타태그를 만들기 위한 서버 전용 데이터
// 조회. lib/data.ts는 "use client"라 서버 컴포넌트(generateMetadata)에서
// 쓰기엔 성격이 안 맞아서, 카카오톡/트위터 크롤러가 필요로 하는 최소 정보만
// 딱 이만큼 별도로 가볍게 조회한다. 공개 상품 정보라 인증 없이 anon key로
// 조회하며, RLS는 고객 화면과 동일(비노출 리스팅은 안 보임).
import { createClient } from "@supabase/supabase-js";

export interface ProductOgData {
  name: string;
  price: number;
  description?: string;
  // Supabase Storage의 공개 URL(이미 절대경로) — 없으면 og:image를 생략한다.
  imageUrl?: string;
}

interface EventProductRow {
  price: number;
  products: { name: string; description: string | null; photos: string[] | null } | { name: string; description: string | null; photos: string[] | null }[] | null;
}

export async function getProductOgData(productId: string): Promise<ProductOgData | null> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anonKey) return null;

  const supabase = createClient(url, anonKey, { auth: { persistSession: false } });
  const { data, error } = await supabase.from("event_products").select("price, products(name, description, photos)").eq("id", productId).maybeSingle<EventProductRow>();
  if (error || !data) return null;

  const catalog = Array.isArray(data.products) ? data.products[0] : data.products;
  if (!catalog) return null;

  return {
    name: catalog.name,
    price: data.price,
    description: catalog.description ?? undefined,
    imageUrl: catalog.photos?.[0],
  };
}
