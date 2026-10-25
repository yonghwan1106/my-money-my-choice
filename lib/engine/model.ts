// L2 모델 평가기 (구현명세 §5-3): 부스팅 트리(sklearn GradientBoostingClassifier 내보내기) + 등위 보정 + Saabas 기여도.
// 분기는 sklearn과 같게 float32로 비교: Math.fround(x[f]) <= t 이면 왼쪽. 브라우저·Node 공용.
import gbmJson from "../../data/model/gbm_v1.json";
import calibJson from "../../data/model/calib_v1.json";
import thresholdsJson from "../../data/model/thresholds.json";
import lrJson from "../../data/model/lr_v1.json";

export interface Tree { f: number[]; t: number[]; l: number[]; r: number[]; v: number[] }
export interface GbmModel { version: string; feature_names: string[]; learning_rate: number; init_raw: number; trees: Tree[] }
export interface Calib { x: number[]; y: number[] }
export interface LrModel {
  version: string; mean: number[]; scale: number[]; coef: number[]; intercept: number; calib: Calib; t1: number; t2: number;
}

/** 모델 평가기: 특징 → 보정 확률 + 특징별 기여도 + 임계값 */
export interface Scorer {
  version: "gbm-v1" | "lr-v1";
  t1: number;
  t2: number;
  score: (features: number[]) => { prob: number; contributions: number[] | null };
}

const LEAF = -2;

function leafOf(tree: Tree, x: number[]): number {
  let n = 0;
  while (tree.f[n] !== LEAF && tree.l[n] !== -1) {
    n = Math.fround(x[tree.f[n]]) <= tree.t[n] ? tree.l[n] : tree.r[n];
  }
  return n;
}

/** 원점수(log-odds) = init_raw + Σ learning_rate × v[잎] (sklearn과 같은 순서로 더함) */
export function gbmRaw(m: GbmModel, x: number[]): number {
  let raw = m.init_raw;
  for (const tree of m.trees) raw += m.learning_rate * tree.v[leafOf(tree, x)];
  return raw;
}

export function sigmoid(z: number): number {
  return 1 / (1 + Math.exp(-z));
}

/** 등위 보정: 선형 보간, 범위 밖은 끝값(clip) */
export function calibrate(c: Calib, p: number): number {
  const xs = c.x;
  const ys = c.y;
  const n = xs.length;
  if (n === 0) return p;
  if (p <= xs[0]) return ys[0];
  if (p >= xs[n - 1]) return ys[n - 1];
  let lo = 0;
  let hi = n - 1;
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1;
    if (xs[mid] <= p) lo = mid;
    else hi = mid;
  }
  const slope = (ys[hi] - ys[lo]) / (xs[hi] - xs[lo]);
  return slope * (p - xs[lo]) + ys[lo];
}

/** Saabas 기여도: 경로의 노드 n → 자식 c마다 learning_rate × (v[c] − v[n])를 f[n]에 더함 */
export function saabas(m: GbmModel, x: number[]): number[] {
  const contrib = new Array<number>(m.feature_names.length).fill(0);
  for (const tree of m.trees) {
    let n = 0;
    while (tree.f[n] !== LEAF && tree.l[n] !== -1) {
      const c = Math.fround(x[tree.f[n]]) <= tree.t[n] ? tree.l[n] : tree.r[n];
      contrib[tree.f[n]] += m.learning_rate * (tree.v[c] - tree.v[n]);
      n = c;
    }
  }
  return contrib;
}

/** 기여도 합 검산용: init_raw + learning_rate × Σ v[root] */
export function saabasBias(m: GbmModel): number {
  let b = m.init_raw;
  for (const tree of m.trees) b += m.learning_rate * tree.v[0];
  return b;
}

export function lrRaw(m: LrModel, x: number[]): number {
  let z = m.intercept;
  for (let i = 0; i < m.coef.length; i++) z += m.coef[i] * ((x[i] - m.mean[i]) / m.scale[i]);
  return z;
}

export const GBM: GbmModel = gbmJson as GbmModel;
export const CALIB: Calib = calibJson as Calib;
export const THRESHOLDS = thresholdsJson as { t1: number; t2: number; t2_rule: string };
export const LR: LrModel = lrJson as LrModel;

export const gbmScorer: Scorer = {
  version: "gbm-v1",
  t1: THRESHOLDS.t1,
  t2: THRESHOLDS.t2,
  score: (x) => ({ prob: calibrate(CALIB, sigmoid(gbmRaw(GBM, x))), contributions: saabas(GBM, x) }),
};

/** 대체(lr-v1): 로지스틱 회귀 — 기여도는 계수 × 표준화 값 */
export const lrScorer: Scorer = {
  version: "lr-v1",
  t1: LR.t1,
  t2: LR.t2,
  score: (x) => ({
    prob: calibrate(LR.calib, sigmoid(lrRaw(LR, x))),
    contributions: LR.coef.map((c, i) => c * ((x[i] - LR.mean[i]) / LR.scale[i])),
  }),
};
