import type { Metadata, Viewport } from "next";
import "./globals.css";
import { AppStateProvider } from "@/components/AppState";

export const metadata: Metadata = {
  title: "내 돈, 내가 정해요",
  description: "아는 사람이 돈을 가져갈 때, 발달장애인 본인에게 먼저 묻는 AI",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#FAFAF7",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="ko">
      <body className="font-sans">
        <AppStateProvider>{children}</AppStateProvider>
      </body>
    </html>
  );
}
