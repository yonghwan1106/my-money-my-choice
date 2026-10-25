// 알림 요약 검사 (구현명세 §10-3 C6, §12 helpernote_eval_v1.json)
//   합성 시험 사람(truth.json split=test)을 분석해 watch·high 주 60개를 고르고, /api/helper-note와 같은 함수로 요약을 만든다.
//   실행: KEY_FILE=<키 파일> npx --prefix <repo> tsx <repo>\scripts\eval_helpernote.ts [--dry]
//   60개 고르기: 수법별로 돌아가며(같은 수법 안에서는 사람·주 순서), 시드 고정 — 결과를 보고 고르지 않는다.
//   I9(model-frozen) 전에는 모델 없는 analyze 결과로 「형식만」 돌리고 provisional:true를 적는다. I9 뒤 다시 돌린다.
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import type { HelperNoteRequest, PatternId, WeekResult } from "../lib/engine/types";
import { parseToTxs } from "../lib/engine/parse";
import { analyze } from "../lib/engine/analyze";
import { helperNoteFacts } from "../lib/engine/templates";
import { helperNote, PRIMARY_MODEL } from "../lib/llm/client";
import { HELPERNOTE_VERSION } from "../lib/llm/prompts";
import { checkSummary } from "../lib/llm/validate";
import { findBanned, findIntent } from "../lib/llm/banned";
import { readKey } from "./lib/key";

const PRICE: Record<string, [number, number]> = {
  "claude-haiku-5-5": [0.10, 0.50], "claude-haiku-4-5": [1, 5], "claude-sonnet-5": [2, 10],
};
const ROOT = path.resolve(__dirname, "..");
const N = 60;
const SEED = 20261026;

function rng(seed: number) { let s = seed >>> 0; return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 2 ** 32; }; }

function gitTagExists(tag: string): string | null {
  try { return execFileSync("git", ["-C", ROOT, "rev-parse", "--short", tag], { encoding: "utf-8", stdio: ["ignore", "pipe", "ignore"] }).trim(); } catch { return null; }
}

async function main() {
  const dry = process.argv.includes("--dry");
  const synth = path.join(ROOT, "pipeline", "work", "synth");
  const truth = JSON.parse(fs.readFileSync(path.join(synth, "truth.json"), "utf-8")) as Record<string, { split: string }>;
  const ids = Object.keys(truth).filter((id) => truth[id].split === "test").sort();
  const cands: { pid: string; w: WeekResult }[] = [];
  let modelVersion = "none";
  for (const pid of ids) {
    const buf = fs.readFileSync(path.join(synth, "persons", `${pid}.csv`));
    const ab = buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength) as ArrayBuffer;
    const { txs, report } = parseToTxs(ab, `${pid}.csv`);
    const res = analyze(txs, report);
    modelVersion = res.modelVersion;
    for (const w of res.weeks) if ((w.level === "watch" || w.level === "high") && w.pattern) cands.push({ pid, w });
  }
  // 수법별로 묶고 묶음 안을 시드로 섞은 뒤 돌아가며 뽑는다
  const r = rng(SEED);
  const byPat = new Map<PatternId, { pid: string; w: WeekResult }[]>();
  for (const c of cands) { const k = c.w.pattern as PatternId; if (!byPat.has(k)) byPat.set(k, []); byPat.get(k)!.push(c); }
  for (const list of byPat.values()) for (let i = list.length - 1; i > 0; i--) { const j = Math.floor(r() * (i + 1)); [list[i], list[j]] = [list[j], list[i]]; }
  const pats = [...byPat.keys()].sort();
  const pick: { pid: string; w: WeekResult }[] = [];
  for (let round = 0; pick.length < N && pats.some((p) => byPat.get(p)!.length > round); round++) {
    for (const p of pats) { const it = byPat.get(p)![round]; if (it && pick.length < N) pick.push(it); }
  }
  const patCount = Object.fromEntries(pats.map((p) => [p, pick.filter((x) => x.w.pattern === p).length]));
  console.log(`test persons=${ids.length} candidate weeks=${cands.length} picked=${pick.length} model=${modelVersion} by_pattern=${JSON.stringify(patCount)}`);
  if (dry) return;

  const apiKey = readKey();
  if (!apiKey) throw new Error("키 없음(KEY_FILE)");
  let cost = 0; let calls = 0;
  let firstPass = 0; let finalLive = 0; let templateFallbacks = 0;
  let attempts = 0; let attemptsJson = 0; let attemptsNumOk = 0;
  let rawBanned = 0; let rawIntent = 0; let rawName = 0; let rawLen = 0; let rawQ = 0;
  let finalBanned = 0; let finalIntent = 0;
  for (const { w } of pick) {
    const req: HelperNoteRequest = { prompt_version: HELPERNOTE_VERSION, pattern: w.pattern as PatternId, level: w.level as "watch" | "high", facts: helperNoteFacts(w) };
    let first: boolean | null = null;
    const res = await helperNote(req, {
      apiKey, offline: true,
      onCall: (c) => { calls++; const p = PRICE[c.model] ?? PRICE["claude-haiku-4-5"]; cost += (c.input_tokens * p[0] + c.output_tokens * p[1]) / 1e6; },
      onCheck: (c) => {
        attempts++;
        if (first === null) first = c.passed;
        if (c.checks?.json) {
          attemptsJson++;
          if (c.checks.numbers_match) attemptsNumOk++;
          if (!c.checks.banned) rawBanned++;
          if (!c.checks.intent) rawIntent++;
          if (!c.checks.no_name) { rawName++; if (process.argv.includes("--show")) console.log("  no_name:", c.raw); }
          if (!c.checks.length) rawLen++;
          if (!c.checks.no_question) rawQ++;
        }
      },
    });
    if (first === true) firstPass++;
    if (res.mode === "live") finalLive++; else templateFallbacks++;
    if (findBanned(res.summary).length) finalBanned++;
    if (findIntent(res.summary).length) finalIntent++;
    if (!checkSummary(res.summary, req.facts).passed) throw new Error("나간 요약이 검사를 통과하지 못함 — 코드 오류");
    await new Promise((s) => setTimeout(s, 200));
  }
  const r4 = (x: number) => Math.round(x * 10000) / 10000;
  const out = {
    prompt_version: HELPERNOTE_VERSION, model: PRIMARY_MODEL(), n: pick.length,
    pass_first: r4(firstPass / pick.length),
    pass_after_retry: r4(finalLive / pick.length),
    numbers_match_rate: attemptsJson ? r4(attemptsNumOk / attemptsJson) : 0,
    banned_hits: finalBanned, intent_hits: finalIntent, template_fallbacks: templateFallbacks,
    cost_usd: Math.round(cost * 1e6) / 1e6,
    raw: { attempts, attempts_json: attemptsJson, banned: rawBanned, intent: rawIntent, name: rawName, length: rawLen, question: rawQ },
    calls, by_pattern: patCount,
    analyze_model: modelVersion, model_frozen: gitTagExists("model-frozen"), provisional: !gitTagExists("model-frozen"),
    generated_at: new Date().toISOString(),
    note: "banned_hits·intent_hits = 본인 화면에 나간 요약 기준(검증기가 걸러 늘 0이어야 함). raw = 검증기가 거르기 전 시도별 위반 수. numbers_match_rate = JSON이 맞은 시도 중 숫자 일치 비율.",
  };
  const file = path.join(ROOT, "data", "eval", "helpernote_eval_v1.json");
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(out, null, 2) + "\n", "utf-8");
  console.log(JSON.stringify({ ...out, note: undefined }));
}

main().catch((e) => { console.error(e instanceof Error ? e.message : String(e)); process.exit(1); });
