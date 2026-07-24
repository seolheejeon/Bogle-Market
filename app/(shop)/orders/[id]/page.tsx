import { OrderDetailView } from "@/components/Orders/OrderDetailView";

export default async function OrderDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ gn?: string; pin?: string }>;
}) {
  const { id } = await params;
  const { gn, pin } = await searchParams;
  return <OrderDetailView orderId={id} guestName={gn} guestPin={pin} />;
}
