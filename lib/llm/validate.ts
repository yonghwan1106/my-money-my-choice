// 언어모델 출력 검증기 (구현명세 §6-7). 브라우저·서버 공용(외부 의존 없음).
import type { HelperNoteFacts, UnderstandLabel } from "../engine/types";
import { findBanned, findIntent, findNames } from "./banned";

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
  const checks = { json, length, no_question, numbers_match, banned, intent, no_name };
  const passed = Object.values(checks).every(Boolean);
  return { passed, checks, value: passed ? { summary } : null };
}
