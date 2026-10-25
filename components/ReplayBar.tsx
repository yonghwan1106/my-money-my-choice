"use client";
// ④ 재생 (구현명세 §7-4) — [재생] [멈춤] [카드가 온 주로 바로 가기] + 「물어볼 것」 칸(숫자 배지)
import { Inbox, Pause, Play, SkipForward } from "lucide-react";
import type { WeekResult } from "@/lib/engine/types";
import { LEVEL_TEXT } from "./Timeline";

export function ReplayBar({
  cursor,
  total,
  playing,
  onPlay,
  onPause,
  onSkip,
}: {
  cursor: number;
  total: number;
  playing: boolean;
  onPlay: () => void;
  onPause: () => void;
  onSkip: () => void;
}) {
  return (
    <section className="card mt-3" data-testid="replay-bar">
      <div className="flex items-center justify-between">
        <p className="font-bold">
          {cursor === 0 ? "재생 전" : `${cursor}주 / ${total}주`}
        </p>
        <div className="h-2 w-1/2 rounded-full bg-soft" aria-hidden="true">
          <div className="h-2 rounded-full bg-accent" style={{ width: `${total ? (cursor / total) * 100 : 0}%` }} />
        </div>
      </div>
      <div className="mt-3 grid grid-cols-2 gap-2">
        <button type="button" className="btn btn-primary" onClick={onPlay} disabled={playing} data-testid="btn-play">
          <Play size={22} aria-hidden="true" />
          재생
        </button>
        <button type="button" className="btn btn-secondary" onClick={onPause} disabled={!playing} data-testid="btn-pause">
          <Pause size={22} aria-hidden="true" />
          멈춤
        </button>
      </div>
      <button type="button" className="btn btn-secondary mt-2 !text-[1rem]" onClick={onSkip} data-testid="btn-skip">
        <SkipForward size={22} aria-hidden="true" />
        카드가 온 주로 바로 가기
      </button>
    </section>
  );
}

export function Tray({
  items,
  weeks,
  onOpen,
  title,
}: {
  items: string[];
  weeks: WeekResult[];
  onOpen: (eventId: string) => void;
  title: (w: WeekResult) => string;
}) {
  return (
    <section className="card mt-3" data-testid="tray">
      <div className="flex items-center gap-2">
        <Inbox size={28} aria-hidden="true" className="text-accent" />
        <h3 className="h3">물어볼 것</h3>
        <span className="badge bg-accent text-white" data-testid="tray-count" aria-label={`${items.length}개`}>
          {items.length}
        </span>
      </div>
      {items.length > 0 ? (
        <ul className="mt-2 flex flex-col gap-2">
          {items.map((id) => {
            const w = weeks.find((x) => `w${x.week}` === id);
            if (!w) return null;
            return (
              <li key={id}>
                <button type="button" className="btn btn-secondary !justify-between !text-[1rem]" onClick={() => onOpen(id)} data-event={id}>
                  <span>
                    {w.week}주 · {title(w)}
                  </span>
                  <span className={`badge badge-${w.level}`}>{LEVEL_TEXT[w.level]}</span>
                </button>
              </li>
            );
          })}
        </ul>
      ) : null}
    </section>
  );
}
