import { Header } from "@/components/Header";
import { BottomNav } from "@/components/BottomNav";

export default function ShopLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="mx-auto flex min-h-screen max-w-2xl flex-col bg-bg-card">
      <Header />
      <main className="flex-1 pb-4">{children}</main>
      <BottomNav />
    </div>
  );
}
