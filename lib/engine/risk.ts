// 단계·수법 이름 (구현명세 §5-3)
import type { Facts, Level, PatternId, SignalId, SignalResult } from "./types";

export const SIGNAL_PATTERN: Record<SignalId, PatternId> = {
  S1: "big_spend", S2: "same_person", S3: "same_person", S4: "after_income", S5: "loan_passthrough",
  S6: "new_phone_bills", S7: "micro_repeat", S8: "slow_leak", S9: "big_spend", S10: "salary_cut",
};

/** 판단 보류: 깨끗한 평소 < 4주이고 S5·S6·S10이 모두 안 켜짐 */
export function isInsufficient(baselineWeeks: number, signals: SignalResult[]): boolean {
  if (baselineWeeks >= 4) return false;
  const on = (id: SignalId) => signals.find((s) => s.id === id)?.fired === true;
  return !(on("S5") || on("S6") || on("S10"));
}

/** 모델 확률 → 단계 */
export function levelFromProb(prob: number, t1: number, t2: number): Level {
  if (prob >= t2) return "high";
  if (prob >= t1) return "watch";
  return "normal";
}

/** 모델 없이(B3): 켜진 신호 1 = 살펴보기, 2 이상 = 위험이 높아요 */
export function levelFromCount(b3: number): Level {
  return b3 >= 2 ? "high" : b3 === 1 ? "watch" : "normal";
}

/** 그 신호의 facts로 카드 문장을 사실대로 채울 수 있나 */
function hasEvidence(id: SignalId, f: Facts): boolean {
  const pos = (x: number | undefined) => typeof x === "number" && x > 0;
  switch (id) {
    case "S1": return pos(f.big_krw);
    case "S2": case "S3": return pos(f.cum_count) && pos(f.cum_total_krw);
    case "S4": return pos(f.income_krw) && pos(f.out_after_income_krw);
    case "S5": return pos(f.loan_krw) && pos(f.out_after_income_krw);
    case "S6": return pos(f.new_bills);
    case "S7": return pos(f.micro_count);
    case "S8": return pos(f.leak_weeks) && pos(f.leak_excess_krw);
    case "S9": return f.balance_low === true;
    case "S10": return f.salary_mode === "missing" || f.salary_mode === "returned";
  }
}

interface Cand { pattern: PatternId; ids: SignalId[] }

/** 켜진 신호를 정해진 순서로 보고 처음 두 수법. 켜진 신호가 없으면 Saabas 1위 특징으로 */
export function patternsOf(
  signals: SignalResult[], level: Level, topFeatures: string[],
): { pattern: PatternId | null; pattern2: PatternId | null; facts: Facts } {
  if (level !== "watch" && level !== "high") return { pattern: null, pattern2: null, facts: {} };
  const by = (id: SignalId) => signals.find((s) => s.id === id)!;
  const on = (id: SignalId) => by(id).fired;
  const s2cum = by("S2").facts.cum_count ?? 0;
  const strongSame = on("S3") || (on("S2") && s2cum >= 2);
  const weakSame = on("S2") && !on("S3") && s2cum < 2;
  const sameIds: SignalId[] = (["S2", "S3"] as SignalId[]).filter(on); // 앞 신호(S2: 처음부터 누적) facts가 이긴다
  const order: (Cand | null)[] = [
    on("S5") ? { pattern: "loan_passthrough", ids: ["S5"] } : null,
    on("S6") ? { pattern: "new_phone_bills", ids: ["S6"] } : null,
    on("S10") ? { pattern: "salary_cut", ids: ["S10"] } : null,
    strongSame ? { pattern: "same_person", ids: sameIds } : null,
    on("S4") ? { pattern: "after_income", ids: ["S4"] } : null,
    on("S7") ? { pattern: "micro_repeat", ids: ["S7"] } : null,
    on("S8") ? { pattern: "slow_leak", ids: ["S8"] } : null,
    weakSame ? { pattern: "same_person", ids: ["S2"] } : null,
    on("S1") || on("S9") ? { pattern: "big_spend", ids: (["S1", "S9"] as SignalId[]).filter(on) } : null,
  ];
  const picked = order.filter((c): c is Cand => c !== null);
  if (picked.length === 0) {
    // 켜진 신호가 없는데 모델이 watch·high: Saabas 기여도가 큰 신호 특징 순서로 보되,
    // 그 신호의 facts에 실제 숫자가 있는 것만 쓴다(빈 facts로 「월급이 안 들어왔어요」 같은 사실 아닌 문장이 나오지 않게).
    const order2: SignalId[] = [];
    for (const f of topFeatures) {
      const m = /^s(\d+)$/.exec(f);
      if (m) order2.push(("S" + m[1]) as SignalId);
    }
    for (const id of ["S1", "S8", "S4", "S2", "S3", "S7", "S5", "S6", "S10", "S9"] as SignalId[]) if (!order2.includes(id)) order2.push(id);
    for (const id of order2) {
      if (hasEvidence(id, by(id).facts)) return { pattern: SIGNAL_PATTERN[id], pattern2: null, facts: { ...by(id).facts } };
    }
    return { pattern: "slow_leak", pattern2: null, facts: { ...by("S8").facts } };
  }
  const first = picked[0];
  const second = picked.find((c) => c.pattern !== first.pattern) ?? null;
  // facts 합침: 둘째 → 첫째 순으로 덮어써 첫째 수법 값이 이긴다
  const facts: Facts = {};
  const put = (c: Cand) => {
    // 같은 수법 안에서는 뒤(약한) 신호 → 앞 신호 순서로 덮어쓴다
    for (const id of [...c.ids].reverse()) Object.assign(facts, by(id).facts);
  };
  if (second) put(second);
  put(first);
  return { pattern: first.pattern, pattern2: second ? second.pattern : null, facts };
}
