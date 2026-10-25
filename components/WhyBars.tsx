// ④ 「왜?」 막대 (구현명세 §7-4) — 특징 쉬운 이름 3개, 길이 = 기여도
import type { WeekResult } from "@/lib/engine/types";

export function WhyBars({ week }: { week: WeekResult }) {
  const items = week.why.filter((x) => x.contribution > 0).slice(0, 3);
  if (items.length === 0) return null;
  const max = Math.max(...items.map((x) => x.contribution));
  return (
    <section className="card mt-3" data-testid="why-bars">
      <h3 className="h3">AI가 이렇게 본 이유</h3>
      <ol className="mt-3 flex flex-col gap-3">
        {items.map((x) => (
          <li key={x.feature}>
            <p className="font-semibold">{x.label}</p>
            <div className="mt-1 h-4 w-full rounded-full bg-soft" aria-hidden="true">
              <div className="h-4 rounded-full bg-accent" style={{ width: `${Math.max(6, (x.contribution / max) * 100)}%` }} />
            </div>
          </li>
        ))}
      </ol>
      <p className="small mt-3">위험 점수는 가상 거래로 배운 모델이 계산해요.</p>
    </section>
  );
}
