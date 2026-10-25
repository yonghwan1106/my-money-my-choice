// L1 신호 S1~S10 (구현명세 §5-2). 「facts」 숫자가 카드·요약의 유일한 숫자 출처다(금액은 원 단위 정수).
// 발화 조건 값은 SIGNAL_PARAMS 한 곳에 둔다 — 검증셋으로 1회 조정 뒤 동결(pipeline/signals_tuning.md, 태그 signals-frozen).
import type { Category, Facts, SignalId, SignalResult, Tx } from "./types";
import { ymd, dayNo } from "./dates";
import {
  BASELINE_MIN, DISC_CATS, MIN_PER_DAY, absMinute, mean, median, mad, poissonTailScore, quantile, std,
} from "./baseline";

export const SIGNAL_PARAMS = {
  s1_z: 6,                 // 로버스트 z ≥ (조정: 4 → 6, signals_tuning.md)
  s1_min_base: 3,          // 깨끗한 평소 주에 그 범주 거래가 이보다 적으면 그 앞 모든 주의 같은 범주로 비교
  s1_min_krw: 50_000,      // 금액 ≥ (조정: 없음 → 5만 원)
  s2_new_days: 28,         // 최근 28일 안에 처음 돈을 받은 사람
  s2_ratio: 1,             // 값 ≥
  s3_score: 2,             // −log10 P > (P < 0.01)
  s3_k: 3,                 // 7일 횟수 ≥
  s4_hours: 48,
  s4_raw: 0.6,             // 원비율 ≥
  s4_excess: 0.3,          // 평소 대비 ≥
  s5_hours: 72,
  s5_ratio: 0.7,
  s6_days: 30,
  s6_count: 2,
  s7_score: 2,
  s7_k: 6,
  s8_center: "mean" as "median" | "mean", // μ = 평소 주 outflow의 평균 (조정: 중앙값 → 평균)
  s8_k: 0.75,              // CUSUM 여유 k·σ (조정: 0.5 → 0.75)
  s8_step_cap: 2,          // 한 주가 더하는 몫 ≤ 2σ (큰 일 한 번이 몇 달 동안 S8을 켜 두지 않게)
  s8_h: 4,                 // C/σ ≥
  s8_c_cap: 5,             // C/σ 상한
  s9_ratio: 0.2,
  s9_min_base_krw: 0,      // 평소 주말 잔액 중앙값이 이보다 작으면 판단하지 않음(0 = 조건 없음)
  s9_first_cross: 1,       // 1 = 바닥으로 처음 내려간 주에만 발화(계속 바닥인 주는 다시 켜지 않음) (조정: 0 → 1)
  s10_days: 5,             // 예상 급여일 ± 5일
  s10_hours: 72,
  s10_ratio: 0.7,
  first_window_days: 28,   // 파일 첫 28일 안에 나온 상대 = 원래 있던 상대
};

/** 한 주의 요약(다음 주들의 「깨끗한 평소」로 쓰인다) */
export interface WeekRecord {
  week: number;
  outflow: number;                          // 송금+현금+소액결제
  totalOut: number;                         // 모든 출금
  transferOut: number;
  cash: number;                             // 현금 인출 합
  income: number;                           // 급여·수당 입금 합
  cpCounts: Record<string, number>;         // 상대방별 송금 횟수
  cpSums: Record<string, number>;           // 상대방별 송금 합
  microCount: number;
  discAmounts: Partial<Record<Category, number[]>>;
  incomeRatios: number[];                   // 그 주 급여·수당 입금 뒤 48시간 유출 비율
  closingBalance: number | null;
  fired: boolean;
}

/** 신호 계산에 필요한 누적 상태 (analyze.ts가 들고 다닌다) */
export interface SignalState {
  w1: number;
  firstDay: number;
  all: Tx[];                                // 지금까지 본 거래(시간 순)
  firstSeen: Map<string, number>;           // cpKey → 처음 나온 날(아무 거래)
  firstOut: Map<string, number>;            // cpKey(사람) → 처음 송금한 날
  firstBill: Map<string, number>;           // 통신·자동이체 cpKey → 처음 나온 날
  telecomKeys: Set<string>;
  records: WeekRecord[];
  cusum: number;
  leak: { weeks: number; excess: number; transfer: number; cash: number; cpSums: Record<string, number> };
  lastBalance: number | null;
  maxDay: number;
  prevLow: boolean;                         // 지난주 S9 값이 기준 아래였나
}

export interface WeekCtx {
  week: number;
  weekStart: number;                        // 일 번호
  weekEnd: number;                          // weekStart + 6
  txs: Tx[];                                // 이번 주 거래
  baseline: WeekRecord[];                   // 깨끗한 평소 주(최근 것부터, 최대 8)
  startIdx: number;                         // state.all에서 이번 주 첫 거래 위치
}

const ABS = (t: Tx) => Math.abs(t.amount);
const isOut = (t: Tx) => t.amount < 0;

function result(id: SignalId, value: number | null, fired: boolean, facts: Facts = {}, cpKeys: string[] = []): SignalResult {
  return { id, value, fired, facts, cpKeys: [...new Set(cpKeys)].sort() };
}

/** S2·특징 13 공통: 최근 28일 안에 처음 돈을 받은 사람(파일 첫 28일 안에 나온 사람은 제외) */
export function isNewPerson(st: SignalState, cpKey: string | null, weekEnd: number): boolean {
  if (!cpKey) return false;
  const fo = st.firstOut.get(cpKey);
  if (fo === undefined) return false;
  const fs = st.firstSeen.get(cpKey) ?? fo;
  return fo >= weekEnd - (SIGNAL_PARAMS.s2_new_days - 1) && fs >= st.firstDay + SIGNAL_PARAMS.first_window_days;
}

function bigCategory(c: Category): "card" | "transfer" | "cash" {
  if (c === "cash_withdraw") return "cash";
  if (c === "transfer_out") return "transfer";
  return "card";
}

// ---------------------------------------------------------------- S1
function s1(st: SignalState, ctx: WeekCtx, enough: boolean): SignalResult {
  if (!enough) return result("S1", null, false);
  const P = SIGNAL_PARAMS;
  let best: { z: number; t: Tx; med: number; fired: boolean } | null = null;
  for (const t of ctx.txs) {
    if (!isOut(t) || !DISC_CATS.includes(t.category)) continue;
    let base: number[] = [];
    for (const r of ctx.baseline) base.push(...(r.discAmounts[t.category] ?? []));
    // 깨끗한 평소 주에 그 범주 거래가 적으면(예: 한 달에 한 번 송금) 그 앞 모든 주의 같은 범주로 본다.
    // 그래도 없으면 중앙값 0 · 척도 10,000원(처음 보는 범주의 큰 출금).
    if (base.length < P.s1_min_base) {
      base = [];
      for (const r of st.records) base.push(...(r.discAmounts[t.category] ?? []));
    }
    const med = base.length ? median(base) : 0;
    const m = base.length ? mad(base, med) : 0;
    const scale = m > 0 ? 1.4826 * m : Math.max(med * 0.5, 10_000);
    const x = ABS(t);
    const z = (x - med) / scale;
    const fired = z >= P.s1_z && x >= (base.length ? quantile(base, 0.9) : 0) && x >= P.s1_min_krw;
    if (!best || (fired && !best.fired) || (fired === best.fired && z > best.z)) best = { z, t, med, fired };
  }
  if (!best) return result("S1", 0, false);
  const facts: Facts = {
    big_krw: ABS(best.t), big_category: bigCategory(best.t.category),
    big_place: best.t.category === "card_daily" || best.t.category === "micro_payment" ? best.t.cpLabel : null,
    usual_big_krw: Math.round(best.med),
  };
  return result("S1", best.z, best.fired, facts, best.fired && best.t.cpKey ? [best.t.cpKey] : []);
}

// ---------------------------------------------------------------- S2
function cumSince(st: SignalState, cpKey: string, fromDay: number, toDay: number) {
  let n = 0;
  let sum = 0;
  for (const t of st.all) {
    if (t.day < fromDay || t.day > toDay) continue;
    if (t.category === "transfer_out" && t.cpKey === cpKey) {
      n++;
      sum += ABS(t);
    }
  }
  return { n, sum };
}

function s2(st: SignalState, ctx: WeekCtx, enough: boolean): SignalResult {
  if (!enough) return result("S2", null, false);
  const P = SIGNAL_PARAMS;
  const wk: number[] = ctx.baseline.map((r) => r.transferOut);
  const denom = Math.max(quantile(wk, 0.75), 10_000);
  const perCp = new Map<string, number>();
  for (const t of ctx.txs) {
    if (t.category !== "transfer_out" || t.cpType !== "person" || !t.cpKey) continue;
    if (!isNewPerson(st, t.cpKey, ctx.weekEnd)) continue;
    perCp.set(t.cpKey, (perCp.get(t.cpKey) ?? 0) + ABS(t));
  }
  if (perCp.size === 0) return result("S2", 0, false);
  let total = 0;
  for (const v of perCp.values()) total += v;
  const value = total / denom;
  const fired = value >= P.s2_ratio;
  // facts: 누적 합이 가장 큰 사람
  let bestKey = "";
  let best = { n: 0, sum: -1, weeks: 0 };
  for (const k of perCp.keys()) {
    const fo = st.firstOut.get(k)!;
    const c = cumSince(st, k, fo, ctx.weekEnd);
    if (c.sum > best.sum) {
      const fw = Math.floor((fo - st.w1) / 7) + 1;
      best = { n: c.n, sum: c.sum, weeks: ctx.week - fw + 1 };
      bestKey = k;
    }
  }
  const facts: Facts = {
    cp_is_new: true, week_total_krw: total, cum_count: best.n, cum_weeks: best.weeks, cum_total_krw: best.sum,
  };
  return result("S2", value, fired, facts, fired ? [...perCp.keys()] : [bestKey]);
}

// ---------------------------------------------------------------- S3
function s3(st: SignalState, ctx: WeekCtx, enough: boolean): SignalResult {
  if (!enough) return result("S3", null, false);
  const P = SIGNAL_PARAMS;
  const k = new Map<string, number>();
  const sums = new Map<string, number>();
  for (const t of ctx.txs) {
    if (t.category !== "transfer_out" || !t.cpKey) continue;
    k.set(t.cpKey, (k.get(t.cpKey) ?? 0) + 1);
    sums.set(t.cpKey, (sums.get(t.cpKey) ?? 0) + ABS(t));
  }
  if (k.size === 0) return result("S3", 0, false);
  const nb = ctx.baseline.length;
  let best: { cp: string; score: number; k: number; lam: number; fired: boolean } | null = null;
  for (const [cp, kk] of k) {
    let c = 0;
    for (const r of ctx.baseline) c += r.cpCounts[cp] ?? 0;
    const lamTrue = nb > 0 ? c / nb : 0;
    const lam = lamTrue > 0 ? lamTrue : 0.1;
    const score = poissonTailScore(kk, lam);
    const fired = score > P.s3_score && kk >= P.s3_k;
    if (!best || (fired && !best.fired) || (fired === best.fired && score > best.score)) best = { cp, score, k: kk, lam: lamTrue, fired };
  }
  const b = best!;
  // 누적: 이번 주부터 거꾸로, 그 상대에게 평소보다 많이 보낸 주가 이어진 동안
  let n = b.k;
  let sum = sums.get(b.cp) ?? 0;
  let weeks = 1;
  for (let i = st.records.length - 1; i >= 0; i--) {
    const r = st.records[i];
    if (r.week !== ctx.week - weeks) break;
    const c = r.cpCounts[b.cp] ?? 0;
    if (c < 1 || c <= b.lam) break;
    n += c;
    sum += r.cpSums[b.cp] ?? 0;
    weeks++;
  }
  const facts: Facts = {
    cum_count: n, cum_weeks: weeks, cum_total_krw: sum, week_count: b.k, usual_week_count: Math.round(b.lam),
    cp_is_new: isNewPerson(st, b.cp, ctx.weekEnd),
  };
  return result("S3", b.score, b.fired, facts, [b.cp]);
}

// ---------------------------------------------------------------- S4·S5·S10 공통: 입금 뒤 유출
interface AfterOut { sum: number; transfer: number; cash: number; lastT: number; cps: string[]; inWeek: boolean }

function outAfter(
  st: SignalState, i: number, hours: number, weekEnd: number, weekStart: number,
  pick: (t: Tx) => boolean,
): AfterOut {
  const t0 = absMinute(st.all[i]);
  const lim = t0 + hours * 60;
  const res: AfterOut = { sum: 0, transfer: 0, cash: 0, lastT: t0, cps: [], inWeek: false };
  for (let j = i + 1; j < st.all.length; j++) {
    const t = st.all[j];
    if (t.day > weekEnd) break;
    const tm = absMinute(t);
    if (tm > lim) break;
    if (!isOut(t) || !pick(t)) continue;
    res.sum += ABS(t);
    if (t.category === "cash_withdraw") res.cash += ABS(t);
    else res.transfer += ABS(t);
    res.lastT = tm;
    if (t.cpKey) res.cps.push(t.cpKey);
    if (t.day >= weekStart) res.inWeek = true;
  }
  return res;
}

const isTransferOrCash = (t: Tx) => t.category === "transfer_out" || t.category === "cash_withdraw";

/** 이번 주에 볼 입금들: 이번 주 입금 + 창이 이번 주로 넘어온 지난 입금(이번 주 유출이 있을 때만) */
function eventsFor(st: SignalState, ctx: WeekCtx, hours: number, cats: Category[]): number[] {
  const from = ctx.weekStart * MIN_PER_DAY - hours * 60;
  const out: number[] = [];
  for (let i = 0; i < st.all.length; i++) {
    const t = st.all[i];
    if (t.day > ctx.weekEnd) break;
    if (!cats.includes(t.category) || t.amount <= 0) continue;
    if (absMinute(t) < from) continue;
    out.push(i);
  }
  return out;
}

/** 그 주 급여·수당 입금마다 48시간 유출 비율 (특징 18·평소 비율) */
export function incomeRatiosOfWeek(st: SignalState, ctx: WeekCtx): { i: number; r: number; o: AfterOut }[] {
  const res: { i: number; r: number; o: AfterOut }[] = [];
  for (const i of eventsFor(st, ctx, SIGNAL_PARAMS.s4_hours, ["income_salary", "income_benefit"])) {
    const inc = st.all[i];
    const o = outAfter(st, i, SIGNAL_PARAMS.s4_hours, ctx.weekEnd, ctx.weekStart, isTransferOrCash);
    const own = inc.day >= ctx.weekStart;
    if (!own && !o.inWeek) continue;
    res.push({ i, r: o.sum / inc.amount, o });
  }
  return res;
}

function hoursOf(o: AfterOut, t0: number): number {
  return Math.max(0, Math.ceil((o.lastT - t0) / 60));
}

function s4(st: SignalState, ctx: WeekCtx, enough: boolean, ratios: { i: number; r: number; o: AfterOut }[]): SignalResult {
  if (!enough) return result("S4", null, false);
  const P = SIGNAL_PARAMS;
  const usualList: number[] = [];
  for (const r of ctx.baseline) usualList.push(...r.incomeRatios);
  if (usualList.length === 0) return result("S4", null, false);
  const usual = mean(usualList);
  if (ratios.length === 0) return result("S4", 0, false);
  let best: { v: number; r: number; i: number; o: AfterOut; fired: boolean } | null = null;
  for (const x of ratios) {
    const v = x.r - usual;
    const fired = x.r >= P.s4_raw && v >= P.s4_excess;
    if (!best || (fired && !best.fired) || (fired === best.fired && v > best.v)) best = { v, r: x.r, i: x.i, o: x.o, fired };
  }
  const b = best!;
  const inc = st.all[b.i];
  const facts: Facts = {
    income_kind: inc.category === "income_salary" ? "salary" : "benefit", income_krw: inc.amount,
    out_after_income_krw: b.o.sum, hours: hoursOf(b.o, absMinute(inc)),
    out_mode: b.o.cash > b.o.transfer ? "cash" : "transfer",
  };
  return result("S4", b.v, b.fired, facts, b.fired ? b.o.cps : []);
}

function s5(st: SignalState, ctx: WeekCtx): SignalResult {
  const P = SIGNAL_PARAMS;
  let best: { v: number; i: number; o: AfterOut } | null = null;
  for (const i of eventsFor(st, ctx, P.s5_hours, ["loan_in"])) {
    const t = st.all[i];
    const o = outAfter(st, i, P.s5_hours, ctx.weekEnd, ctx.weekStart, isTransferOrCash);
    if (t.day < ctx.weekStart && !o.inWeek) continue;
    const v = o.sum / t.amount;
    if (!best || v > best.v) best = { v, i, o };
  }
  if (!best) return result("S5", 0, false);
  const t = st.all[best.i];
  const fired = best.v >= P.s5_ratio;
  const facts: Facts = {
    loan_krw: t.amount, out_after_income_krw: best.o.sum, hours: hoursOf(best.o, absMinute(t)),
    out_mode: best.o.cash > best.o.transfer ? "cash" : "transfer",
  };
  return result("S5", best.v, fired, facts, fired ? best.o.cps : []);
}

// ---------------------------------------------------------------- S6
function s6(st: SignalState, ctx: WeekCtx): SignalResult {
  const P = SIGNAL_PARAMS;
  const winStart = ctx.weekEnd - (P.s6_days - 1);
  let count = 0;
  let thisWeek = false;
  let usual = 0;
  for (const [k, d] of st.firstBill) {
    if (d > ctx.weekEnd) continue;
    if (d >= winStart && d >= st.firstDay + P.first_window_days) {
      count++;
      if (d >= ctx.weekStart) thisWeek = true;
    } else if (d < winStart && st.telecomKeys.has(k)) {
      usual++;
    }
  }
  // 같은 새 요금이 30일 내내 매주 다시 켜지지 않게, 새 상대가 이번 주에 처음 나온 주에만 발화
  const fired = count >= P.s6_count && thisWeek;
  return result("S6", count, fired, { new_bills: count, usual_bills: usual });
}

// ---------------------------------------------------------------- S7
function s7(ctx: WeekCtx, enough: boolean): SignalResult {
  if (!enough) return result("S7", null, false);
  const P = SIGNAL_PARAMS;
  let k = 0;
  let sum = 0;
  for (const t of ctx.txs) if (t.category === "micro_payment" && isOut(t)) { k++; sum += ABS(t); }
  const lamTrue = mean(ctx.baseline.map((r) => r.microCount));
  const lam = lamTrue > 0 ? lamTrue : 0.1;
  const v = poissonTailScore(k, lam);
  const fired = v > P.s7_score && k >= P.s7_k;
  return result("S7", v, fired, { micro_count: k, micro_total_krw: sum, usual_micro_count: Math.round(lamTrue) });
}

// ---------------------------------------------------------------- S8
function s8(st: SignalState, ctx: WeekCtx, enough: boolean, x: number, weekCp: Record<string, number>, weekCash: number, weekTransfer: number): SignalResult {
  const P = SIGNAL_PARAMS;
  if (!enough) {
    st.cusum = 0;
    st.leak = { weeks: 0, excess: 0, transfer: 0, cash: 0, cpSums: {} };
    return result("S8", null, false);
  }
  const xs = ctx.baseline.map((r) => r.outflow);
  const mu = P.s8_center === "mean" ? mean(xs) : median(xs);
  const sigma = Math.max(std(xs), 10_000);
  const step = Math.min(x - mu - P.s8_k * sigma, P.s8_step_cap * sigma);
  // C/σ는 h+1에서 자른다 — 큰 유출이 끝난 뒤 몇 달 동안 계속 켜져 있지 않게(여유 0.5σ씩 줄어 2주 뒤 꺼짐)
  st.cusum = Math.min(Math.max(0, st.cusum + step), P.s8_c_cap * sigma);
  if (st.cusum > 0) {
    const cps = { ...st.leak.cpSums };
    for (const [k, v] of Object.entries(weekCp)) cps[k] = (cps[k] ?? 0) + v;
    st.leak = {
      weeks: st.leak.weeks + 1, excess: st.leak.excess + (x - mu), transfer: st.leak.transfer + weekTransfer,
      cash: st.leak.cash + weekCash, cpSums: cps,
    };
  } else {
    st.leak = { weeks: 0, excess: 0, transfer: 0, cash: 0, cpSums: {} };
  }
  const v = st.cusum / sigma;
  const fired = v >= P.s8_h;
  let top: string | null = null;
  let topV = 0;
  for (const [k, val] of Object.entries(st.leak.cpSums)) if (val > topV) { topV = val; top = k; }
  const facts: Facts = {
    leak_weeks: st.leak.weeks, leak_excess_krw: Math.max(0, Math.round(st.leak.excess)),
    leak_mode: st.leak.cash > st.leak.transfer ? "cash" : "transfer",
    usual_week_krw: Math.round(mu), week_total_krw: x,
  };
  return result("S8", v, fired, facts, fired && top ? [top] : []);
}

// ---------------------------------------------------------------- S9
function s9(st: SignalState, ctx: WeekCtx, enough: boolean): SignalResult {
  if (!enough || st.lastBalance === null) {
    st.prevLow = false;
    return result("S9", null, false);
  }
  const bals = ctx.baseline.map((r) => r.closingBalance).filter((b): b is number => b !== null);
  if (bals.length === 0) { st.prevLow = false; return result("S9", null, false); }
  const med = median(bals);
  if (!(med > 0) || med < SIGNAL_PARAMS.s9_min_base_krw) { st.prevLow = false; return result("S9", null, false); }
  const v = st.lastBalance / med;
  const low = v <= SIGNAL_PARAMS.s9_ratio;
  const fired = low && !(SIGNAL_PARAMS.s9_first_cross && st.prevLow);
  st.prevLow = low;
  return result("S9", v, fired, fired ? { balance_low: true } : {});
}

// ---------------------------------------------------------------- S10
function s10(st: SignalState, ctx: WeekCtx): SignalResult {
  const P = SIGNAL_PARAMS;
  const past = st.all.filter((t) => t.category === "income_salary" && t.amount > 0 && t.day < ctx.weekStart);
  if (past.length < 2) return result("S10", null, false);
  const doms = past.map((t) => ymd(t.day).d);
  const dom = Math.round(median(doms));
  const usualAmt = Math.round(median(past.map((t) => t.amount)));
  let value = 0;
  let facts: Facts = {};
  let cps: string[] = [];
  // ① 예상 급여일 + 5일이 이번 주에 지났는데 급여가 없음
  const lastPast = past[past.length - 1].day;
  const checked = new Set<number>();
  for (let d = ctx.weekStart; d <= ctx.weekEnd; d++) {
    for (const base of [d, d - P.s10_days - 1]) {
    const { y, m } = ymd(base);
    const dim = new Date(Date.UTC(y, m, 0)).getUTCDate();
    const expected = dayNo(y, m, Math.min(dom, dim));
    const deadline = expected + P.s10_days;
    if (deadline !== d || checked.has(expected)) continue;
    checked.add(expected);
    if (deadline > st.maxDay) continue;            // 파일이 아직 그날까지 오지 않음
    if (expected - P.s10_days <= lastPast) continue; // 이미 이번 달 급여가 있었음
    const got = st.all.some((t) => t.category === "income_salary" && t.amount > 0 && t.day >= expected - P.s10_days && t.day <= deadline);
    if (!got) {
      value = 1;
      facts = { salary_day: dom, salary_mode: "missing", income_krw: usualAmt };
    }
    }
  }
  // ② 급여 뒤 72시간 안에 급여 보낸 곳과 같은 이름에게 송금
  for (const i of eventsFor(st, ctx, P.s10_hours, ["income_salary"])) {
    const sal = st.all[i];
    if (!sal.cpKey) continue;
    const o = outAfter(st, i, P.s10_hours, ctx.weekEnd, ctx.weekStart, (t) => t.category === "transfer_out" && t.cpKey === sal.cpKey);
    if (sal.day < ctx.weekStart && !o.inWeek) continue;
    const r = o.sum / sal.amount;
    if (r > value) {
      value = r;
      facts = {
        salary_day: dom, salary_mode: "returned", income_krw: sal.amount, out_after_income_krw: o.sum,
        hours: hoursOf(o, absMinute(sal)),
      };
      cps = [sal.cpKey];
    }
  }
  const fired = value >= P.s10_ratio;
  return result("S10", value, fired, facts, fired ? cps : []);
}

// ---------------------------------------------------------------- 묶음
export interface SignalBundle {
  signals: SignalResult[];
  incomeRatios: { i: number; r: number }[];
}

export function computeSignals(st: SignalState, ctx: WeekCtx): SignalBundle {
  const enough = ctx.baseline.length >= BASELINE_MIN;
  let x = 0;
  let cash = 0;
  let transfer = 0;
  const weekCp: Record<string, number> = {};
  for (const t of ctx.txs) {
    if (!isOut(t)) continue;
    if (t.category === "transfer_out" || t.category === "cash_withdraw" || t.category === "micro_payment") x += ABS(t);
    if (t.category === "cash_withdraw") cash += ABS(t);
    if (t.category === "transfer_out") {
      transfer += ABS(t);
      if (t.cpKey) weekCp[t.cpKey] = (weekCp[t.cpKey] ?? 0) + ABS(t);
    }
  }
  const ratios = incomeRatiosOfWeek(st, ctx);
  const signals = [
    s1(st, ctx, enough),
    s2(st, ctx, enough),
    s3(st, ctx, enough),
    s4(st, ctx, enough, ratios),
    s5(st, ctx),
    s6(st, ctx),
    s7(ctx, enough),
    s8(st, ctx, enough, x, weekCp, cash, transfer),
    s9(st, ctx, enough),
    s10(st, ctx),
  ];
  return { signals, incomeRatios: ratios.map((r) => ({ i: r.i, r: r.r })) };
}
