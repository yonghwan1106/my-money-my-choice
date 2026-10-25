// P11 사전계산 시나리오 (구현명세 §8-1) → data/scenarios/<key>.json
//   실행: KEY_FILE=<키 파일> npx --prefix <repo> tsx <repo>\scripts\precompute.ts
//   - analysis = f1 CSV를 parse → analyze. f2 결과와 weeks의 level·prob·pattern이 다르면 멈춘다.
//   - settings = meta.settings, link의 cpLabel → cpKey(못 찾으면 unknown으로 두고 알림).
//   - script = §4-3 시연 답 경로를 policy에 넣은 {step, input} 목록(scripts/lib/demo_paths.ts).
//   - precomputed = /api/understand·/api/helper-note와 같은 함수(lib/llm/client.ts)를 실제로 부른 결과.
//   모델·임계값·각본을 시연에 맞추지 않는다 — 실제 단계 그대로 쓴다.
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import type {
  AnalyzeResult, HelperNoteRequest, Settings, UnderstandLabel, UnderstandRequest, UserInput, WeekResult,
} from "../lib/engine/types";
import { parseToTxs } from "../lib/engine/parse";
import { analyze } from "../lib/engine/analyze";
import { helperNoteFacts } from "../lib/engine/templates";
import { helperNote, understand, PRIMARY_MODEL } from "../lib/llm/client";
import { HELPERNOTE_VERSION, UNDERSTAND_VERSION } from "../lib/llm/prompts";
import { requestKey } from "../lib/llm/hash";
import { redact } from "../lib/privacy/redact";
import { readKey } from "./lib/key";
import { CHIP, pickDemoWeek, responder, runDemo, stepTrace, type ScenarioId } from "./lib/demo_paths";

const ROOT = path.resolve(__dirname, "..");
const KEYS: Record<ScenarioId, string> = { A: "A_minsu", B: "B_seoyeon", C: "C_youngho", D: "D_haneul" };

function ab(p: string): ArrayBuffer {
  const b = fs.readFileSync(p);
  return b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength) as ArrayBuffer;
}
function run(file: string): AnalyzeResult {
  const { txs, report } = parseToTxs(ab(file), path.basename(file));
  return analyze(txs, report);
}
function gitShort(): string {
  try { return execFileSync("git", ["-C", ROOT, "rev-parse", "--short", "HEAD"], { encoding: "utf-8", stdio: ["ignore", "pipe", "ignore"] }).trim(); } catch { return ""; }
}

type MetaLink = { state: "linked"; cpLabel: string } | { state: "not_in_list" } | { state: "unknown" };

function resolveSettings(meta: { settings: Settings & { helpers: (Settings["helpers"][number] & { link: MetaLink })[] } }, a: AnalyzeResult): { s: Settings; warn: string[] } {
  const warn: string[] = [];
  const s: Settings = JSON.parse(JSON.stringify(meta.settings));
  s.helpers = s.helpers.map((h) => {
    const l = h.link as unknown as MetaLink;
    if (l.state !== "linked") return { ...h, link: l.state === "not_in_list" ? { state: "not_in_list" } : { state: "unknown" } };
    const cp = a.counterparties.find((c) => c.label === l.cpLabel);
    if (!cp) { warn.push(`${h.id} 연결 대상 「${l.cpLabel}」을 상대방 목록에서 못 찾음 → unknown`); return { ...h, link: { state: "unknown" } }; }
    return { ...h, link: { state: "linked", cpKey: cp.cpKey } };
  });
  return { s, warn };
}

/** 그 주 가장 큰 출금(원, 양수). */
function maxOut(a: AnalyzeResult, w: WeekResult | undefined): number {
  if (!w) return 0;
  const ids = new Set(w.txIds);
  let m = 0;
  for (const t of a.txs) if (ids.has(t.id) && t.amount < 0) m = Math.max(m, -t.amount);
  return m;
}

function sameWeeks(x: AnalyzeResult, y: AnalyzeResult): boolean {
  return x.weeks.length === y.weeks.length && x.weeks.every((w, i) =>
    w.level === y.weeks[i].level && w.prob === y.weeks[i].prob && w.pattern === y.weeks[i].pattern);
}

async function main() {
  const apiKey = readKey();
  const noLlm = process.argv.includes("--no-llm");
  if (!apiKey && !noLlm) throw new Error("키 없음(KEY_FILE) — 키 없이 형식만 보려면 --no-llm");
  let calls = 0;
  const deps = { apiKey: noLlm ? null : apiKey, offline: true, onCall: () => { calls++; } };
  const outDir = path.join(ROOT, "data", "scenarios");
  for (const id of ["A", "B", "C", "D"] as ScenarioId[]) {
    const key = KEYS[id];
    const meta = JSON.parse(fs.readFileSync(path.join(outDir, "meta", `${key}.json`), "utf-8"));
    const a1 = run(path.join(ROOT, "public", "samples", `${key}_f1.csv`));
    const a2 = run(path.join(ROOT, "public", "samples", `${key}_f2.csv`));
    if (!sameWeeks(a1, a2)) throw new Error(`${key}: f1·f2 분석 결과가 다름 — 멈춤`);
    const { s, warn } = resolveSettings(meta, a1);
    for (const w of warn) console.log(`  ${key}: ${w}`);
    const cards = a1.weeks.filter((w) => w.level === "watch" || w.level === "high");

    // 이름 지우기용 상대방 이름(사람만, cpKey 순)
    const cpLabels = a1.counterparties.filter((c) => c.type === "person").sort((x, y) => x.cpKey.localeCompare(y.cpKey)).map((c) => c.label);
    const chipText = redact(CHIP[id], { displayName: s.displayName, helpers: s.helpers, cpLabels });

    // precomputed: 카드가 있는 모든 주에 칩 1개 + 요약 1개
    const understandPre: { key: string; request: UnderstandRequest; response: unknown }[] = [];
    const helperPre: { key: string; request: HelperNoteRequest; response: unknown }[] = [];
    for (const w of cards) {
      const ureq: UnderstandRequest = { prompt_version: UNDERSTAND_VERSION, text: chipText, pattern: w.pattern!, level: w.level as "watch" | "high" };
      const ukey = await requestKey(ureq);
      if (!understandPre.some((e) => e.key === ukey)) understandPre.push({ key: ukey, request: ureq, response: await understand(ureq, deps) });
      const hreq: HelperNoteRequest = { prompt_version: HELPERNOTE_VERSION, pattern: w.pattern!, level: w.level as "watch" | "high", facts: helperNoteFacts(w) };
      const hkey = await requestKey(hreq);
      if (!helperPre.some((e) => e.key === hkey)) helperPre.push({ key: hkey, request: hreq, response: await helperNote(hreq, deps) });
    }

    // 시연 답 경로(A는 칩 → 사전계산 결과로 understood)
    const demoWeek = pickDemoWeek(id, a1.weeks);
    let understoodInput: UserInput | undefined;
    if (demoWeek) {
      const ureq: UnderstandRequest = { prompt_version: UNDERSTAND_VERSION, text: chipText, pattern: demoWeek.pattern!, level: demoWeek.level as "watch" | "high" };
      const k = await requestKey(ureq);
      const hit = understandPre.find((e) => e.key === k)?.response as { label: UnderstandLabel; evidence: string } | undefined;
      if (hit) understoodInput = { type: "understood", label: hit.label, evidence: hit.evidence, mode: "precomputed" };
    }
    const demo = runDemo(id, a1.weeks, s, responder(id, understoodInput));

    // compare(§7-6)
    let compare: Record<string, unknown> = {};
    if (id === "A") {
      const b0w = a1.weeks.find((w) => w.b0);
      const mw = a1.weeks.find((w) => w.level === "watch" || w.level === "high");
      compare = {
        b0_first_week: b0w?.week ?? null, b0_first_max_krw: maxOut(a1, b0w),
        model_first_week: mw?.week ?? null, model_first_level: mw?.level ?? null, model_first_max_krw: maxOut(a1, mw),
      };
    } else if (id === "D") {
      const rows: number[] = meta.event_rows ?? [];
      const evIds = new Set(rows.map((r) => `r${r}`));
      const fw = a1.weeks.find((w) => w.txIds.some((t) => evIds.has(t)));
      compare = { fridge_week: fw?.week ?? null, b0: fw?.b0 ?? null, model_level: fw?.level ?? null };
    }

    const out = {
      id, title: meta.title, person: meta.person, sample: meta.sample,
      settings: s, analysis: a1, expected: meta.expected,
      script_week: demo.week,
      script: demo.steps.map(({ step, input }) => ({ step, input })),
      script_trace: stepTrace(demo.steps),
      compare,
      precomputed: { understand: understandPre, helperNotes: helperPre },
      generated: {
        at: new Date().toISOString(), model: noLlm ? "none" : PRIMARY_MODEL(),
        prompt_versions: [UNDERSTAND_VERSION, HELPERNOTE_VERSION], git: gitShort(),
        analysis_model: a1.modelVersion, f1_equals_f2: true,
      },
      note: "가상 인물·가상 거래(연습용). 사람·금액·가게는 실제가 아니에요.",
    };
    fs.writeFileSync(path.join(outDir, `${key}.json`), JSON.stringify(out) + "\n", "utf-8");
    const modes = [...understandPre.map((e) => (e.response as { mode: string }).mode), ...helperPre.map((e) => (e.response as { mode: string }).mode)];
    console.log(`${key}: cards=${cards.length} demo_week=${demo.week} trace=${out.script_trace.join(" → ")} understand=${understandPre.length} helper=${helperPre.length} modes=${[...new Set(modes)].join(",")} compare=${JSON.stringify(compare)}`);
  }
  console.log(`calls=${calls}`);
}

main().catch((e) => { console.error(e instanceof Error ? e.message : String(e)); process.exit(1); });
