"use client";
// 첫 화면 데스크톱 오른쪽 칸의 카드 예시 — /thumb와 같은 방법: 실제 AskCard 컴포넌트 + 시나리오 A 분석 결과로 templates.ts가 만든 고정 문안
import { useEffect, useState } from "react";
import type { AskCard as AskCardT } from "@/lib/engine/types";
import { askCard } from "@/lib/engine/templates";
import { AskCard } from "./AskCard";
import { analyzeParsed, readUrl } from "./engine";
import { SCENARIO_META } from "./scenarios";

export function HomeCardExample() {
  const [card, setCard] = useState<AskCardT | null>(null);
  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const meta = SCENARIO_META.A;
        const { result } = analyzeParsed(await readUrl(meta.sample.f1));
        const w = result.weeks.find((x) => x.week === 20 && x.level === "high") ?? result.weeks.find((x) => x.level === "high") ?? null;
        if (alive && w) setCard(askCard(w, meta.settings.displayName));
      } catch {
        /* 예시를 못 읽으면 칸을 비워 둔다 */
      }
    })();
    return () => {
      alive = false;
    };
  }, []);
  if (!card) return null;
  return (
    <div className="card mt-4" data-testid="home-card-example">
      <p className="flex items-center justify-between gap-2 text-[1rem] font-bold text-muted">
        <span>이런 카드로 물어요</span>
        <span className="badge bg-[#fff7dc] text-fg ring-1 ring-[#e7d9a8]">가상 인물·가상 거래</span>
      </p>
      <div className="mt-3">
        <AskCard card={card} interactive={false} />
      </div>
    </div>
  );
}
