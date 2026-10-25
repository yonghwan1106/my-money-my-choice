// L2 특징 22개 (구현명세 §5-3). 순서 = data/model/feature_names.json. null은 −1.
import type { SignalResult, Tx } from "./types";
import { BASELINE_MIN, median } from "./baseline";
import type { SignalState, WeekCtx, WeekRecord } from "./signals";
import { isNewPerson } from "./signals";

export const FEATURE_NAMES = [
  "s1", "s2", "s3", "s4", "s5", "s6", "s7", "s8", "s9", "s10",
  "baseline_missing", "out_total_ratio", "n_transfer_cps", "new_cp_share", "night_out_share",
  "cash_share", "unknown_share", "baseline_weeks", "a1_income_out48", "a2_transfer_income_4w",
  "a3_cash_income_4w", "a4_top_cp_share_4w",
] as const;

/** 「왜?」 막대 쉬운 이름 */
export const FEATURE_LABELS: Record<(typeof FEATURE_NAMES)[number], string> = {
  s1: "평소보다 큰 돈", s2: "처음 돈을 보낸 사람", s3: "같은 사람에게 여러 번", s4: "수입 직후 빠져나감",
  s5: "대출금이 바로 나감", s6: "새 자동 출금", s7: "작은 결제가 많음", s8: "조금씩 계속 나감",
  s9: "잔액이 바닥", s10: "월급이 달라짐",
  baseline_missing: "평소 기록이 짧음", out_total_ratio: "이번 주 나간 돈", n_transfer_cps: "보낸 사람 수",
  new_cp_share: "처음 보낸 사람에게 간 몫", night_out_share: "밤에 나간 돈", cash_share: "현금으로 찾은 몫",
  unknown_share: "어디에 썼는지 모르는 몫", baseline_weeks: "평소를 배운 주 수",
  a1_income_out48: "수입이 금방 나간 몫", a2_transfer_income_4w: "수입 대비 보낸 돈(4주)",
  a3_cash_income_4w: "수입 대비 현금(4주)", a4_top_cp_share_4w: "한 사람에게 몰린 몫(4주)",
};

const ABS = (t: Tx) => Math.abs(t.amount);

/** 이번 주 거래로 만든 주 요약(특징 계산·다음 주 평소에 같이 쓴다) */
export function weekRecordOf(ctx: WeekCtx, signals: SignalResult[], incomeRatios: { i: number; r: number }[],
  st: SignalState, closingBalance: number | null): WeekRecord {
  const rec: WeekRecord = {
    week: ctx.week, outflow: 0, totalOut: 0, transferOut: 0, cash: 0, income: 0, cpCounts: {}, cpSums: {},
    microCount: 0, discAmounts: {}, incomeRatios: [], closingBalance, fired: signals.some((s) => s.fired),
  };
  for (const t of ctx.txs) {
    if (t.amount < 0) {
      const a = ABS(t);
      rec.totalOut += a;
      if (t.category === "transfer_out" || t.category === "cash_withdraw" || t.category === "micro_payment") rec.outflow += a;
      if (t.category === "transfer_out") {
        rec.transferOut += a;
        if (t.cpKey) {
          rec.cpCounts[t.cpKey] = (rec.cpCounts[t.cpKey] ?? 0) + 1;
          rec.cpSums[t.cpKey] = (rec.cpSums[t.cpKey] ?? 0) + a;
        }
      }
      if (t.category === "cash_withdraw") rec.cash += a;
      if (t.category === "micro_payment") rec.microCount++;
      (rec.discAmounts[t.category] ??= []).push(a);
    } else if (t.category === "income_salary" || t.category === "income_benefit") {
      rec.income += t.amount;
    }
  }
  // 평소 비율에는 그 주에 들어온 입금만 쓴다
  for (const x of incomeRatios) if (st.all[x.i].day >= ctx.weekStart) rec.incomeRatios.push(x.r);
  return rec;
}

export function computeFeatures(st: SignalState, ctx: WeekCtx, signals: SignalResult[],
  incomeRatios: { i: number; r: number }[], rec: WeekRecord): number[] {
  const f: number[] = signals.map((s) => (s.value === null || !Number.isFinite(s.value) ? -1 : s.value));
  const nb = ctx.baseline.length;
  f.push(nb < BASELINE_MIN ? 1 : 0);
  // 11 이번 주 총출금 / 평소 주간 총출금 중앙값
  const medTot = nb >= BASELINE_MIN ? median(ctx.baseline.map((r) => r.totalOut)) : 0;
  f.push(medTot > 0 ? rec.totalOut / medTot : -1);
  // 12 송금 상대 수
  f.push(Object.keys(rec.cpCounts).length);
  // 13 처음 보낸 사람 몫
  let newSum = 0;
  for (const t of ctx.txs) {
    if (t.category === "transfer_out" && t.cpType === "person" && isNewPerson(st, t.cpKey, ctx.weekEnd)) newSum += ABS(t);
  }
  f.push(rec.transferOut > 0 ? newSum / rec.transferOut : 0);
  // 14 0~5시 출금 몫, 15 현금 몫, 16 분류 모름 몫
  let night = 0;
  let unknown = 0;
  for (const t of ctx.txs) {
    if (t.amount >= 0) continue;
    if (t.minute !== null && t.minute < 360) night += ABS(t);
    if (t.category === "unknown") unknown += ABS(t);
  }
  f.push(rec.totalOut > 0 ? night / rec.totalOut : 0);
  f.push(rec.totalOut > 0 ? rec.cash / rec.totalOut : 0);
  f.push(rec.totalOut > 0 ? unknown / rec.totalOut : 0);
  // 17 평소 주 수
  f.push(nb);
  // 18 이번 주 수입 뒤 48시간 유출 비율 최댓값
  const own = incomeRatios.filter((x) => st.all[x.i].day >= ctx.weekStart).map((x) => x.r);
  f.push(own.length ? Math.max(...own) : -1);
  // 19~21 최근 4주(이번 주 포함)
  const last4: WeekRecord[] = [rec];
  for (let i = st.records.length - 1; i >= 0 && last4.length < 4; i--) {
    if (st.records[i].week < ctx.week - 3) break;
    last4.push(st.records[i]);
  }
  let inc = 0;
  let tr = 0;
  let cash = 0;
  const cps: Record<string, number> = {};
  for (const r of last4) {
    inc += r.income;
    tr += r.transferOut;
    cash += r.cash;
    for (const [k, v] of Object.entries(r.cpSums)) cps[k] = (cps[k] ?? 0) + v;
  }
  f.push(inc > 0 ? tr / inc : -1);
  f.push(inc > 0 ? cash / inc : -1);
  let top = 0;
  for (const v of Object.values(cps)) if (v > top) top = v;
  f.push(tr > 0 ? top / tr : -1);
  return f;
}
