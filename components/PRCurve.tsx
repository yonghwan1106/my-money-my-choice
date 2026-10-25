// ⑫ PR 곡선 (SVG) — 이 AI · 로지스틱 · 신호 규칙, 무작위 기준 가로선. 점은 eval_v1.json pr_curve([재현율, 정밀도]).
import type { EvalV1 } from "./evalData";

const SERIES: { key: "GBM" | "B4" | "B3"; name: string; color: string; dash?: string }[] = [
  { key: "GBM", name: "이 AI(부스팅)", color: "#1d4ed8" },
  { key: "B4", name: "로지스틱 회귀", color: "#c2410c", dash: "6 4" },
  { key: "B3", name: "신호 규칙", color: "#5b7083", dash: "2 3" },
];

export function PRCurve({ ev }: { ev: EvalV1 }) {
  const W = 320;
  const H = 240;
  const P = { l: 40, r: 10, t: 10, b: 36 };
  const x = (r: number) => P.l + r * (W - P.l - P.r);
  const y = (p: number) => P.t + (1 - p) * (H - P.t - P.b);
  const ticks = [0, 0.5, 1];
  return (
    <section className="mt-6" data-testid="eval-pr">
      <h2 className="h2">정밀도-재현율 곡선</h2>
      <svg viewBox={`0 0 ${W} ${H}`} className="mt-2 w-full max-w-[520px]" role="img" aria-label="정밀도-재현율 곡선">
        {ticks.map((t) => (
          <g key={t}>
            <line x1={x(0)} x2={x(1)} y1={y(t)} y2={y(t)} stroke="#e5e7eb" />
            <text x={P.l - 6} y={y(t) + 4} fontSize={11} textAnchor="end" fill="#4b5563">
              {t}
            </text>
            <text x={x(t)} y={H - P.b + 16} fontSize={11} textAnchor="middle" fill="#4b5563">
              {t}
            </text>
          </g>
        ))}
        <line x1={x(0)} x2={x(1)} y1={y(ev.split.pos_rate)} y2={y(ev.split.pos_rate)} stroke="#9aa1ab" strokeDasharray="4 4" />
        <text x={x(1)} y={y(ev.split.pos_rate) - 4} fontSize={11} textAnchor="end" fill="#4b5563">
          무작위({ev.split.pos_rate})
        </text>
        {SERIES.map((s) => {
          const pts = ev.pr_curve[s.key] ?? [];
          if (pts.length === 0) return null;
          return (
            <polyline
              key={s.key}
              fill="none"
              stroke={s.color}
              strokeWidth={2.5}
              strokeDasharray={s.dash}
              points={pts.map(([r, p]) => `${x(r).toFixed(1)},${y(p).toFixed(1)}`).join(" ")}
            />
          );
        })}
        <text x={(x(0) + x(1)) / 2} y={H - 4} fontSize={12} textAnchor="middle" fill="#1f2328">
          재현율
        </text>
        <text x={12} y={(y(0) + y(1)) / 2} fontSize={12} textAnchor="middle" fill="#1f2328" transform={`rotate(-90 12 ${(y(0) + y(1)) / 2})`}>
          정밀도
        </text>
      </svg>
      <ul className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-[1rem]">
        {SERIES.map((s) => (
          <li key={s.key} className="flex items-center gap-2">
            <svg width="28" height="8" aria-hidden="true">
              <line x1="0" x2="28" y1="4" y2="4" stroke={s.color} strokeWidth="3" strokeDasharray={s.dash} />
            </svg>
            {s.name}
          </li>
        ))}
      </ul>
    </section>
  );
}
