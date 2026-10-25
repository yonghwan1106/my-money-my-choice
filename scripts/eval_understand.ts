// 말로 한 답 알아듣기 평가 (구현명세 §10-3 C6, §12 understand_eval_v1.json)
//   dev 40으로만 프롬프트를 확인하고, test 80은 --final로 한 번만 돌린다(결과를 보고 고치지 않음).
//   실행: KEY_FILE=<키 파일> npx --prefix <repo> tsx <repo>\scripts\eval_understand.ts --split dev|test [--final]
//   요청의 pattern·level은 모든 문장에 같게 둔다(same_person·high) — 문장 자체만 비교하려는 것.
//   언어모델이 두 번 다 실패하면 서비스와 똑같이 K0 결과로 채우고 failures에 센다.
import fs from "node:fs";
import path from "node:path";
import type { UnderstandLabel, UnderstandRequest } from "../lib/engine/types";
import { understand, PRIMARY_MODEL } from "../lib/llm/client";
import { k0 } from "../lib/llm/k0";
import { UNDERSTAND_LABELS } from "../lib/llm/validate";
import { UNDERSTAND_VERSION } from "../lib/llm/prompts";
import { readKey } from "./lib/key";

// 가격(달러/백만 토큰) — 02_분석 U6_인프라점검 §가격표
const PRICE: Record<string, [number, number]> = {
  "claude-haiku-5-5": [0.10, 0.50], "claude-haiku-4-5": [1, 5], "claude-sonnet-5": [2, 10],
};

const ROOT = path.resolve(__dirname, "..");
interface Row { id: string; text: string; label: UnderstandLabel; split: "dev" | "test"; tag: string }

function metrics(truth: UnderstandLabel[], pred: UnderstandLabel[]) {
  const L = UNDERSTAND_LABELS;
  const m = L.map(() => L.map(() => 0));
  truth.forEach((t, i) => { m[L.indexOf(t)][L.indexOf(pred[i])]++; });
  const acc = truth.filter((t, i) => t === pred[i]).length / truth.length;
  const f1s = L.map((_, k) => {
    const tp = m[k][k];
    const fp = L.reduce((s, __, r) => s + (r === k ? 0 : m[r][k]), 0);
    const fn = L.reduce((s, __, c) => s + (c === k ? 0 : m[k][c]), 0);
    const p = tp + fp ? tp / (tp + fp) : 0; const r = tp + fn ? tp / (tp + fn) : 0;
    return p + r ? (2 * p * r) / (p + r) : 0;
  });
  const macro = f1s.reduce((a, b) => a + b, 0) / L.length;
  // 위험한 오분류: 하라고 한 일(asked·threatened)을 '내가 하고 싶어서'로 읽은 수
  const dangerous = truth.filter((t, i) => (t === "asked_by_someone" || t === "threatened") && pred[i] === "my_choice").length;
  const r4 = (x: number) => Math.round(x * 10000) / 10000;
  return { accuracy: r4(acc), macro_f1: r4(macro), dangerous_misclass: dangerous, confusion: m };
}

async function main() {
  const args = process.argv.slice(2);
  const split = (args[args.indexOf("--split") + 1] ?? "dev") as "dev" | "test";
  const final = args.includes("--final");
  if (final && split !== "test") throw new Error("--final은 test에만");
  const rows: Row[] = fs.readFileSync(path.join(ROOT, "pipeline", "understand_eval", "sentences.jsonl"), "utf-8")
    .split(/\r?\n/).filter(Boolean).map((l) => JSON.parse(l)).filter((r: Row) => r.split === split);
  const apiKey = readKey();
  if (!apiKey) throw new Error("키 없음(KEY_FILE)");
  let cost = 0; let failures = 0; let calls = 0;
  const onCall = (c: { model: string; ok: boolean; input_tokens: number; output_tokens: number }) => {
    calls++;
    const p = PRICE[c.model] ?? PRICE["claude-haiku-4-5"];
    cost += (c.input_tokens * p[0] + c.output_tokens * p[1]) / 1e6;
  };
  const llmPred: UnderstandLabel[] = []; const k0Pred: UnderstandLabel[] = []; const truth: UnderstandLabel[] = [];
  const detail: { id: string; tag: string; label: string; llm: string; k0: string; mode: string }[] = [];
  for (const r of rows) {
    const req: UnderstandRequest = { prompt_version: UNDERSTAND_VERSION, text: r.text, pattern: "same_person", level: "high" };
    const res = await understand(req, { apiKey, offline: true, onCall });
    if (res.mode !== "live") failures++;
    const kk = k0(r.text).label;
    truth.push(r.label); llmPred.push(res.label); k0Pred.push(kk);
    detail.push({ id: r.id, tag: r.tag, label: r.label, llm: res.label, k0: kk, mode: res.mode });
    await new Promise((s) => setTimeout(s, 200));
  }
  const lm = metrics(truth, llmPred); const km = metrics(truth, k0Pred);
  const wrong = detail.filter((d) => d.llm !== d.label);
  console.log(`split=${split} n=${rows.length} model=${PRIMARY_MODEL()} calls=${calls} failures=${failures} cost_usd=${cost.toFixed(5)}`);
  console.log(`LLM acc=${lm.accuracy} macroF1=${lm.macro_f1} dangerous=${lm.dangerous_misclass}`);
  console.log(`K0  acc=${km.accuracy} macroF1=${km.macro_f1} dangerous=${km.dangerous_misclass}`);
  for (const d of wrong) console.log(`  LLM 오답 ${d.id} [${d.tag}] 정답 ${d.label} → ${d.llm}`);
  const out = {
    prompt_version: UNDERSTAND_VERSION, model: PRIMARY_MODEL(), dev_n: 40, test_n: 80, final,
    split, n: rows.length,
    llm: { accuracy: lm.accuracy, macro_f1: lm.macro_f1, dangerous_misclass: lm.dangerous_misclass },
    k0: { accuracy: km.accuracy, macro_f1: km.macro_f1, dangerous_misclass: km.dangerous_misclass },
    confusion: { labels: UNDERSTAND_LABELS, llm: lm.confusion, k0: km.confusion },
    failures, calls, cost_usd: Math.round(cost * 1e6) / 1e6,
    generated_at: new Date().toISOString(),
    note: "평가 문장은 개발팀이 쓴 가상 문장(당사자 문장 아님). 요청 pattern·level은 same_person·high로 고정.",
  };
  const file = final
    ? path.join(ROOT, "data", "eval", "understand_eval_v1.json")
    : path.join(ROOT, "pipeline", "work", `understand_${split}.json`);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  if (final && fs.existsSync(file) && JSON.parse(fs.readFileSync(file, "utf-8")).final === true) {
    throw new Error("test는 이미 한 번 돌렸다(final:true) — 다시 돌리지 않는다");
  }
  fs.writeFileSync(file, JSON.stringify(out, null, 2) + "\n", "utf-8");
  console.log(`wrote ${path.relative(ROOT, file)}`);
}

main().catch((e) => { console.error(e instanceof Error ? e.message : String(e)); process.exit(1); });
