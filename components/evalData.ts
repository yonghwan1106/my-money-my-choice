// 평가 산출 JSON (구현명세 §12) — 화면 숫자는 여기서만 읽는다.
// 임시: data/eval/eval_v1.json(A5)이 아직 없어 null. 파일이 생기면 아래 주석을 풀고 null 줄을 지운다(B6).
// import evalV1 from "@/data/eval/eval_v1.json";

export interface Narration {
  S: number;
  s: number;
  D: number;
  F: number;
  F_text: string;
}
export interface EvalV1Lite {
  narration: Narration;
}

export const EVAL_V1: EvalV1Lite | null = null;
