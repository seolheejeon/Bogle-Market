import type { Metadata, Viewport } from "next";
import "./globals.css";
import { AuthProvider } from "@/lib/auth-context";
import { CartProvider } from "@/lib/cart-context";
import { PwaRegister } from "@/components/PwaRegister";

export const metadata: Metadata = {
  title: "보글마켓",
  description: "우리 동네 맛있는 공동구매",
  manifest: "/manifest.webmanifest",
  icons: {
    icon: "/favicon.ico",
    apple: "/icons/apple-touch-icon.png",
  },
  appleWebApp: {
    capable: true,
    title: "보글마켓",
    statusBarStyle: "default",
  },
};

export const viewport: Viewport = {
  themeColor: "#c9532f",
  // 홈 화면에 추가한 뒤 상태바 밑까지 꽉 차게(노치 대응) 렌더링하기 위함.
  viewportFit: "cover",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="ko">
      <body className="min-h-screen antialiased">
        <PwaRegister />
        <AuthProvider>
          <CartProvider>{children}</CartProvider>
        </AuthProvider>
      </body>
    </html>
  );
}
