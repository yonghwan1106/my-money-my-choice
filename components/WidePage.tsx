// 넓은 읽기 화면(성적표·비교·작동 원리) — 모바일 좌우 16px, 데스크톱 최대 960px + 오른쪽 「AI가 하는 일」 칸
import Link from "next/link";
import type { ReactNode } from "react";
import { DemoBadge } from "./DemoBadge";
import { SidePanel } from "./PhoneFrame";
import type { LayerInfo } from "./layers";

export function WidePage({ children, side, bottom, top }: { children: ReactNode; side?: LayerInfo; bottom?: ReactNode; top?: ReactNode }) {
  return (
    <div className="flex min-h-[100dvh] flex-col">
      {top}
      <DemoBadge />
      <div className="mx-auto flex w-full max-w-[1320px] flex-1 justify-center gap-8 px-4 pb-8 pt-4 lg:pt-8">
        <main className="w-full min-w-0 max-w-[960px]">
          <Link href="/" className="link text-[1rem]">
            처음으로
          </Link>
          {children}
        </main>
        {side ? <SidePanel info={side} /> : null}
      </div>
      {bottom ? (
        <div className="sticky bottom-0 border-t border-line bg-[#fffdf5] px-4 py-3 text-center text-[1rem] font-semibold leading-snug">{bottom}</div>
      ) : null}
    </div>
  );
}
