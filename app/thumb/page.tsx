// 대표 이미지용(1280×720, 실제 AskCard 컴포넌트, 링크 없음, noindex) — docs/vote_thumb.png는 scripts/capture.py가 찍는다
import type { Metadata } from "next";
import { ThumbView } from "@/components/ThumbView";

export const metadata: Metadata = { robots: { index: false, follow: false } };

export default function ThumbPage() {
  return <ThumbView />;
}
