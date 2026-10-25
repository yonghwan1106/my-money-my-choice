import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "내 돈, 내가 정해요",
  description: "아는 사람이 돈을 가져갈 때, 발달장애인 본인에게 먼저 묻는 AI",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="ko">
      <body className="font-sans">{children}</body>
    </html>
  );
}
