"use client";
// ④ 신호 목록 (구현명세 §7-4) — 켜진 신호마다 화면 이름 + 카드와 같은 문장(§7-9 l1)
import type { PatternId, SignalId, WeekResult } from "@/lib/engine/types";
import { askCard } from "@/lib/engine/templates";
import { fmtDay } from "@/lib/engine/dates";
import { LEVEL_TEXT } from "./Timeline";

export const SIGNAL_NAME: Record<SignalId, string> = {
  S1: "평소보다 큰 돈",
  S2: "처음 돈을 보낸 사람",
  S3: "같은 사람에게 여러 번",
  S4: "수입 직후 빠져나감",
  S5: "대출금이 바로 나감",
  S6: "새 자동 출금",
  S7: "작은 결제가 많음",
  S8: "조금씩 계속 나감",
  S9: "잔액이 바닥",
  S10: "월급이 달라짐",
};
export const SIGNAL_PATTERN: Record<SignalId, PatternId> = {
  S1: "big_spend",
  S2: "same_person",
  S3: "same_person",
  S4: "after_income",
  S5: "loan_passthrough",
  S6: "new_phone_bills",
  S7: "micro_repeat",
  S8: "slow_leak",
  S9: "big_spend",
  S10: "salary_cut",
};

/** 그 신호 하나만 있는 주로 보고 카드 첫 줄(l1)을 만든다 — 카드와 같은 문장 */
export function signalLine(w: WeekResult, id: SignalId, name: string): string | null {
  const s = w.signals.find((x) => x.id === id);
  if (!s) return null;
  try {
    const card = askCard({ ...w, pattern: SIGNAL_PATTERN[id], pattern2: null, facts: { ...s.facts } }, name);
    return card.lines[0];
  } catch {
    return null;
  }
}

export function SignalList({ week, name }: { week: WeekResult; name: string }) {
  const fired = week.signals.filter((s) => s.fired);
  return (
    <section className="card mt-3" data-testid="signal-list" aria-live="polite">
      <div className="flex flex-wrap items-center gap-2">
        <h3 className="h3">
          {week.week}주 <span className="text-[1rem] font-normal text-muted">({fmtDay(week.weekStartDay)}~)</span>
        </h3>
        <span className={`badge badge-${week.level}`}>{LEVEL_TEXT[week.level]}</span>
      </div>
      {fired.length === 0 ? (
        <p className="mt-2 text-muted">켜진 신호가 없어요.</p>
      ) : (
        <ul className="mt-2 flex flex-col gap-2">
          {fired.map((s) => (
            <li key={s.id} className="rounded-xl bg-soft px-3 py-2" data-signal={s.id}>
              <p className="font-bold">{SIGNAL_NAME[s.id]}</p>
              {signalLine(week, s.id, name) ? <p>{signalLine(week, s.id, name)}</p> : null}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
