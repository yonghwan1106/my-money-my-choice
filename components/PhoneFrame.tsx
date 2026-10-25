// 모바일(360~430px)은 전체 폭 + 좌우 16px. 데스크톱(≥1024px)은 가운데 휴대폰 틀(폭 400px) + 오른쪽 「AI가 하는 일」 칸(구현명세 §7-0).
import type { ReactNode } from "react";
import type { LayerInfo } from "./layers";

export function PhoneFrame({
  children,
  side,
  second,
  bottom,
  top,
}: {
  children: ReactNode;
  side?: LayerInfo;
  /** 데스크톱에서 둘째 휴대폰 틀(미리보기 — 「{별칭}의 휴대폰」) */
  second?: { title: string; content: ReactNode } | null;
  /** 바닥 고정 문구 */
  bottom?: ReactNode;
  /** 틀 위 머리띠(가상 인물 안내 등) */
  top?: ReactNode;
}) {
  return (
    <div className="mx-auto flex w-full max-w-[1280px] justify-center gap-8 lg:py-8">
      <div className="flex w-full max-w-[430px] flex-col lg:w-[400px] lg:max-w-[400px]">
        <div
          className="relative flex min-h-[100dvh] w-full flex-col bg-bg lg:min-h-0 lg:h-[860px] lg:overflow-hidden lg:rounded-[44px] lg:border-[10px] lg:border-[#2b2f36] lg:shadow-[0_24px_60px_-20px_rgba(15,23,42,0.45)]"
          data-phone="main"
        >
          <div className="flex-1 lg:overflow-y-auto" data-scroll="main">
            {top}
            <div className="px-4 pb-6 pt-4">{children}</div>
          </div>
          {bottom ? (
            <div className="sticky bottom-0 border-t border-line bg-[#fffdf5] px-4 py-3 text-center text-[1rem] font-semibold leading-snug">
              {bottom}
            </div>
          ) : null}
        </div>
      </div>
      {second ? (
        <div className="hidden lg:flex lg:w-[400px] lg:flex-col" data-phone="second">
          <div className="flex h-[860px] flex-col overflow-hidden rounded-[44px] border-[10px] border-[#2b2f36] bg-bg shadow-[0_24px_60px_-20px_rgba(15,23,42,0.45)]">
            <div className="border-b border-line bg-soft px-4 py-3 text-center text-[1rem] font-bold">{second.title}</div>
            <div className="flex-1 overflow-y-auto px-4 py-4">{second.content}</div>
          </div>
        </div>
      ) : null}
      {side ? <SidePanel info={side} /> : null}
    </div>
  );
}

export function SidePanel({ info }: { info: LayerInfo }) {
  return (
    <aside className="hidden w-[320px] shrink-0 lg:block" aria-label="AI가 하는 일">
      <div className="sticky top-8 card">
        <p className="text-[1rem] font-bold text-muted">AI가 하는 일</p>
        <p className="h3 mt-2" data-testid="layer-name">
          {info.layer}
        </p>
        <p className="mt-2 text-[1rem] leading-relaxed" data-testid="layer-io">
          {info.io}
        </p>
      </div>
    </aside>
  );
}
