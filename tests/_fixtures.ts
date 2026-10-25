// 시험용 WeekResult·Settings 만들기 (C 묶음 시험 공용, 시험 파일이 아님 — *.test.ts 아님)
import type {
  Facts, Helper, HelperId, Level, PatternId, Relation, Settings, SignalId, SignalResult, WeekResult,
} from "../lib/engine/types";

const SIGNAL_IDS: SignalId[] = ["S1", "S2", "S3", "S4", "S5", "S6", "S7", "S8", "S9", "S10"];
export const DAY0 = Date.UTC(2026, 3, 6) / 86400000; // 2026-04-06(월)

export function mkWeek(p: {
  week: number; level: Level; pattern?: PatternId | null; pattern2?: PatternId | null;
  facts?: Facts; cpKeys?: string[]; fired?: SignalId[];
}): WeekResult {
  const cpKeys = p.cpKeys ?? [];
  const fired = new Set(p.fired ?? []);
  const signals: SignalResult[] = SIGNAL_IDS.map((id) => ({
    id, value: fired.has(id) ? 1 : 0, fired: fired.has(id), facts: {}, cpKeys: [],
  }));
  return {
    week: p.week,
    weekStartDay: DAY0 + (p.week - 1) * 7,
    baselineWeeks: 8,
    signals,
    anyFired: fired.size > 0,
    features: new Array(22).fill(0),
    prob: p.level === "insufficient" ? null : 0.5,
    level: p.level,
    pattern: p.pattern ?? null,
    pattern2: p.pattern2 ?? null,
    facts: p.facts ?? {},
    cpKeys,
    hasCp: cpKeys.length > 0,
    why: [],
    txIds: [],
    outflow_krw: 100_000,
    band: { lo: 0, mid: 50_000, hi: 100_000 },
    b0: false,
    b3: fired.size,
  };
}

export function mkHelper(
  id: HelperId, alias: string, relation: Relation,
  link: Helper["link"] = { state: "unknown" },
  opt: { scope?: Helper["scope"]; exclude?: PatternId[] } = {},
): Helper {
  return { id, alias, relation, scope: opt.scope ?? "high_only", excludePatterns: opt.exclude ?? [], link };
}

export function mkSettings(helpers: Helper[], displayName = "민수", predelegate: Settings["predelegate"] = { enabled: false, helperId: null }): Settings {
  return { consent: true, displayName, helpers, predelegate };
}

// ---- 시나리오 facts(각본 기대값 — 시험용) ----
export const FACTS_A20: Facts = {
  cum_count: 5, cum_weeks: 3, cum_total_krw: 1_470_000, cp_is_new: true,
  income_kind: "salary", income_krw: 1_300_000, out_after_income_krw: 1_070_000, hours: 24, out_mode: "transfer",
};
export const FACTS_B16: Facts = { income_kind: "benefit", income_krw: 500_000, out_after_income_krw: 400_000, hours: 24, out_mode: "transfer" };
export const FACTS_C16: Facts = { loan_krw: 3_000_000, out_after_income_krw: 2_800_000, hours: 5, out_mode: "transfer" };
export const FACTS_C18: Facts = { new_bills: 3, usual_bills: 1 };
export const FACTS_C19: Facts = { income_kind: "salary", income_krw: 1_800_000, out_after_income_krw: 1_200_000, hours: 24, out_mode: "transfer" };
export const FACTS_D21: Facts = { big_krw: 1_290_000, big_category: "card", big_place: "푸른가전", usual_big_krw: 30_000 };

/** 극단값: 금액 99,990,000원, 횟수 99, 주 8. */
export const FACTS_EXTREME: Facts = {
  cum_count: 99, cum_weeks: 8, cum_total_krw: 99_990_000, cp_is_new: true,
  week_total_krw: 99_990_000, usual_week_krw: 99_990_000, usual_week_count: 99, week_count: 99,
  income_kind: "benefit", income_krw: 99_990_000, out_after_income_krw: 99_990_000, hours: 72,
  out_mode: "transfer", loan_krw: 99_990_000, new_bills: 99, usual_bills: 99,
  micro_count: 99, micro_total_krw: 99_990_000, usual_micro_count: 99,
  leak_weeks: 8, leak_excess_krw: 99_990_000, leak_mode: "transfer",
  big_krw: 99_990_000, big_category: "card", big_place: "우리동네정육점", usual_big_krw: 99_990_000,
  salary_day: 25, salary_mode: "returned", balance_low: true,
};
