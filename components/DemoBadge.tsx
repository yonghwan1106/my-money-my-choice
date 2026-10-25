"use client";
// 데모 배지 — /api/health가 demo이거나 마지막 응답 mode가 rule·template일 때 (구현명세 §7-0)
import { useAppState } from "./AppState";

export const DEMO_BADGE_TEXT = "데모 모드 — AI 연결 없이 기본 기능으로 보여 줘요";

export function DemoBadge() {
  const { demoMode } = useAppState();
  if (!demoMode) return null;
  return (
    <div
      role="status"
      data-testid="demo-badge"
      className="mx-4 mt-3 rounded-xl border-2 border-dashed border-normal bg-white px-3 py-2 text-center text-[1rem] font-semibold"
    >
      {DEMO_BADGE_TEXT}
    </div>
  );
}
