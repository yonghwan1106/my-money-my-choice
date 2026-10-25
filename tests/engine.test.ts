// A3 — 평소·신호·특징·B0·B3 시험 (구현명세 §5-2~§5-4). 실행: npx --prefix <repo> tsx --test <repo>\tests\engine.test.ts
import { test } from "node:test";
import assert from "node:assert/strict";
import type { Category, CpType, ParseReport, SignalId, Tx, WeekResult } from "../lib/engine/types";
import { analyze } from "../lib/engine/analyze";
import { bandOf, poissonTailScore, quantile, weekIndexer } from "../lib/engine/baseline";
import { b0Of, b3Of } from "../lib/engine/baselines";
import { FEATURE_NAMES } from "../lib/engine/features";
import { patternsOf } from "../lib/engine/risk";

const D0 = Date.UTC(2026, 3, 6) / 86400000; // 2026-04-06(월)
let seq = 0;
function tx(day: number, minute: number | null, amount: number, category: Category,
  cpKey: string | null = null, cpType: CpType | null = null, balance: number | null = null): Tx {
  seq++;
  return {
    id: "r" + seq, day: D0 + day, minute, amount, balance, memo: "", branch: null, category,
    cpKey, cpLabel: cpKey, cpType: cpKey ? (cpType ?? "person") : null,
  };
}
const REPORT: ParseReport = {
  encoding: "utf-8", headerRow: 0, columns: [], rowsRead: 0, rowsSkipped: 0, missingRequired: [],
  unknownCategoryShare: 0, firstDay: null, lastDay: null,
};

/** n주 동안의 평소: 주마다 카드 5천·6천·7천, 가족 cp_fam에게 2만 1번, 잔액 100만 근처 */
function usual(nWeeks: number, opts: { fam?: boolean; balance?: boolean } = {}): Tx[] {
  const out: Tx[] = [];
  for (let w = 0; w < nWeeks; w++) {
    const b = opts.balance === false ? null : 1_000_000;
    out.push(tx(w * 7 + 1, 600, -5000, "card_daily", "shop_a", "merchant", b));
    out.push(tx(w * 7 + 2, 700, -6000, "card_daily", "shop_b", "merchant", b));
    out.push(tx(w * 7 + 3, 800, -7000, "card_daily", "shop_a", "merchant", b));
    if (opts.fam !== false) out.push(tx(w * 7 + 4, 900, -20000, "transfer_out", "cp_fam", "person", b));
  }
  return out;
}
function run(txs: Tx[]): WeekResult[] {
  return analyze(txs, REPORT, { model: "none" }).weeks;
}
const sig = (w: WeekResult, id: SignalId) => w.signals.find((s) => s.id === id)!;

test("주 경계: 일요일 23:59는 그 주, 월요일 00:00은 다음 주", () => {
  const txs = [tx(0, 600, -1000, "card_daily", "m", "merchant"), tx(6, 1439, -1000, "card_daily", "m", "merchant"),
    tx(7, 0, -1000, "card_daily", "m", "merchant")];
  const ix = weekIndexer(txs);
  assert.equal(ix.weekOf(D0 + 6), 1);
  assert.equal(ix.weekOf(D0 + 7), 2);
  const ws = run(txs);
  assert.equal(ws.length, 2);
  assert.equal(ws[0].txIds.length, 2);
  assert.equal(ws[1].txIds.length, 1);
});

test("파일 첫 거래가 수요일이어도 그 주 월요일이 1주", () => {
  const ws = run([tx(2, 600, -1000, "card_daily", "m", "merchant"), tx(9, 600, -1000, "card_daily", "m", "merchant")]);
  assert.equal(ws[0].weekStartDay, D0);
  assert.equal(ws.length, 2);
});

test("평소 4주 미만 → 평소가 필요한 신호는 null, 단계 insufficient", () => {
  const ws = run([...usual(3), tx(17, 600, -900000, "card_daily", "shop_a", "merchant")]);
  const w3 = ws[2];
  assert.equal(w3.baselineWeeks, 2);
  for (const id of ["S1", "S2", "S3", "S4", "S7", "S8", "S9"] as SignalId[]) {
    assert.equal(sig(w3, id).value, null, id);
    assert.equal(sig(w3, id).fired, false, id);
  }
  assert.equal(w3.level, "insufficient");
  assert.equal(w3.prob, null);
  assert.equal(w3.band, null);
  assert.equal(w3.features[FEATURE_NAMES.indexOf("baseline_missing")], 1);
});

test("판단 보류 예외: 평소 4주 미만이어도 S5(대출 통과)는 켜지고 단계가 나온다", () => {
  const ws = run([...usual(2), tx(8, 600, 3_000_000, "loan_in", "lender", "lender"), tx(8, 900, -2_800_000, "transfer_out", "cp_x", "person")]);
  assert.equal(sig(ws[1], "S5").fired, true);
  assert.notEqual(ws[1].level, "insufficient");
  assert.equal(ws[1].pattern, "loan_passthrough");
});

test("S1 평소보다 큰 돈: 카드 50만 원은 켜지고 6천 원은 안 켜짐", () => {
  const on = run([...usual(6), tx(43, 600, -500000, "card_daily", "shop_c", "merchant")]);
  const w = on[6];
  assert.equal(sig(w, "S1").fired, true);
  assert.equal(sig(w, "S1").facts.big_krw, 500000);
  assert.equal(sig(w, "S1").facts.big_category, "card");
  assert.equal(sig(w, "S1").facts.big_place, "shop_c");
  const off = run([...usual(6), tx(43, 600, -6000, "card_daily", "shop_c", "merchant")]);
  assert.equal(sig(off[6], "S1").fired, false);
});

test("신호가 켜진 주는 다음 주 평소에서 빠진다", () => {
  const ws = run([...usual(6), tx(43, 600, -500000, "card_daily", "shop_c", "merchant"), ...usual(8).map((t) => ({ ...t, day: t.day + 49, id: t.id + "b" }))]);
  assert.equal(ws[6].anyFired, true);
  assert.equal(ws[7].baselineWeeks, 6); // 1~6주만(7주는 켜져서 빠짐)
  assert.equal(ws[8].baselineWeeks, 7);
});

test("S2 처음 돈을 받은 사람: 새 사람에게 20만 원 → 켜짐, 원래 있던 가족 → 안 켜짐", () => {
  const ws = run([...usual(6), tx(43, 600, -200000, "transfer_out", "cp_new", "person")]);
  const s = sig(ws[6], "S2");
  assert.equal(s.fired, true);
  assert.deepEqual(s.cpKeys, ["cp_new"]);
  assert.equal(s.facts.cp_is_new, true);
  assert.equal(s.facts.cum_count, 1);
  assert.equal(s.facts.cum_total_krw, 200000);
  const off = run([...usual(6), tx(43, 600, -200000, "transfer_out", "cp_fam", "person")]);
  assert.equal(sig(off[6], "S2").fired, false);
  // 파일 첫 28일 안에 나온 사람은 「원래 있던 사람」
  const early = run([tx(1, 600, 10000, "transfer_in", "cp_old", "person"), ...usual(6), tx(43, 600, -200000, "transfer_out", "cp_old", "person")]);
  assert.equal(sig(early[6], "S2").fired, false);
});

test("S2 누적: 처음 보낸 주부터 이번 주까지 횟수·합·주 수", () => {
  const ws = run([...usual(6), tx(43, 600, -100000, "transfer_out", "cp_new", "person"),
    tx(45, 600, -100000, "transfer_out", "cp_new", "person"), tx(50, 600, -300000, "transfer_out", "cp_new", "person")]);
  const s = sig(ws[7], "S2");
  assert.equal(s.fired, true);
  assert.equal(s.facts.cum_count, 3);
  assert.equal(s.facts.cum_weeks, 2);
  assert.equal(s.facts.cum_total_krw, 500000);
});

test("S3 같은 사람에게 여러 번: 평소 주 1번인 가족에게 6번 → 켜짐, 2번 → 안 켜짐", () => {
  const six = Array.from({ length: 6 }, (_, i) => tx(42 + (i % 7), 600 + i, -20000, "transfer_out", "cp_fam", "person"));
  const ws = run([...usual(6, { fam: true }), ...six]);
  const s = sig(ws[6], "S3");
  assert.equal(s.fired, true);
  assert.equal(s.facts.week_count, 6);
  assert.equal(s.facts.usual_week_count, 1);
  const two = run([...usual(6), tx(43, 600, -20000, "transfer_out", "cp_fam", "person"), tx(44, 600, -20000, "transfer_out", "cp_fam", "person")]);
  assert.equal(sig(two[6], "S3").fired, false);
  assert.ok(Math.abs(poissonTailScore(6, 1) - -Math.log10(1 - 0.9994058)) < 1e-3);
});

function withSalary(weeks: number): Tx[] {
  const out = usual(weeks);
  for (let w = 0; w < weeks; w += 4) out.push(tx(w * 7, 600, 1_000_000, "income_salary", "emp", "employer", 1_000_000));
  return out;
}

test("S4 수입 직후 빠져나감: 급여 뒤 10시간 안 80% 송금 → 켜짐, 사흘 뒤 → 안 켜짐", () => {
  const ws = run([...withSalary(6), tx(42, 540, 1_000_000, "income_salary", "emp", "employer"),
    tx(42, 1140, -800000, "transfer_out", "cp_x", "person")]);
  const s = sig(ws[6], "S4");
  assert.equal(s.fired, true);
  assert.equal(s.facts.income_kind, "salary");
  assert.equal(s.facts.out_after_income_krw, 800000);
  assert.equal(s.facts.hours, 10);
  assert.equal(s.facts.out_mode, "transfer");
  assert.ok(ws[6].features[FEATURE_NAMES.indexOf("a1_income_out48")] >= 0.8);
  const late = run([...withSalary(6), tx(42, 540, 1_000_000, "income_salary", "emp", "employer"),
    tx(45, 1140, -800000, "transfer_out", "cp_x", "person")]);
  assert.equal(sig(late[6], "S4").fired, false);
});

test("S5 대출금이 바로 나감: 72시간 안 93% → 켜짐, 유출 없음 → 안 켜짐", () => {
  const ws = run([...usual(6), tx(43, 600, 3_000_000, "loan_in", "lender", "lender"), tx(43, 900, -2_800_000, "transfer_out", "cp_y", "person")]);
  assert.equal(sig(ws[6], "S5").fired, true);
  assert.equal(sig(ws[6], "S5").facts.loan_krw, 3_000_000);
  const off = run([...usual(6), tx(43, 600, 3_000_000, "loan_in", "lender", "lender")]);
  assert.equal(sig(off[6], "S5").fired, false);
});

test("S6 새 자동 출금: 30일 안 새 통신 2개 → 켜짐, 1개 → 안 켜짐, 파일 첫 28일 안 → 원래 있던 것", () => {
  const base = [...usual(6), tx(2, 400, -40000, "telecom", "tel_old", "biller")];
  const on = run([...base, tx(43, 400, -50000, "telecom", "tel_a", "biller"), tx(44, 400, -50000, "telecom", "tel_b", "biller")]);
  const s = sig(on[6], "S6");
  assert.equal(s.fired, true);
  assert.equal(s.facts.new_bills, 2);
  assert.equal(s.facts.usual_bills, 1);
  const one = run([...base, tx(43, 400, -50000, "telecom", "tel_a", "biller")]);
  assert.equal(sig(one[6], "S6").fired, false);
  const early = run([tx(3, 400, -50000, "telecom", "tel_a", "biller"), tx(4, 400, -50000, "telecom", "tel_b", "biller"), ...usual(6)]);
  assert.equal(early.some((w) => sig(w, "S6").fired), false);
});

test("S7 작은 결제가 많음: 평소 0번 → 10번 켜짐, 3번 안 켜짐", () => {
  const ten = Array.from({ length: 10 }, (_, i) => tx(42 + (i % 5), 700 + i, -9000, "micro_payment", "app", "merchant"));
  const ws = run([...usual(6), ...ten]);
  assert.equal(sig(ws[6], "S7").fired, true);
  assert.equal(sig(ws[6], "S7").facts.micro_count, 10);
  assert.equal(sig(ws[6], "S7").facts.micro_total_krw, 90000);
  const three = Array.from({ length: 3 }, (_, i) => tx(42 + i, 700, -9000, "micro_payment", "app", "merchant"));
  assert.equal(sig(run([...usual(6), ...three])[6], "S7").fired, false);
});

test("S8 조금씩 계속 나감: 평소보다 몇 주 연속 더 나가면 켜짐, 평소대로면 안 켜짐", () => {
  const extra: Tx[] = [];
  for (let w = 8; w < 14; w++) extra.push(tx(w * 7 + 5, 600, -60000, "cash_withdraw"));
  const ws = run([...usual(14), ...extra]);
  assert.ok(ws.slice(8).some((w) => sig(w, "S8").fired));
  const f = ws.slice(8).find((w) => sig(w, "S8").fired)!;
  assert.equal(sig(f, "S8").facts.leak_mode, "cash");
  assert.ok((sig(f, "S8").facts.leak_weeks ?? 0) >= 2);
  const calm = run(usual(14));
  assert.equal(calm.some((w) => sig(w, "S8").fired), false);
});

test("S9 잔액이 바닥: 평소 100만 → 5만", () => {
  const ws = run([...usual(6), tx(43, 600, -950000, "card_daily", "shop_a", "merchant", 50000)]);
  assert.equal(sig(ws[6], "S9").fired, true);
  assert.equal(sig(ws[6], "S9").facts.balance_low, true);
  const nobal = run([...usual(6, { balance: false })]);
  assert.equal(sig(nobal[5], "S9").value, null);
});

test("S10 월급이 달라짐: 예상일 + 5일이 지나도 없음 → 켜짐 / 급여 준 곳으로 되돌림 → 켜짐", () => {
  // 급여 매달 10일(2026-04-10 = D0+4, 05-10 = D0+34, 06-10 = D0+65), 7월 10일 급여 없음 → 7/15(D0+100)가 든 주
  const base = usual(16);
  const sal = [4, 34, 65].map((d) => tx(d, 600, 1_200_000, "income_salary", "emp", "employer", 1_000_000));
  const ws = run([...base, ...sal]);
  const wk = Math.floor(100 / 7) + 1;
  const s = sig(ws[wk - 1], "S10");
  assert.equal(s.fired, true);
  assert.equal(s.facts.salary_mode, "missing");
  assert.equal(s.facts.salary_day, 10);
  // 되돌림: 7/10 급여 → 같은 이름(emp)에게 90%
  const ret = run([...base, ...sal, tx(95, 600, 1_200_000, "income_salary", "emp", "employer"), tx(96, 600, -1_080_000, "transfer_out", "emp", "merchant")]);
  const r = sig(ret[Math.floor(95 / 7)], "S10");
  assert.equal(r.fired, true);
  assert.equal(r.facts.salary_mode, "returned");
  assert.deepEqual(r.cpKeys, ["emp"]);
  // 급여 기록 1번뿐이면 판단하지 않음
  assert.equal(sig(run([...base, sal[0]])[wk - 1], "S10").value, null);
});

test("band: 평소 주 outflow 중앙값 ± 2·1.4826·MAD", () => {
  const b = bandOf([10, 20, 30, 40, 50])!;
  assert.equal(b.mid, 30);
  assert.ok(Math.abs(b.hi - (30 + 2 * 1.4826 * 10)) < 1e-9);
  assert.equal(b.lo, Math.max(0, 30 - 2 * 1.4826 * 10));
  assert.equal(bandOf([1, 2, 3]), null);
  const ws = run(usual(6));
  assert.deepEqual(ws[5].band, { lo: 20000, mid: 20000, hi: 20000 });
  assert.equal(ws[5].outflow_krw, 20000);
  assert.equal(quantile([1, 2, 3, 4], 0.75), 3.25);
});

test("B0·B3", () => {
  assert.equal(b0Of([tx(1, 600, -300000, "card_daily", "m", "merchant")]), true);
  assert.equal(b0Of([tx(1, 600, -299999, "card_daily", "m", "merchant")]), false);
  assert.equal(b0Of([tx(1, 600, -500000, "bill_recurring", "rent", "biller")]), false);
  assert.equal(b0Of([tx(1, 600, -500000, "telecom", "t", "biller"), tx(1, 600, -500000, "loan_repay", "l", "biller")]), false);
  assert.equal(b0Of([1, 2, 3].map((i) => tx(1, 600 + i, -10000, "transfer_out", "a", "person"))), true);
  assert.equal(b0Of([1, 2].map((i) => tx(1, 600 + i, -10000, "transfer_out", "a", "person"))), false);
  const ws = run([...usual(6), tx(43, 600, -500000, "card_daily", "shop_c", "merchant")]);
  assert.equal(ws[6].b3, b3Of(ws[6].signals));
  assert.equal(ws[6].b0, true);
});

test("특징 22개·이름 순서·결과 꼴", () => {
  assert.equal(FEATURE_NAMES.length, 22);
  const ws = run(usual(6));
  for (const w of ws) {
    assert.equal(w.signals.length, 10);
    assert.deepEqual(w.signals.map((s) => s.id), ["S1", "S2", "S3", "S4", "S5", "S6", "S7", "S8", "S9", "S10"]);
    assert.equal(w.features.length, 22);
    assert.ok(w.features.every((x) => Number.isFinite(x)));
  }
});

test("수법 이름 순서: 대출 > 새 휴대폰 > 월급 > 강한 같은 사람 > 수입 직후 > … ", () => {
  const S = (fired: SignalId[], facts: Partial<Record<SignalId, object>> = {}) =>
    (["S1", "S2", "S3", "S4", "S5", "S6", "S7", "S8", "S9", "S10"] as SignalId[]).map((id) => ({
      id, value: 1, fired: fired.includes(id), facts: (facts[id] ?? {}) as object, cpKeys: [],
    }));
  assert.deepEqual([patternsOf(S(["S4", "S5"]), "high", null).pattern, patternsOf(S(["S4", "S5"]), "high", null).pattern2], ["loan_passthrough", "after_income"]);
  const strong = patternsOf(S(["S2", "S4"], { S2: { cum_count: 3 } }), "high", null);
  assert.deepEqual([strong.pattern, strong.pattern2], ["same_person", "after_income"]);
  const weak = patternsOf(S(["S2", "S4"], { S2: { cum_count: 1 } }), "high", null);
  assert.deepEqual([weak.pattern, weak.pattern2], ["after_income", "same_person"]);
  assert.equal(patternsOf(S(["S1"]), "watch", null).pattern, "big_spend");
  assert.equal(patternsOf(S([]), "watch", "s7").pattern, "micro_repeat");
  assert.equal(patternsOf(S([]), "watch", "cash_share").pattern, "slow_leak");
  assert.equal(patternsOf(S(["S1"]), "normal", null).pattern, null);
});
