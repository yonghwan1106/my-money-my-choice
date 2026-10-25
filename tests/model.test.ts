// A6 — 모델 평가기 시험 (구현명세 §5-4). 실행: npx --prefix <repo> tsx --test <repo>\tests\model.test.ts
import { test } from "node:test";
import assert from "node:assert/strict";
import type { GbmModel } from "../lib/engine/model";
import { GBM, THRESHOLDS, calibrate, gbmRaw, saabas, saabasBias, sigmoid, gbmScorer } from "../lib/engine/model";
import { analyze } from "../lib/engine/analyze";
import type { ParseReport, Tx } from "../lib/engine/types";

// 작은 트리: 뿌리에서 특징 0을 0.1(float64)과 비교 — float32로 바꾼 0.1은 0.1보다 크다
const T = 0.1;
const small: GbmModel = {
  version: "test", feature_names: ["a", "b"], learning_rate: 0.5, init_raw: -1,
  trees: [
    { f: [0, -2, 1, -2, -2], t: [T, -2, 0.5, -2, -2], l: [1, -1, 3, -1, -1], r: [2, -1, 4, -1, -1], v: [0.2, -1, 0.6, 0.3, 0.9] },
    { f: [1, -2, -2], t: [0.25, -2, -2], l: [1, -1, -1], r: [2, -1, -1], v: [0, -0.4, 0.4] },
  ],
};

test("Math.fround 분기: float32(0.1) > 0.1 이므로 x = 0.1은 오른쪽", () => {
  assert.ok(Math.fround(0.1) > 0.1);
  // x0 = 0.1 → fround(0.1) > 0.1 → 오른쪽(노드 2) → x1 = 0.7 > 0.5 → 노드 4 (0.9); 둘째 트리 x1 > 0.25 → 0.4
  assert.equal(gbmRaw(small, [0.1, 0.7]), -1 + 0.5 * 0.9 + 0.5 * 0.4);
  // x0 = 0.09 → 왼쪽(노드 1, -1)
  assert.equal(gbmRaw(small, [0.09, 0.7]), -1 + 0.5 * -1 + 0.5 * 0.4);
  // float32로 정확히 0.1 이하가 되는 값: fround(0.1)보다 조금 작은 float32
  const below = Math.fround(0.1 - 1e-8);
  assert.ok(Math.fround(below) <= T);
  assert.equal(gbmRaw(small, [below, 0.1]), -1 + 0.5 * -1 + 0.5 * -0.4);
});

test("보정 보간: 선형, 범위 밖 clip", () => {
  const c = { x: [0.1, 0.5, 0.9], y: [0.0, 0.4, 1.0] };
  assert.equal(calibrate(c, 0.05), 0.0);
  assert.equal(calibrate(c, 0.95), 1.0);
  assert.equal(calibrate(c, 0.1), 0.0);
  assert.equal(calibrate(c, 0.9), 1.0);
  assert.ok(Math.abs(calibrate(c, 0.3) - 0.2) < 1e-12);
  assert.ok(Math.abs(calibrate(c, 0.7) - 0.7) < 1e-12);
});

test("Saabas: 기여도 합 + learning_rate × Σ v[root] + init_raw = raw (1e-9 안)", () => {
  for (const x of [[0.1, 0.7], [0.09, 0.2], [5, -1]]) {
    const s = saabas(small, x).reduce((a, b) => a + b, 0);
    assert.ok(Math.abs(s + saabasBias(small) - gbmRaw(small, x)) < 1e-9);
  }
  const x = new Array(22).fill(0).map((_, i) => (i % 3) * 0.7);
  const s = saabas(GBM, x).reduce((a, b) => a + b, 0);
  assert.ok(Math.abs(s + saabasBias(GBM) - gbmRaw(GBM, x)) < 1e-9);
});

test("내보낸 모델: 트리 150개, 특징 22개, 임계값 t1 ≤ t2", () => {
  assert.equal(GBM.trees.length, 150);
  assert.equal(GBM.feature_names.length, 22);
  assert.ok(THRESHOLDS.t1 <= THRESHOLDS.t2);
  const r = gbmScorer.score(new Array(22).fill(-1));
  assert.ok(r.prob >= 0 && r.prob <= 1);
  assert.equal(r.contributions!.length, 22);
  assert.ok(Math.abs(sigmoid(0) - 0.5) < 1e-15);
});

test("analyze 기본 = gbm-v1: 확률·단계·why 상위 3개", () => {
  const D0 = Date.UTC(2026, 3, 6) / 86400000;
  const txs: Tx[] = [];
  let i = 0;
  const add = (day: number, amount: number, category: Tx["category"], cp: string | null, cpType: Tx["cpType"]) =>
    txs.push({ id: "r" + ++i, day: D0 + day, minute: 600, amount, balance: 1_000_000, memo: "", branch: null, category, cpKey: cp, cpLabel: cp, cpType });
  for (let w = 0; w < 8; w++) {
    add(w * 7 + 1, -5000, "card_daily", "m", "merchant");
    add(w * 7 + 2, -6000, "card_daily", "m", "merchant");
  }
  for (let k = 0; k < 4; k++) add(56 + k, -300000, "transfer_out", "cp_new", "person");
  const rep: ParseReport = { encoding: "utf-8", headerRow: 0, columns: [], rowsRead: 0, rowsSkipped: 0, missingRequired: [], unknownCategoryShare: 0, firstDay: null, lastDay: null };
  const res = analyze(txs, rep);
  assert.equal(res.modelVersion, "gbm-v1");
  const w9 = res.weeks[8];
  assert.ok(w9.prob !== null && w9.prob >= 0 && w9.prob <= 1);
  assert.ok(w9.why.length <= 3);
  for (let k = 1; k < w9.why.length; k++) assert.ok(w9.why[k - 1].contribution >= w9.why[k].contribution);
  assert.ok(["normal", "watch", "high"].includes(w9.level));
  assert.equal(res.weeks[0].prob, null);
  assert.equal(analyze(txs, rep, { model: "none" }).modelVersion, "none");
  assert.equal(analyze(txs, rep, { model: "lr" }).modelVersion, "lr-v1");
});
