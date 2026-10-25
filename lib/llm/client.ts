// server-only — 언어모델 호출 공통 (구현명세 §6-5·§6-9). 라우트·사전계산·평가 스크립트가 같은 함수를 쓴다.
// 절대 throw하지 않는다. 요청·응답 본문을 console에 찍지 않는다(오류 이름·모델·지연 시간만).
import Anthropic from "@anthropic-ai/sdk";
import type {
  HelperNoteFacts, HelperNoteRequest, HelperNoteResponse, PatternId, UnderstandRequest, UnderstandResponse,
} from "../engine/types";
import { helperNoteTemplateFromFacts, SAFE_SUMMARY, ALL_PATTERNS } from "../engine/templates";
import { HELPERNOTE_SYSTEM, HELPERNOTE_VERSION, UNDERSTAND_SYSTEM, UNDERSTAND_VERSION, helperNoteUser, understandUser } from "./prompts";
import { checkSummary, parseJsonText, validateHelperNote, validateUnderstand, type Checked } from "./validate";
import { k0 } from "./k0";
import { requestKey } from "./hash";
import { cacheGet, cacheSet } from "./cache";
import { take } from "./limit";
import { redactNumbers } from "../privacy/redact";

export const PRIMARY_MODEL = () => process.env.ANTHROPIC_MODEL || "claude-haiku-5-5";
export const FALLBACK_MODEL = "claude-haiku-4-5";
export const MAX_BODY_BYTES = 2000;

type Block = { type: string; text?: string };
export type CreateFn = (body: Record<string, unknown>) => Promise<{ content: Block[]; usage?: { input_tokens?: number; output_tokens?: number } }>;

export interface Deps {
  /** 키(없으면 process.env.ANTHROPIC_API_KEY). 값은 메모리에만. */
  apiKey?: string | null;
  /** 시험용 대역 클라이언트. */
  create?: CreateFn;
  /** 캐시·상한을 건너뜀(오프라인 평가·사전계산). */
  offline?: boolean;
  ip?: string;
  /** 호출 기록(평가 스크립트의 비용 계산용). 본문은 담지 않는다. */
  onCall?: (info: { model: string; ok: boolean; ms: number; input_tokens: number; output_tokens: number; error?: string }) => void;
  /** 시도마다 검사 결과(평가 스크립트용). 텍스트 블록이 없으면 null. */
  onCheck?: (info: { model: string; attempt: number; checks: Record<string, boolean> | null; passed: boolean; raw?: string }) => void;
}

function createFor(apiKey: string): CreateFn {
  const client = new Anthropic({ apiKey, maxRetries: 0, timeout: 10_000 });
  return (body) => client.messages.create(body as unknown as Anthropic.MessageCreateParamsNonStreaming) as unknown as ReturnType<CreateFn>;
}

export function buildBody(model: string, system: string, user: string, maxTokens: number, primary: boolean): Record<string, unknown> {
  const body: Record<string, unknown> = { model, max_tokens: maxTokens, system, messages: [{ role: "user", content: user }] };
  if (primary) body.thinking = { type: "disabled" }; // haiku-5-5: thinking 끔. temperature는 넣지 않는다(R3 실측 400).
  return body;
}

export function textOf(msg: { content?: Block[] } | null | undefined): string | null {
  const blocks = (msg?.content ?? []).filter((b) => b.type === "text" && typeof b.text === "string");
  if (blocks.length === 0) return null;
  return blocks.map((b) => b.text).join("").trim();
}

type Attempt<T> = { ok: true; value: T; checks: Record<string, boolean>; model: string; attempts: number }
  | { ok: false; reason: string; checks: Record<string, boolean> | null; attempts: number };

/** 1차 → (API 오류면 haiku-4-5 / 검증 실패면 같은 모델) 2차 1번. */
export async function generate<T>(
  system: string, user: string, maxTokens: number, check: (obj: unknown) => Checked<T>, create: CreateFn, onCall?: Deps["onCall"],
  onCheck?: Deps["onCheck"],
): Promise<Attempt<T>> {
  const primary = PRIMARY_MODEL();
  let attempt = 0;
  const once = async (model: string, isPrimary: boolean): Promise<{ kind: "api_error" } | { kind: "invalid"; checks: Record<string, boolean> | null } | { kind: "ok"; value: T; checks: Record<string, boolean> }> => {
    const t0 = Date.now();
    attempt++;
    try {
      const msg = await create(buildBody(model, system, user, maxTokens, isPrimary));
      const ms = Date.now() - t0;
      onCall?.({ model, ok: true, ms, input_tokens: msg.usage?.input_tokens ?? 0, output_tokens: msg.usage?.output_tokens ?? 0 });
      const text = textOf(msg);
      if (text === null) { onCheck?.({ model, attempt, checks: null, passed: false }); return { kind: "invalid", checks: null }; }
      const c = check(parseJsonText(text));
      onCheck?.({ model, attempt, checks: c.checks, passed: c.passed, raw: text });
      return c.passed && c.value !== null ? { kind: "ok", value: c.value, checks: c.checks } : { kind: "invalid", checks: c.checks };
    } catch (e) {
      const ms = Date.now() - t0;
      const name = e instanceof Error ? e.name : "Error";
      console.warn(`[llm] error=${name} model=${model} ms=${ms}`);
      onCall?.({ model, ok: false, ms, input_tokens: 0, output_tokens: 0, error: name });
      return { kind: "api_error" };
    }
  };
  const r1 = await once(primary, true);
  if (r1.kind === "ok") return { ok: true, value: r1.value, checks: r1.checks, model: primary, attempts: 1 };
  const second = r1.kind === "api_error" ? FALLBACK_MODEL : primary;
  const r2 = await once(second, second === primary);
  if (r2.kind === "ok") return { ok: true, value: r2.value, checks: r2.checks, model: second, attempts: 2 };
  return { ok: false, reason: r1.kind === "api_error" && r2.kind === "api_error" ? "api_error" : "invalid", checks: r2.kind === "invalid" ? r2.checks : null, attempts: 2 };
}

// ---------- 요청 검사 ----------
const LEVELS = ["watch", "high"] as const;
const isPattern = (p: unknown): p is PatternId => typeof p === "string" && (ALL_PATTERNS as string[]).includes(p);
const isLevel = (l: unknown): l is "watch" | "high" => typeof l === "string" && (LEVELS as readonly string[]).includes(l);

export function parseUnderstandRequest(raw: unknown): UnderstandRequest | null {
  if (!raw || typeof raw !== "object") return null;
  const o = raw as Record<string, unknown>;
  if (o.prompt_version !== UNDERSTAND_VERSION) return null;
  if (typeof o.text !== "string") return null;
  const len = Array.from(o.text).length;
  if (len < 1 || len > 200 || o.text.trim().length === 0) return null;
  if (!isPattern(o.pattern) || !isLevel(o.level)) return null;
  return { prompt_version: UNDERSTAND_VERSION, text: o.text, pattern: o.pattern, level: o.level };
}

export function parseHelperNoteRequest(raw: unknown): HelperNoteRequest | null {
  if (!raw || typeof raw !== "object") return null;
  const o = raw as Record<string, unknown>;
  if (o.prompt_version !== HELPERNOTE_VERSION || !isPattern(o.pattern) || !isLevel(o.level)) return null;
  const f = o.facts as Record<string, unknown> | undefined;
  if (!f || typeof f !== "object") return null;
  const str30 = (v: unknown) => typeof v === "string" && Array.from(v).length <= 30;
  if (!str30(f.pattern_label) || !str30(f.level_label) || !str30(f.period)) return null;
  const items = f.items as Record<string, unknown> | undefined;
  if (!items || typeof items !== "object" || Array.isArray(items)) return null;
  const entries = Object.entries(items);
  if (entries.length > 8) return null;
  if (!entries.every(([k, v]) => str30(k) && str30(v))) return null;
  const facts: HelperNoteFacts = {
    pattern_label: f.pattern_label as string, level_label: f.level_label as string, period: f.period as string,
    items: Object.fromEntries(entries) as Record<string, string>,
  };
  return { prompt_version: HELPERNOTE_VERSION, pattern: o.pattern, level: o.level, facts };
}

/** 본문 문자열 → JSON(2,000바이트 넘으면 null). */
export function parseBody(text: string): unknown {
  if (new TextEncoder().encode(text).length > MAX_BODY_BYTES) return null;
  try { return JSON.parse(text); } catch { return null; }
}

// ---------- ⓐ 알아듣기 ----------
function ruleResponse(text: string): UnderstandResponse {
  const r = k0(text);
  const c = validateUnderstand(r, text);
  return { mode: "rule", label: r.label, evidence: r.evidence, validator: { passed: c.passed, checks: c.checks } };
}

export async function understand(req: UnderstandRequest, deps: Deps = {}): Promise<UnderstandResponse> {
  try {
    const text = redactNumbers(req.text); // 서버도 숫자·전화 규칙을 한 번 더
    const clean: UnderstandRequest = { ...req, text };
    const key = await requestKey(clean);
    if (!deps.offline) {
      const hit = cacheGet<UnderstandResponse>(key);
      if (hit) return { ...hit, mode: "cache" };
    }
    const apiKey = deps.apiKey !== undefined ? deps.apiKey : process.env.ANTHROPIC_API_KEY;
    if (!apiKey && !deps.create) return ruleResponse(text);
    if (!deps.offline && !take(deps.ip ?? "local").ok) return ruleResponse(text);
    const create = deps.create ?? createFor(apiKey as string);
    const r = await generate(UNDERSTAND_SYSTEM, understandUser(text, req.pattern, req.level), 200,
      (obj) => validateUnderstand(obj, text), create, deps.onCall, deps.onCheck);
    if (!r.ok) return ruleResponse(text);
    const res: UnderstandResponse = { mode: "live", label: r.value.label, evidence: r.value.evidence, validator: { passed: true, checks: r.checks } };
    if (!deps.offline) cacheSet(key, res);
    return res;
  } catch {
    return ruleResponse(req.text);
  }
}

// ---------- ⓑ 알림 요약 ----------
function templateResponse(req: HelperNoteRequest): HelperNoteResponse {
  let summary = helperNoteTemplateFromFacts(req.pattern, req.facts);
  let c = checkSummary(summary, req.facts);
  if (!c.passed) { summary = SAFE_SUMMARY; c = checkSummary(summary, req.facts); }
  return { mode: "template", summary, validator: { passed: c.passed, checks: c.checks } };
}

export async function helperNote(req: HelperNoteRequest, deps: Deps = {}): Promise<HelperNoteResponse> {
  try {
    const key = await requestKey(req);
    if (!deps.offline) {
      const hit = cacheGet<HelperNoteResponse>(key);
      if (hit) return { ...hit, mode: "cache" };
    }
    const apiKey = deps.apiKey !== undefined ? deps.apiKey : process.env.ANTHROPIC_API_KEY;
    if (!apiKey && !deps.create) return templateResponse(req);
    if (!deps.offline && !take(deps.ip ?? "local").ok) return templateResponse(req);
    const create = deps.create ?? createFor(apiKey as string);
    const r = await generate(HELPERNOTE_SYSTEM, helperNoteUser(req.facts), 300,
      (obj) => validateHelperNote(obj, req.facts), create, deps.onCall, deps.onCheck);
    if (!r.ok) return templateResponse(req);
    const res: HelperNoteResponse = { mode: "live", summary: r.value.summary, validator: { passed: true, checks: r.checks } };
    if (!deps.offline) cacheSet(key, res);
    return res;
  } catch {
    return templateResponse(req);
  }
}

// ---------- 라우트 공용 ----------
export const NO_STORE = { "Cache-Control": "no-store" } as const;
export function badRequest(): Response {
  return Response.json({ error: "bad_request" }, { status: 400, headers: NO_STORE });
}
export function ok(body: unknown): Response {
  return Response.json(body, { status: 200, headers: NO_STORE });
}
