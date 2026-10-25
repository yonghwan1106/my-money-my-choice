// 언어모델 두 곳(/api/understand·/api/helper-note) 시험 — 가짜 클라이언트로(실제 호출 없음).
import { test, beforeEach } from "node:test";
import assert from "node:assert/strict";
import type { HelperNoteRequest, UnderstandRequest } from "../lib/engine/types";
import { buildBody, helperNote, understand, type CreateFn } from "../lib/llm/client";
import { cacheClear } from "../lib/llm/cache";
import { resetLimits } from "../lib/llm/limit";
import { k0 } from "../lib/llm/k0";
import { requestKey } from "../lib/llm/hash";
import { checkSummary, numberTokens, parseJsonText, validateUnderstand } from "../lib/llm/validate";
import { findNames } from "../lib/llm/banned";
import { ALL_PATTERNS, helperNoteFacts, helperNoteTemplate, helperNoteTemplateFromFacts } from "../lib/engine/templates";
import { POST as understandPOST } from "../app/api/understand/route";
import { POST as helperPOST } from "../app/api/helper-note/route";
import { GET as healthGET } from "../app/api/health/route";
import { FACTS_A20, FACTS_B16, FACTS_C16, FACTS_C18, FACTS_D21, FACTS_EXTREME, mkWeek } from "./_fixtures";

const UREQ: UnderstandRequest = { prompt_version: "understand-v1", text: "[상대1] 형이 급하다고 빌려 달래서 보냈어요", pattern: "same_person", level: "high" };
const HREQ: HelperNoteRequest = {
  prompt_version: "helpernote-v1", pattern: "same_person", level: "high",
  facts: { pattern_label: "같은 사람에게 여러 번", level_label: "위험이 높아요", period: "3주", items: { "횟수": "5번", "합계": "147만 원" } },
};

/** 가짜 클라이언트: 차례로 답을 돌려주고 받은 본문을 모은다. Error를 넣으면 던진다. */
function fake(replies: (string | Error | { blocks: { type: string; text?: string }[] })[]) {
  const bodies: Record<string, unknown>[] = [];
  let i = 0;
  const create: CreateFn = async (body) => {
    bodies.push(body);
    const r = replies[Math.min(i++, replies.length - 1)];
    if (r instanceof Error) throw r;
    if (typeof r === "string") return { content: [{ type: "text", text: r }], usage: { input_tokens: 500, output_tokens: 30 } };
    return { content: r.blocks };
  };
  return { create, bodies };
}

const post = (body: unknown, raw?: string) => new Request("http://localhost/api", {
  method: "POST", headers: { "content-type": "application/json", "x-forwarded-for": "10.0.0.1, 10.0.0.2" },
  body: raw ?? JSON.stringify(body),
});

beforeEach(() => {
  delete process.env.ANTHROPIC_API_KEY;
  delete process.env.ANTHROPIC_MODEL;
  delete process.env.AI_RPM_PER_IP;
  delete process.env.AI_DAILY_CAP;
  cacheClear();
  resetLimits();
});

test("키 없음 → /api/understand 200 rule, /api/helper-note 200 template, /api/health demo", async () => {
  const r1 = await understandPOST(post(UREQ));
  assert.equal(r1.status, 200);
  assert.equal(r1.headers.get("cache-control"), "no-store");
  const b1 = await r1.json();
  assert.equal(b1.mode, "rule");
  assert.equal(b1.label, "asked_by_someone");
  assert.equal(b1.evidence, "빌려 달");
  assert.equal(b1.validator.passed, true);
  const r2 = await helperPOST(post(HREQ));
  assert.equal(r2.status, 200);
  const b2 = await r2.json();
  assert.equal(b2.mode, "template");
  assert.equal(b2.summary, "같은 사람에게 여러 번: 3주 동안 5번, 모두 147만 원이 나갔어요.");
  assert.equal(b2.validator.passed, true);
  const h = await (await healthGET()).json();
  assert.equal(h.ok, true);
  assert.equal(h.llm, "demo");
  assert.equal(h.model, "claude-haiku-5-5");
  assert.match(h.version, /^1\.0\.0\+/);
  assert.deepEqual(h.limits, { rpm_per_ip: 6, daily_per_instance: 300 });
  process.env.ANTHROPIC_API_KEY = "test-not-a-key";
  const h2 = await (await healthGET()).json();
  assert.equal(h2.llm, "live");
  assert.ok(!JSON.stringify(h2).includes("test-not-a-key"));
});

test("잘못된 요청 → 400 bad_request", async () => {
  const bad = [
    { ...UREQ, prompt_version: "understand-v0" },
    { ...UREQ, text: "" },
    { ...UREQ, text: "가".repeat(201) },
    { ...UREQ, pattern: "phishing" },
    { ...UREQ, level: "normal" },
  ];
  for (const b of bad) {
    const r = await understandPOST(post(b));
    assert.equal(r.status, 400);
    assert.deepEqual(await r.json(), { error: "bad_request" });
  }
  assert.equal((await understandPOST(post(null, "{not json"))).status, 400);
  assert.equal((await understandPOST(post(null, JSON.stringify({ ...UREQ, pad: "x".repeat(2100) })))).status, 400);
  const hb = [
    { ...HREQ, prompt_version: "x" },
    { ...HREQ, facts: { ...HREQ.facts, items: Object.fromEntries(Array.from({ length: 9 }, (_, i) => [`k${i}`, "1번"])) } },
    { ...HREQ, facts: { ...HREQ.facts, items: { "합계": "가".repeat(31) } } },
    { ...HREQ, facts: null },
  ];
  for (const b of hb) assert.equal((await helperPOST(post(b))).status, 400);
});

test("요청 본문: thinking disabled 있음·temperature 없음·max_tokens 200/300·모델 haiku-5-5", async () => {
  const f = fake(['{"label":"asked_by_someone","evidence":"빌려 달래서"}']);
  const r = await understand(UREQ, { create: f.create });
  assert.equal(r.mode, "live");
  assert.equal(r.label, "asked_by_someone");
  const b = f.bodies[0];
  assert.deepEqual(b.thinking, { type: "disabled" });
  assert.ok(!("temperature" in b));
  assert.equal(b.model, "claude-haiku-5-5");
  assert.equal(b.max_tokens, 200);
  assert.equal(typeof b.system, "string");
  const msgs = b.messages as { role: string; content: string }[];
  assert.equal(msgs[0].role, "user");
  assert.deepEqual(JSON.parse(msgs[0].content), { text: UREQ.text, pattern: "같은 사람에게 여러 번", level: "위험이 높아요" });
  const g = fake(['{"summary":"3주 동안 같은 계좌로 5번, 모두 147만 원이 나갔어요."}']);
  const h = await helperNote(HREQ, { create: g.create });
  assert.equal(h.mode, "live");
  assert.equal(g.bodies[0].max_tokens, 300);
  assert.deepEqual(g.bodies[0].thinking, { type: "disabled" });
  assert.ok(!("temperature" in g.bodies[0]));
  assert.deepEqual(buildBody("claude-haiku-4-5", "s", "u", 100, false).thinking, undefined);
});

test("울타리(```json) 벗기기", async () => {
  const f = fake(['```json\n{"label":"my_choice","evidence":"주고 싶어서"}\n```']);
  const r = await understand({ ...UREQ, text: "내가 주고 싶어서 보냈어요" }, { create: f.create });
  assert.equal(r.mode, "live");
  assert.equal(r.label, "my_choice");
  assert.deepEqual(parseJsonText("```\n{\"a\":1}\n```"), { a: 1 });
  assert.equal(parseJsonText("not json"), null);
});

test("검증 실패 → 같은 모델로 1회 재생성 → 그래도 실패면 폴백(rule·template)", async () => {
  const f = fake(['{"label":"asked_by_someone","evidence":"입력에 없는 말"}', '{"label":"angry","evidence":""}']);
  const r = await understand(UREQ, { create: f.create });
  assert.equal(f.bodies.length, 2);
  assert.equal(f.bodies[0].model, "claude-haiku-5-5");
  assert.equal(f.bodies[1].model, "claude-haiku-5-5");
  assert.equal(r.mode, "rule");
  const ok2 = fake(["무슨 말", '{"label":"asked_by_someone","evidence":"빌려 달래서"}']);
  const r2 = await understand(UREQ, { create: ok2.create });
  assert.equal(r2.mode, "live");
  assert.equal(ok2.bodies.length, 2);
  // 요약: 숫자 불일치 → 재생성 → 이름 → 고정 문안
  const g = fake(['{"summary":"3주 동안 6번, 모두 150만 원이 나갔어요."}', '{"summary":"한지훈에게 5번 보냈어요."}']);
  const h = await helperNote(HREQ, { create: g.create });
  assert.equal(g.bodies.length, 2);
  assert.equal(h.mode, "template");
  // 텍스트 블록이 없으면 실패
  cacheClear();
  const nb = fake([{ blocks: [{ type: "thinking" }] }, { blocks: [] }]);
  assert.equal((await understand(UREQ, { create: nb.create })).mode, "rule");
});

test("API 오류 → claude-haiku-4-5(thinking 없음) 1회 → 그래도 오류면 폴백", async () => {
  const f = fake([new Error("overloaded"), '{"label":"asked_by_someone","evidence":"빌려 달래서"}']);
  const r = await understand(UREQ, { create: f.create });
  assert.equal(r.mode, "live");
  assert.equal(f.bodies[1].model, "claude-haiku-4-5");
  assert.ok(!("thinking" in f.bodies[1]));
  const e = fake([new Error("a"), new Error("b")]);
  const r2 = await helperNote(HREQ, { create: e.create });
  assert.equal(r2.mode, "template");
  assert.equal(e.bodies.length, 2);
});

test("상한 초과(IP 분당) → 200 폴백, 캐시 적중은 호출 없음", async () => {
  process.env.AI_RPM_PER_IP = "2";
  const f = fake(['{"label":"not_sure","evidence":"모르겠어요"}']);
  const texts = ["잘 모르겠어요 1", "잘 모르겠어요 2", "잘 모르겠어요 3"];
  const out = [];
  for (const t of texts) out.push(await understand({ ...UREQ, text: t }, { create: f.create, ip: "1.2.3.4" }));
  assert.deepEqual(out.map((o) => o.mode), ["live", "live", "rule"]);
  assert.equal(f.bodies.length, 2);
  const again = await understand({ ...UREQ, text: texts[0] }, { create: f.create, ip: "1.2.3.4" });
  assert.equal(again.mode, "cache");
  assert.equal(f.bodies.length, 2);
  process.env.AI_DAILY_CAP = "1";
  resetLimits();
  const g = fake(['{"summary":"3주 동안 5번, 모두 147만 원이 나갔어요."}']);
  assert.equal((await helperNote(HREQ, { create: g.create, ip: "9.9.9.9" })).mode, "live");
  assert.equal((await helperNote({ ...HREQ, level: "watch" }, { create: g.create, ip: "8.8.8.8" })).mode, "template");
});

test("서버도 숫자·전화를 한 번 더 지운다", async () => {
  const f = fake(['{"label":"unclear","evidence":""}']);
  await understand({ ...UREQ, text: "010-1234-5678로 1070000원 보냈어요" }, { create: f.create });
  const content = JSON.parse((f.bodies[0].messages as { content: string }[])[0].content);
  assert.equal(content.text, "[전화]로 [숫자]원 보냈어요");
});

test("K0 규칙 분류기", () => {
  assert.deepEqual(k0("형이 때리면 무서워요"), { label: "threatened", evidence: "때리" });
  assert.equal(k0("무서워요").label, "threatened");
  assert.equal(k0("형이 빌려 달래서").label, "asked_by_someone");
  assert.equal(k0("제가 주고 싶어서 했어요").label, "my_choice");
  assert.equal(k0("선물이에요").label, "my_choice");
  assert.equal(k0("기억이 안 나요").label, "not_sure");
  assert.deepEqual(k0("오늘 점심 맛있었어요"), { label: "unclear", evidence: "" });
});

test("검증기: evidence 부분 문자열·길이, 요약 숫자·금지어·의도·이름·물음표", () => {
  assert.equal(validateUnderstand({ label: "my_choice", evidence: "선물" }, "선물이에요").passed, true);
  assert.equal(validateUnderstand({ label: "my_choice", evidence: "선물로" }, "선물이에요").passed, false);
  assert.equal(validateUnderstand({ label: "unclear", evidence: "" }, "네").passed, true);
  assert.equal(validateUnderstand({ label: "unclear", evidence: "네" }, "네").passed, false);
  assert.equal(validateUnderstand({ label: "x", evidence: "" }, "네").checks.label_enum, false);
  const f = HREQ.facts;
  assert.equal(checkSummary("3주 동안 같은 계좌로 5번, 모두 147만 원이 나갔어요.", f).passed, true);
  assert.equal(checkSummary("3주 동안 5번, 모두 150만 원이 나갔어요.", f).checks.numbers_match, false);
  assert.equal(checkSummary("5번 나갔어요?", f).checks.no_question, false);
  assert.equal(checkSummary("사기일 수 있어요.", f).checks.banned, false);
  assert.equal(checkSummary("상대가 돈을 요구했어요.", f).checks.intent, false);
  assert.equal(checkSummary("한지훈 님에게 5번 보냈어요.", f).checks.no_name, false);
  assert.equal(checkSummary("가".repeat(91), f).checks.length, false);
  assert.deepEqual(numberTokens("1,070만 원과 147만 원, 3주"), ["1070", "147", "3"]);
  assert.deepEqual(findNames("이번에 같은 사람에게 3주 동안 5번, 모두 147만 원이 나갔어요. 이틀 만에 현금으로 찾았어요."), []);
  assert.deepEqual(findNames("김도현 선생님에게 보냈어요"), ["김도현"]);
  assert.deepEqual(findNames("한지훈에게 5번 보냈어요."), ["한지훈"]);
});

test("캐시 키: 항목 순서와 상관없이 같고, prompt_version이 다르면 다름", async () => {
  const a = await requestKey({ prompt_version: "understand-v1", text: "a", pattern: "same_person", level: "high" });
  const b = await requestKey({ level: "high", pattern: "same_person", text: "a", prompt_version: "understand-v1" });
  const c = await requestKey({ prompt_version: "understand-v2", text: "a", pattern: "same_person", level: "high" });
  assert.equal(a, b);
  assert.notEqual(a, c);
  assert.match(a, /^[0-9a-f]{64}$/);
});

test("서버 고정 문안(helperNoteTemplateFromFacts) = 브라우저 고정 문안(helperNoteTemplate), 모두 검사 통과", () => {
  const sets = [FACTS_A20, FACTS_B16, FACTS_C16, FACTS_C18, FACTS_D21, FACTS_EXTREME, { ...FACTS_EXTREME, salary_mode: "missing" as const, cum_count: 1 }];
  for (const f of sets) for (const p of ALL_PATTERNS) for (const p2 of [null, ...ALL_PATTERNS]) {
    const w = mkWeek({ week: 20, level: "high", pattern: p, pattern2: p2, facts: f, cpKeys: ["cp_01"] });
    const facts = helperNoteFacts(w);
    const t = helperNoteTemplate(w);
    assert.equal(helperNoteTemplateFromFacts(p, facts), t);
    const c = checkSummary(t, facts);
    assert.equal(c.passed, true, `${p}/${p2}: ${t} ${JSON.stringify(c.checks)}`);
  }
});
