import { OrderDetailView } from "@/components/Orders/OrderDetailView";

export default async function OrderDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ on?: string; p4?: string }>;
}) {
  const { id } = await params;
  const { on, p4 } = await searchParams;
  return <OrderDetailView orderId={id} onParam={on} p4Param={p4} />;
}
