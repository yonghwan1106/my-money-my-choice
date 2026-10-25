// 언어모델 출력 검증기 (구현명세 §6-7). 브라우저·서버 공용(외부 의존 없음).
import type { HelperNoteFacts, UnderstandLabel } from "../engine/types";
import { findAdvice, findBanned, findIntent, findNames, findStyleBreaks } from "./banned";

export const UNDERSTAND_LABELS: UnderstandLabel[] = ["my_choice", "asked_by_someone", "threatened", "not_sure", "unclear"];

export interface Checked<T> { passed: boolean; checks: Record<string, boolean>; value: T | null }

/** 응답 텍스트 → JSON. 울타리(```json … ```)를 벗긴다. 실패하면 null. */
export function parseJsonText(raw: string): unknown {
  let t = (raw ?? "").trim();
  const m = t.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/);
  if (m) t = m[1].trim();
  try { return JSON.parse(t); } catch { return null; }
}

export function validateUnderstand(obj: unknown, inputText: string): Checked<{ label: UnderstandLabel; evidence: string }> {
  const o = obj && typeof obj === "object" && !Array.isArray(obj) ? (obj as Record<string, unknown>) : null;
  const json = o !== null && typeof o.label === "string" && typeof (o.evidence ?? "") === "string";
  const label = json ? (o!.label as UnderstandLabel) : null;
  const evidence = json ? String(o!.evidence ?? "") : "";
  const label_enum = label !== null && UNDERSTAND_LABELS.includes(label);
  const evidence_substring = label === "unclear" ? evidence === "" : evidence.length > 0 && inputText.includes(evidence);
  const evidence_len = evidence.length <= 40;
  const checks = { json, label_enum, evidence_substring, evidence_len };
  const passed = json && label_enum && evidence_substring && evidence_len;
  return { passed, checks, value: passed ? { label: label!, evidence } : null };
}

/** 숫자 토큰(쉼표는 붙여 읽음). 「147만」→「147」, 「1,070만」→「1070」. */
export function numberTokens(s: string): string[] {
  return (s.replace(/(\d),(?=\d{3})/g, "$1").match(/\d+/g) ?? []);
}

/** 숫자 옆 단위 정규화: 공백 지움, 「만」「천」「천만」만 있으면 「원」을 붙여 같은 돈 단위로 본다, 「차례」=「번」. */
function normUnit(u: string): string {
  const t = u.replace(/\s+/g, "");
  if (t === "만" || t === "천" || t === "천만") return t + "원";
  if (t === "차례") return "번";
  return t;
}

const UNIT_RE = /(\d+)\s*(천만\s*원|만\s*원|천\s*원|천만|만|천|억|원|개월|시간|번|차례|주|일|달|분|개|건|명|곳|회|배|%|살|년|월|시|초)?/gu;
const NATIVE: Record<string, number> = { "두": 2, "세": 3, "네": 4, "다섯": 5, "여섯": 6, "일곱": 7, "여덟": 8, "아홉": 9, "열": 10 };
const NATIVE_RE = /(?<![가-힣])(두|세|네|다섯|여섯|일곱|여덟|아홉|열)\s*(번|차례|주|달|개월|곳|명|개|건|회)/gu;

/**
 * 숫자와 바로 뒤 단위의 짝(「147|만원」「5|주」「4|번」). 쉼표는 붙여 읽는다.
 * 고유어 수(「두 번」「세 주」)도 숫자로 바꿔 짝을 만든다 — 「5주」를 「5일」로, 「4번」을 「다섯 번」으로 바꾸면 잡기 위해.
 */
export function numberUnitPairs(s: string): string[] {
  const t = (s ?? "").replace(/(\d),(?=\d{3})/g, "$1");
  const out: string[] = [];
  for (const m of t.matchAll(UNIT_RE)) out.push(`${Number(m[1])}|${normUnit(m[2] ?? "")}`);
  for (const m of t.matchAll(NATIVE_RE)) out.push(`${NATIVE[m[1]]}|${normUnit(m[2])}`);
  return out;
}

const MORE_RE = /(\d[\d,]*\s*(?:천만\s*원|만\s*원|천\s*원|억|원|개월|시간|번|차례|주|일|달|개|건|명|곳|회)?)\s*(?:이|가|을|를|은|는)?\s+더(?=[\s.,]|$)/gu;

/**
 * 「N … 더」(「590만 원 더 나갔어요」「1개 더」)로 쓴 숫자는 키에 「더」가 든 값(「…평소보다 더 나간 돈」)이어야 한다.
 * 「금액 1만 원」을 「1만 원이 더 나갔어요」처럼 차이로 바꿔 쓰면 키의 뜻이 바뀐 것으로 본다.
 */
export function moreWordsOk(summary: string, facts: HelperNoteFacts): boolean {
  const moreAllowed = new Set(numberUnitPairs(Object.entries(facts.items ?? {}).filter(([k]) => k.includes("더")).map(([, v]) => v).join(" ")));
  for (const m of summary.matchAll(MORE_RE)) {
    const pairs = numberUnitPairs(m[1]);
    if (pairs.length && !moreAllowed.has(pairs[pairs.length - 1])) return false;
  }
  return true;
}

export function validateHelperNote(obj: unknown, facts: HelperNoteFacts): Checked<{ summary: string }> {
  const o = obj && typeof obj === "object" && !Array.isArray(obj) ? (obj as Record<string, unknown>) : null;
  const json = o !== null && typeof o.summary === "string" && (o.summary as string).trim().length > 0;
  const summary = json ? (o!.summary as string).trim() : "";
  return checkSummary(summary, facts, json);
}

/** 요약 문장 검사(고정 문안 시험에도 씀). */
export function checkSummary(summary: string, facts: HelperNoteFacts, json = true): Checked<{ summary: string }> {
  const allowed = new Set(numberTokens([facts.period, ...Object.values(facts.items ?? {})].join(" ")));
  const length = summary.length > 0 && summary.length <= 90;
  const no_question = !/[?？]/u.test(summary);
  const numbers_match = numberTokens(summary).every((n) => allowed.has(n));
  const banned = findBanned(summary).length === 0;
  const intent = findIntent(summary).length === 0;
  const no_name = findNames(summary).length === 0;
  // helpernote-v2: 숫자 옆 단위가 facts(period·items 값)에 있는 짝과 같아야 한다(「5주」→「5일」이면 실패).
  const allowedPairs = new Set(numberUnitPairs([facts.period, ...Object.values(facts.items ?? {})].join(" ")));
  const units_match = numberUnitPairs(summary).every((p) => allowedPairs.has(p)) && moreWordsOk(summary, facts);
  const style = findStyleBreaks(summary).length === 0; // 모든 문장 「~요」, 「~니다」 없음
  const no_advice = findAdvice(summary).length === 0; // 조언·권유·약속 없음(사실 요약만)
  const checks = { json, length, no_question, numbers_match, units_match, style, no_advice, banned, intent, no_name };
  const passed = Object.values(checks).every(Boolean);
  return { passed, checks, value: passed ? { summary } : null };
}
