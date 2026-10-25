// ⑫ 수법별 재현율 막대 + 수법 하나 빼고 학습한 재현율(옆 막대) — eval_v1.json by_pattern·lopo
import type { EvalV1 } from "./evalData";
import { pct } from "./EvalTables";

export function PatternBars({ ev }: { ev: EvalV1 }) {
  return (
    <section className="mt-6" data-testid="eval-patterns">
      <h2 className="h2">수법별 재현율</h2>
      <ul className="mt-3 flex flex-col gap-3">
        {ev.by_pattern.map((b) => {
          const lo = ev.lopo.find((l) => l.held_out === b.pattern) ?? null;
          return (
            <li key={b.pattern} className="card !p-3" data-pattern={b.pattern}>
              <p className="font-bold">
                {b.pattern} {b.label} <span className="font-normal text-muted">(주 {b.n_windows}개)</span>
              </p>
              <div className="mt-2 grid grid-cols-[7.5rem_1fr_3.2rem] items-center gap-x-2 gap-y-1.5 text-[1rem]">
                <span>모두 배운 모델</span>
                <div className="h-4 rounded-full bg-soft">
                  <div className="h-4 rounded-full bg-accent" style={{ width: `${b.recall * 100}%` }} />
                </div>
                <span className="text-right tabular-nums">{pct(b.recall)}</span>
                <span>이 수법 빼고</span>
                <div className="h-4 rounded-full bg-soft">
                  <div className="h-4 rounded-full bg-[#9aa1ab]" style={{ width: `${(lo?.recall ?? 0) * 100}%` }} />
                </div>
                <span className="text-right tabular-nums">{pct(lo?.recall ?? null)}</span>
              </div>
            </li>
          );
        })}
      </ul>
      {ev.interpretations.lopo ? <p className="mt-3">{ev.interpretations.lopo}</p> : null}
    </section>
  );
}
