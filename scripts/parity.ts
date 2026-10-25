// P7 일치 시험 (구현명세 §5-3): pipeline/work/parity_cases.json 500행에서 TS 평가기와 sklearn 값 비교.
// 원확률·보정확률 둘 다 |TS − sklearn| < 1e-6 이어야 한다(실패하면 배포 금지). lr-v1(대체)도 같이 확인.
// 사용: npx --prefix <repo> tsx <repo>\scripts\parity.ts
import fs from "node:fs";
import path from "node:path";
import { CALIB, GBM, LR, calibrate, gbmRaw, lrRaw, saabas, saabasBias, sigmoid } from "../lib/engine/model";

interface Case { features: number[]; proba_raw_sklearn: number; proba_calibrated: number; lr_raw: number; lr_calibrated: number }

const file = path.resolve(__dirname, "..", "pipeline", "work", "parity_cases.json");
const cases: Case[] = JSON.parse(fs.readFileSync(file, "utf-8"));
let maxRaw = 0;
let maxCal = 0;
let maxLr = 0;
let maxSaabas = 0;
const bias = saabasBias(GBM);
for (const c of cases) {
  const raw = gbmRaw(GBM, c.features);
  const p = sigmoid(raw);
  const q = calibrate(CALIB, p);
  maxRaw = Math.max(maxRaw, Math.abs(p - c.proba_raw_sklearn));
  maxCal = Math.max(maxCal, Math.abs(q - c.proba_calibrated));
  const lp = sigmoid(lrRaw(LR, c.features));
  maxLr = Math.max(maxLr, Math.abs(lp - c.lr_raw), Math.abs(calibrate(LR.calib, lp) - c.lr_calibrated));
  const s = saabas(GBM, c.features).reduce((a, b) => a + b, 0) + bias;
  maxSaabas = Math.max(maxSaabas, Math.abs(s - raw));
}
const max = Math.max(maxRaw, maxCal);
console.log(`cases=${cases.length} max_abs_diff=${max.toExponential(3)} raw=${maxRaw.toExponential(3)} calibrated=${maxCal.toExponential(3)} lr=${maxLr.toExponential(3)} saabas_sum=${maxSaabas.toExponential(3)}`);
const ok = max < 1e-6 && maxLr < 1e-6 && maxSaabas < 1e-9;
console.log(ok ? "PARITY OK" : "PARITY FAIL");
process.exit(ok ? 0 : 1);
