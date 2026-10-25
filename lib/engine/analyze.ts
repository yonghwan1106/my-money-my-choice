// 분석 (구현명세 §5-4): 주 단위로 앞에서부터 평소 → 신호 → 특징 → (모델) → 단계·수법·why·band·b0·b3.
// analyzeWeek(state, txsOfWeek)로 쪼개 둔다(증분 — 실서비스 마이데이터 연결 자리).
import type { AnalyzeResult, Level, ParseReport, Tx, WeekResult } from "./types";
import { BASELINE_MAX, bandOf, weekIndexer } from "./baseline";
import type { SignalState, WeekCtx, WeekRecord } from "./signals";
import { computeSignals } from "./signals";
import { FEATURE_LABELS, FEATURE_NAMES, computeFeatures, weekRecordOf } from "./features";
import { b0Of, b3Of } from "./baselines";
import { isInsufficient, levelFromCount, levelFromProb, patternsOf } from "./risk";
import { summarizeCounterparties } from "./counterparty";
import type { Scorer } from "./model";
import { gbmScorer, lrScorer } from "./model";

export type { Scorer };

export type ModelChoice = "gbm" | "lr" | "none";

export function createState(w1: number, firstDay: number): SignalState {
  return {
    w1, firstDay, all: [], firstSeen: new Map(), firstOut: new Map(), firstBill: new Map(), telecomKeys: new Set(),
    records: [], cusum: 0, leak: { weeks: 0, excess: 0, transfer: 0, cash: 0, cpSums: {} }, lastBalance: null,
    maxDay: -Infinity, prevLow: false,
  };
}

function cleanBaseline(records: WeekRecord[]): WeekRecord[] {
  const out: WeekRecord[] = [];
  for (let i = records.length - 1; i >= 0 && out.length < BASELINE_MAX; i--) if (!records[i].fired) out.push(records[i]);
  return out;
}

/** 한 주 분석. state를 앞으로 진행시킨다(state는 이 함수 안에서만 바뀐다). */
export function analyzeWeek(st: SignalState, week: number, txsOfWeek: Tx[], scorer: Scorer | null): WeekResult {
  const weekStart = st.w1 + (week - 1) * 7;
  const weekEnd = weekStart + 6;
  const startIdx = st.all.length;
  for (const t of txsOfWeek) {
    st.all.push(t);
    if (t.day > st.maxDay) st.maxDay = t.day;
    if (t.balance !== null) st.lastBalance = t.balance;
    if (!t.cpKey) continue;
    if (!st.firstSeen.has(t.cpKey)) st.firstSeen.set(t.cpKey, t.day);
    if (t.category === "transfer_out" && t.cpType === "person" && !st.firstOut.has(t.cpKey)) st.firstOut.set(t.cpKey, t.day);
    if ((t.category === "telecom" || t.category === "bill_recurring") && !st.firstBill.has(t.cpKey)) {
      st.firstBill.set(t.cpKey, t.day);
    }
    if (t.category === "telecom") st.telecomKeys.add(t.cpKey);
  }
  const baseline = cleanBaseline(st.records);
  const ctx: WeekCtx = { week, weekStart, weekEnd, txs: txsOfWeek, baseline, startIdx };
  const { signals, incomeRatios } = computeSignals(st, ctx);
  const rec = weekRecordOf(ctx, signals, incomeRatios, st, st.lastBalance);
  const features = computeFeatures(st, ctx, signals, incomeRatios, rec);
  st.records.push(rec);

  const b3 = b3Of(signals);
  const insufficient = isInsufficient(baseline.length, signals);
  let prob: number | null = null;
  let level: Level;
  let why: WeekResult["why"] = [];
  let topFeatures: string[] = [];
  if (insufficient) {
    level = "insufficient";
  } else if (scorer) {
    const s = scorer.score(features);
    prob = s.prob;
    level = levelFromProb(prob, scorer.t1, scorer.t2);
    if (s.contributions) {
      const idx = s.contributions.map((c, i) => [c, i] as const).sort((a, b) => b[0] - a[0]);
      topFeatures = idx.filter(([c]) => c > 0).map(([, i]) => FEATURE_NAMES[i]);
      why = idx.filter(([c]) => c > 0).slice(0, 3).map(([c, i]) => ({
        feature: FEATURE_NAMES[i], label: FEATURE_LABELS[FEATURE_NAMES[i]], contribution: c,
      }));
    }
  } else {
    level = levelFromCount(b3);
  }
  const { pattern, pattern2, facts } = patternsOf(signals, level, topFeatures);
  const cpKeys = [...new Set(signals.filter((s) => s.fired).flatMap((s) => s.cpKeys))].sort();
  return {
    week, weekStartDay: weekStart, baselineWeeks: baseline.length, signals, anyFired: rec.fired, features, prob,
    level, pattern, pattern2, facts, cpKeys, hasCp: cpKeys.length > 0, why, txIds: txsOfWeek.map((t) => t.id),
    outflow_krw: rec.outflow, band: bandOf(baseline.map((r) => r.outflow)), b0: b0Of(txsOfWeek), b3,
  };
}

export function analyze(txs: Tx[], report: ParseReport, opts?: { model?: ModelChoice }): AnalyzeResult {
  const choice: ModelChoice = opts?.model ?? "gbm";
  const scorer = choice === "gbm" ? gbmScorer : choice === "lr" ? lrScorer : null;
  const sorted = [...txs].sort((a, b) => a.day - b.day || (a.minute ?? -1) - (b.minute ?? -1));
  const { w1, nWeeks, weekOf } = weekIndexer(sorted);
  const kept = sorted.filter((t) => t.day >= w1);
  const byWeek: Tx[][] = Array.from({ length: nWeeks }, () => []);
  for (const t of kept) byWeek[weekOf(t.day) - 1].push(t);
  const st = createState(w1, kept.length ? kept[0].day : 0);
  const weeks: WeekResult[] = [];
  for (let w = 1; w <= nWeeks; w++) weeks.push(analyzeWeek(st, w, byWeek[w - 1], scorer));
  return {
    weeks, txs: kept, counterparties: summarizeCounterparties(kept), report,
    modelVersion: scorer ? scorer.version : "none",
  };
}
