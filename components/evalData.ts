// 평가 산출 JSON (구현명세 §12) — 화면 숫자는 여기서만 읽는다(손으로 적은 숫자 없음).
import evalV1 from "@/data/eval/eval_v1.json";
import understandV1 from "@/data/eval/understand_eval_v1.json";
import helpernoteV1 from "@/data/eval/helpernote_eval_v1.json";
import provenanceJ from "@/data/eval/provenance.json";
import blindV1 from "@/data/eval/eval_blind_v1.json";
import b2V1 from "@/data/eval/eval_b2_v1.json";
import policyV1 from "@/data/eval/policy_tests_v1.json";

export type Ci = [number, number] | null;
export interface EvalRow {
  id: string;
  name: string;
  pr_auc: number | null;
  pr_auc_ci: Ci;
  recall_at_rule: number | null;
  recall_ci: Ci;
  cards_per_month_none: number | null;
  high_precision: number | null;
  median_days_first: number | null;
  missed_rate: { all: number | null; new: number | null; ongoing: number | null };
}
export interface Narration {
  S: number;
  s: number;
  D: number;
  F: number;
  F_text: string;
}
export interface EvalV1 {
  version: string;
  generated_at: string;
  split: { train: number; val: number; test: number; test_windows: number; test_pos_windows: number; pos_rate: number };
  thresholds: { t1: number; t2: number; t2_rule: string };
  rows: EvalRow[];
  paired_diff: Record<"GBM_minus_B3" | "GBM_minus_B4", { pr_auc: [number, number, number]; recall_at_rule: [number, number, number] }>;
  by_pattern: { pattern: string; label: string; recall: number; n_windows: number }[];
  lopo: { held_out: string; recall: number; n_windows: number }[];
  cohorts: Record<"new" | "ongoing", { recall: number; missed_rate: number; n_persons: number }>;
  family_perp: { recall: number; n_windows: number; missed_rate?: number };
  pr_curve: Record<"GBM" | "B4" | "B3", [number, number][]>;
  interpretations: { diff: string; lopo: string; hard_cases: string };
  narration: Narration;
}
export interface UnderstandEval {
  prompt_version: string;
  model: string;
  test_n: number;
  final: boolean;
  llm: { accuracy: number; macro_f1: number; dangerous_misclass: number };
  k0: { accuracy: number; macro_f1: number; dangerous_misclass: number };
  confusion: { labels: string[]; llm: number[][]; k0: number[][] };
}
export interface HelpernoteEval {
  n: number;
  pass_first: number;
  pass_after_retry: number;
  numbers_match_rate: number;
  banned_hits: number;
  intent_hits: number;
  template_fallbacks: number;
  prompt_version?: string;
  raw?: { attempts: number; attempts_json: number; units?: number; style?: number; advice?: number };
}
export interface Provenance {
  gen_commit: string;
  signals_frozen: string;
  model_frozen: string;
  blind_commit: string;
  truth_sha256: string;
  seed: number;
}
export interface BlindEval {
  n: { Q1: number; Q2: number; none: number };
  recall: { Q1: { persons: number; windows: number }; Q2: { persons: number; windows: number } };
  cards_per_month_none: number;
  spec_summary: string;
}
export interface B2Eval {
  subset_n: number;
  subset_pos: number;
  rows: { model: string; pr_auc: number | null; recall_at_rule: number | null; calls?: number; failures?: number }[];
  note: string;
  rule?: { llm: string; gbm: string; t1: number };
}
export interface PolicyTests {
  passed: number;
  total: number;
}

export const EVAL_V1: EvalV1 | null = evalV1 as unknown as EvalV1;
export const UNDERSTAND_V1: UnderstandEval | null = understandV1 as unknown as UnderstandEval;
export const HELPERNOTE_V1: HelpernoteEval | null = helpernoteV1 as unknown as HelpernoteEval;
export const PROVENANCE: Provenance | null = provenanceJ as unknown as Provenance;
export const BLIND_V1: BlindEval | null = blindV1 as unknown as BlindEval;
export const B2_V1: B2Eval | null = b2V1 as unknown as B2Eval;
export const POLICY_V1: PolicyTests | null = policyV1 as unknown as PolicyTests;
