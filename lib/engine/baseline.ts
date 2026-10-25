// L1 평소 (구현명세 §5-2) — 주 번호, 깨끗한 평소 주, 평소 범위 band, 통계 도우미.
// 브라우저·Node 공용, 외부 의존 없음.
import type { Category, Tx } from "./types";
import { mondayOf } from "./dates";

export const MAX_WEEKS = 52;
export const BASELINE_MAX = 8;
export const BASELINE_MIN = 4;
export const MIN_PER_DAY = 1440;

/** 필수 아님 출금(outflow) 범주 */
export const OUTFLOW_CATS: Category[] = ["transfer_out", "cash_withdraw", "micro_payment"];
/** S1이 보는 「쓰는 돈」 범주(자동이체·통신·대출 상환 같은 고정 출금은 뺀다) */
export const DISC_CATS: Category[] = ["transfer_out", "cash_withdraw", "card_daily", "micro_payment", "unknown"];
export const INCOME_CATS: Category[] = ["income_salary", "income_benefit"];

/** 거래의 절대 시각(분). 시각이 없으면 그날 0시로 본다(순서는 파일 순서로 따로 지킨다). */
export function absMinute(t: Tx): number {
  return t.day * MIN_PER_DAY + (t.minute ?? 0);
}

export function weekIndexer(txs: Tx[]): { w1: number; nWeeks: number; weekOf: (day: number) => number } {
  if (txs.length === 0) return { w1: 0, nWeeks: 0, weekOf: () => 0 };
  let first = Infinity;
  let last = -Infinity;
  for (const t of txs) {
    if (t.day < first) first = t.day;
    if (t.day > last) last = t.day;
  }
  let w1 = mondayOf(first);
  let nWeeks = Math.floor((last - w1) / 7) + 1;
  if (nWeeks > MAX_WEEKS) {
    w1 += (nWeeks - MAX_WEEKS) * 7;
    nWeeks = MAX_WEEKS;
  }
  return { w1, nWeeks, weekOf: (day: number) => Math.floor((day - w1) / 7) + 1 };
}

// ---------------------------------------------------------------- stats
export function median(xs: number[]): number {
  if (xs.length === 0) return 0;
  const s = [...xs].sort((a, b) => a - b);
  const m = s.length >> 1;
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

export function mad(xs: number[], med?: number): number {
  if (xs.length === 0) return 0;
  const m = med ?? median(xs);
  return median(xs.map((x) => Math.abs(x - m)));
}

/** 선형 보간 분위수(numpy 기본과 같은 방식) */
export function quantile(xs: number[], q: number): number {
  if (xs.length === 0) return 0;
  const s = [...xs].sort((a, b) => a - b);
  const pos = (s.length - 1) * q;
  const lo = Math.floor(pos);
  const hi = Math.ceil(pos);
  return s[lo] + (s[hi] - s[lo]) * (pos - lo);
}

export function mean(xs: number[]): number {
  if (xs.length === 0) return 0;
  let s = 0;
  for (const x of xs) s += x;
  return s / xs.length;
}

/** 모표준편차(ddof=0) */
export function std(xs: number[]): number {
  if (xs.length === 0) return 0;
  const m = mean(xs);
  let s = 0;
  for (const x of xs) s += (x - m) * (x - m);
  return Math.sqrt(s / xs.length);
}

/** −log10 P(X ≥ k | λ), 포아송, 10으로 자름 */
export function poissonTailScore(k: number, lambda: number): number {
  if (k <= 0) return 0;
  // P(X < k) = Σ_{i<k} e^{-λ} λ^i / i!
  let term = Math.exp(-lambda);
  let cdf = 0;
  for (let i = 0; i < k; i++) {
    if (i > 0) term = (term * lambda) / i;
    cdf += term;
  }
  const p = 1 - cdf;
  if (!(p > 0)) return 10;
  return Math.min(10, -Math.log10(p));
}

/** 평소 범위 띠: 중앙값 ± 2·1.4826·MAD (lo는 0 아래로 내려가지 않음) */
export function bandOf(outflows: number[]): { lo: number; mid: number; hi: number } | null {
  if (outflows.length < BASELINE_MIN) return null;
  const mid = median(outflows);
  const m = mad(outflows, mid);
  return { lo: Math.max(0, mid - 2 * 1.4826 * m), mid, hi: mid + 2 * 1.4826 * m };
}

export function isOutflowCat(c: Category): boolean {
  return OUTFLOW_CATS.includes(c);
}
