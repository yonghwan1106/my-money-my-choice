"use client";
// 대표 이미지(1280×720) — 실제 AskCard 컴포넌트 + 카드 문장은 시나리오 A 분석 결과로 templates.ts가 만든 고정 문안
import { useEffect, useState } from "react";
import type { AskCard as AskCardT } from "@/lib/engine/types";
import { askCard } from "@/lib/engine/templates";
import { AskCard } from "./AskCard";
import { analyzeParsed, readUrl } from "./engine";
import { SCENARIO_META } from "./scenarios";

export function ThumbView() {
  const [card, setCard] = useState<AskCardT | null>(null);
  useEffect(() => {
    (async () => {
      const meta = SCENARIO_META.A;
      const { result } = analyzeParsed(await readUrl(meta.sample.f1));
      const w = result.weeks.find((x) => x.week === 20 && x.level === "high") ?? result.weeks.find((x) => x.level === "high") ?? null;
      if (w) setCard(askCard(w, meta.settings.displayName));
    })();
  }, []);
  return (
    <div className="flex h-[720px] w-[1280px] overflow-hidden bg-bg" data-testid="thumb" data-ready={card ? "1" : "0"}>
      <div className="flex w-[700px] flex-col justify-center gap-6 pl-[84px] pr-8">
        <span className="badge self-start bg-[#fff7dc] !px-4 !py-1 text-[22px] text-fg ring-2 ring-[#e7d9a8]">가상 인물·가상 거래</span>
        <p className="text-[64px] font-extrabold leading-[1.15] tracking-tight">
          그 돈, 주고 싶어서
          <br />
          보낸 거예요?
        </p>
        <p className="text-[34px] font-bold text-accent">AI가 본인에게 먼저 물어요</p>
        <p className="mt-4 text-[40px] font-extrabold">내 돈, 내가 정해요</p>
        <p className="text-[22px] text-muted">아는 사람이 돈을 가져갈 때, 발달장애인 본인에게 먼저 묻는 AI</p>
      </div>
      <div className="flex flex-1 items-center justify-center">
        <div className="w-[400px] overflow-hidden rounded-[44px] border-[10px] border-[#2b2f36] bg-bg px-5 py-6 shadow-[0_24px_60px_-20px_rgba(15,23,42,0.45)]">
          {card ? <AskCard card={card} interactive={false} /> : null}
        </div>
      </div>
    </div>
  );
}
