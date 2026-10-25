// 가짜 결과판 (구현명세 §5-4, I4) — B·C 화면·규칙 개발용. 진짜 analyze가 생기면 지우고 import를 바꾼다.
// 같은 시그니처: 시나리오 A 파일을 넣으면 18주 watch · 20주 high, 나머지 normal.
import type { AnalyzeResult, Counterparty, Facts, ParseReport, SignalId, SignalResult, Tx, WeekResult } from "./types";
import { mondayOf } from "./dates";

const IDS: SignalId[] = ["S1", "S2", "S3", "S4", "S5", "S6", "S7", "S8", "S9", "S10"];

function sig(id: SignalId, fired: boolean, facts: Facts = {}, cpKeys: string[] = []): SignalResult {
  return { id, value: fired ? 5 : 0, fired, facts, cpKeys };
}

export function analyze(txs: Tx[], report: ParseReport, _opts?: { model?: "gbm" | "lr" | "none" }): AnalyzeResult {
  const sorted = [...txs].sort((a, b) => a.day - b.day || (a.minute ?? 0) - (b.minute ?? 0));
  const first = sorted.length ? sorted[0].day : 0;
  const last = sorted.length ? sorted[sorted.length - 1].day : 0;
  const w1 = mondayOf(first);
  const nWeeks = sorted.length ? Math.floor((last - w1) / 7) + 1 : 0;
  const hanCp = sorted.find((t) => t.cpLabel === "한지훈")?.cpKey ?? null;
  const weeks: WeekResult[] = [];
  for (let w = 1; w <= nWeeks; w++) {
    const start = w1 + (w - 1) * 7;
    const inWeek = sorted.filter((t) => t.day >= start && t.day < start + 7);
    const outflow = inWeek
      .filter((t) => t.category === "transfer_out" || t.category === "cash_withdraw" || t.category === "micro_payment")
      .reduce((s, t) => s + Math.abs(t.amount), 0);
    const bw = Math.min(8, Math.max(0, w - 1));
    let signals = IDS.map((id) => sig(id, false));
    let level: WeekResult["level"] = bw < 4 ? "insufficient" : "normal";
    let pattern: WeekResult["pattern"] = null;
    let pattern2: WeekResult["pattern"] = null;
    let facts: Facts = {};
    let prob: number | null = bw < 4 ? null : 0.02;
    const cps = hanCp ? [hanCp] : [];
    if (w === 18) {
      facts = { cp_is_new: true, week_total_krw: 250000, cum_count: 2, cum_weeks: 1, cum_total_krw: 250000 };
      signals = IDS.map((id) => (id === "S2" ? sig(id, true, facts, cps) : sig(id, false)));
      level = "watch";
      pattern = "same_person";
      prob = 0.3;
    } else if (w === 20) {
      const f2: Facts = { cp_is_new: true, week_total_krw: 1070000, cum_count: 5, cum_weeks: 3, cum_total_krw: 1470000 };
      const f4: Facts = { income_kind: "salary", income_krw: 1300000, out_after_income_krw: 1070000, hours: 23, out_mode: "transfer" };
      facts = { ...f2, ...f4 };
      signals = IDS.map((id) => (id === "S2" ? sig(id, true, f2, cps) : id === "S4" ? sig(id, true, f4, cps) : sig(id, false)));
      level = "high";
      pattern = "same_person";
      pattern2 = "after_income";
      prob = 0.9;
    }
    const fired = signals.filter((s) => s.fired).length;
    weeks.push({
      week: w, weekStartDay: start, baselineWeeks: bw, signals, anyFired: fired > 0,
      features: new Array(22).fill(0), prob, level, pattern, pattern2, facts,
      cpKeys: fired > 0 ? cps : [], hasCp: fired > 0 && cps.length > 0,
      why: fired > 0 ? [{ feature: "s2", label: "처음 돈을 보낸 사람", contribution: 0.5 }] : [],
      txIds: inWeek.map((t) => t.id), outflow_krw: outflow,
      band: bw >= 4 ? { lo: 0, mid: 50000, hi: 120000 } : null,
      b0: inWeek.some((t) => Math.abs(t.amount) >= 300000 && ["transfer_out", "cash_withdraw", "card_daily", "micro_payment"].includes(t.category)),
      b3: fired,
    });
  }
  const map = new Map<string, Counterparty>();
  for (const t of sorted) {
    if (!t.cpKey) continue;
    const c = map.get(t.cpKey) ?? { cpKey: t.cpKey, label: t.cpLabel ?? "", type: t.cpType ?? "merchant", firstDay: t.day, txCount: 0, outKrw: 0, inKrw: 0 };
    c.txCount++;
    if (t.amount < 0) c.outKrw += -t.amount; else c.inKrw += t.amount;
    map.set(t.cpKey, c);
  }
  return { weeks, txs: sorted, counterparties: [...map.values()], report, modelVersion: "none" };
}
