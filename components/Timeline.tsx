"use client";
// ④ 타임라인 (구현명세 §7-4) — x = 주, y = 그 주 「밖으로 나간 돈」(만 원), 회색 띠 = 평소 범위, 점 = 단계 색.
// 띠 위 점 8px, 띠 밖 점 12px, 판단 보류는 빈 동그라미. 점을 누르면 그 주를 고른다.
import { useEffect, useRef, useState } from "react";
import type { Level, WeekResult } from "@/lib/engine/types";
import { ymd } from "@/lib/engine/dates";

export const LEVEL_COLOR: Record<Level, string> = {
  normal: "var(--lv-normal)",
  watch: "var(--lv-watch)",
  high: "var(--lv-high)",
  insufficient: "var(--lv-normal)",
};
export const LEVEL_TEXT: Record<Level, string> = {
  normal: "보통",
  watch: "살펴보기",
  high: "위험이 높아요",
  insufficient: "정보 부족 — 판단 보류",
};

const H = 220;
const PAD = { l: 34, r: 8, t: 12, b: 28 };

function niceMax(v: number): number {
  if (v <= 10) return 10;
  const p = Math.pow(10, Math.floor(Math.log10(v)));
  for (const m of [1, 2, 2.5, 5, 10]) if (m * p >= v) return m * p;
  return 10 * p;
}

export function Timeline({
  weeks,
  shownUpTo,
  selected,
  onSelect,
}: {
  weeks: WeekResult[];
  /** 재생 중이면 이 주까지만 보인다 */
  shownUpTo: number;
  selected: number | null;
  onSelect: (week: number) => void;
}) {
  const box = useRef<HTMLElement>(null);
  const [W, setW] = useState(360);
  useEffect(() => {
    const el = box.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setW(Math.max(240, Math.round(el.clientWidth))));
    ro.observe(el);
    setW(Math.max(240, Math.round(el.clientWidth)));
    return () => ro.disconnect();
  }, []);
  const n = Math.max(weeks.length, 1);
  const man = (krw: number) => krw / 10000;
  const maxV = niceMax(Math.max(1, ...weeks.map((w) => man(Math.max(w.outflow_krw, w.band?.hi ?? 0)))));
  const x = (week: number) => PAD.l + ((week - 0.5) / n) * (W - PAD.l - PAD.r);
  // 제곱근 눈금: 큰 돈 한 주가 있어도 평소 범위 띠가 보이게(눈금 숫자는 실제 값)
  const y = (v: number) => PAD.t + (1 - Math.sqrt(Math.min(Math.max(v, 0), maxV) / maxV)) * (H - PAD.t - PAD.b);
  const colW = (W - PAD.l - PAD.r) / n;
  const BAND_MIN = 8;
  const ticks = [...new Set([0, niceMax(maxV / 25), niceMax(maxV / 4), maxV])].filter((t) => t <= maxV);
  // 달 눈금: 그 주 월요일의 달이 앞 주와 달라지는 주
  const months: { week: number; label: string }[] = [];
  let prevM = -1;
  for (const w of weeks) {
    const m = ymd(w.weekStartDay).m;
    if (m !== prevM) months.push({ week: w.week, label: `${m}월` });
    prevM = m;
  }
  const visible = weeks.filter((w) => w.week <= shownUpTo);
  return (
    <figure className="mt-2" data-testid="timeline" ref={box}>
      <svg viewBox={`0 0 ${W} ${H}`} width="100%" height={H} role="img" aria-label="주마다 밖으로 나간 돈과 평소 범위" style={{ height: H, display: "block" }}>
        {/* 눈금선 */}
        {ticks.map((t) => (
          <g key={t}>
            <line x1={PAD.l} x2={W - PAD.r} y1={y(t)} y2={y(t)} stroke="#e5e7eb" strokeWidth={1} />
            <text x={PAD.l - 4} y={y(t) + 4} textAnchor="end" fontSize={11} fill="#4b5563">
              {Math.round(t)}
            </text>
          </g>
        ))}
        {/* 평소 범위 띠 */}
        {/* 평소 범위가 거의 0이면(평소 밖으로 나가는 돈이 없음) 띠가 사라지지 않게 바닥에서 최소 BAND_MIN px로 그린다 */}
        {visible.map((w) => {
          if (!w.band) return null;
          const yLo = y(man(w.band.lo));
          const h = Math.max(BAND_MIN, yLo - y(man(w.band.hi)));
          return <rect key={`b${w.week}`} x={x(w.week) - colW / 2} width={colW + 0.5} y={yLo - h} height={h} fill="var(--band)" />;
        })}
        {/* 고른 주 */}
        {selected !== null && selected <= shownUpTo ? (
          <rect x={x(selected) - colW / 2} width={colW} y={PAD.t} height={H - PAD.t - PAD.b} fill="none" stroke="#1d4ed8" strokeWidth={1.5} strokeDasharray="3 2" />
        ) : null}
        {/* 점 */}
        {visible.map((w) => {
          const v = man(w.outflow_krw);
          const inBand = w.band ? w.outflow_krw >= w.band.lo && w.outflow_krw <= w.band.hi : false;
          const r = inBand ? 4 : 6;
          const hollow = w.level === "insufficient";
          return (
            <g key={`p${w.week}`} data-week={w.week} data-level={w.level} onClick={() => onSelect(w.week)} style={{ cursor: "pointer" }}>
              <rect x={x(w.week) - colW / 2} width={colW} y={PAD.t} height={H - PAD.t - PAD.b} fill="transparent" />
              <circle
                cx={x(w.week)}
                cy={y(v)}
                r={r}
                fill={hollow ? "#fff" : LEVEL_COLOR[w.level]}
                stroke={hollow ? "var(--lv-normal)" : "#fff"}
                strokeWidth={hollow ? 2 : 1.5}
              />
            </g>
          );
        })}
        {/* 달 눈금 */}
        {months.map((m) => (
          <text key={m.week} x={x(m.week) - colW / 2} y={H - 8} fontSize={11} fill="#4b5563">
            {m.label}
          </text>
        ))}
        <line x1={PAD.l} x2={W - PAD.r} y1={H - PAD.b} y2={H - PAD.b} stroke="#9aa1ab" />
      </svg>
      <figcaption className="mt-1 text-[1rem] text-muted">세로: 밖으로 나간 돈(만 원, 제곱근 눈금) · 가로: 주</figcaption>
      <ul className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-[1rem]" aria-label="범례">
        <li className="flex items-center gap-1.5">
          <span className="inline-block h-3 w-5 rounded-sm" style={{ background: "var(--band)" }} />
          평소 범위
        </li>
        {(["normal", "watch", "high"] as Level[]).map((l) => (
          <li key={l} className="flex items-center gap-1.5">
            <span className="inline-block h-3.5 w-3.5 rounded-full" style={{ background: LEVEL_COLOR[l] }} />
            {LEVEL_TEXT[l]}
          </li>
        ))}
        <li className="flex items-center gap-1.5">
          <span className="inline-block h-3.5 w-3.5 rounded-full border-2 border-normal bg-white" />
          판단 보류
        </li>
      </ul>
    </figure>
  );
}
