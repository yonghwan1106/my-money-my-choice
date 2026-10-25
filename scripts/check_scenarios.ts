// P12 시나리오 대조 (구현명세 §8-1): 시나리오마다 「주 → level·pattern·b0」 표와 각본 기대값을 나란히 찍고 다른 칸에 ≠.
// 모델·임계값·각본을 고치려는 것이 아니다 — 차이를 보고하고 Advisor가 시연 장면을 정한다.
// 사용: npx --prefix <repo> tsx <repo>\scripts\check_scenarios.ts [--md]
import fs from "node:fs";
import path from "node:path";
import { parseToTxs } from "../lib/engine/parse";
import { analyze } from "../lib/engine/analyze";
import type { AnalyzeResult, WeekResult } from "../lib/engine/types";

const ROOT = path.resolve(__dirname, "..");
const KEYS = ["A_minsu", "B_seoyeon", "C_youngho", "D_haneul"];
const md = process.argv.includes("--md");

interface Expected { weeks: { week: number; level: string; pattern?: string; pattern2?: string; note?: string }[]; other_weeks: string; b0_first_week?: number }

function ab(p: string): ArrayBuffer {
  const b = fs.readFileSync(p);
  return b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength) as ArrayBuffer;
}
function run(file: string): AnalyzeResult {
  const { txs, report } = parseToTxs(ab(file), path.basename(file));
  return analyze(txs, report);
}
function levelOk(exp: string, got: string): boolean {
  if (exp === "watch_or_higher") return got === "watch" || got === "high";
  return exp === got;
}

let allSame = true;
for (const key of KEYS) {
  const meta = JSON.parse(fs.readFileSync(path.join(ROOT, "data", "scenarios", "meta", key + ".json"), "utf-8"));
  const exp: Expected = meta.expected;
  const r1 = run(path.join(ROOT, "public", "samples", key + "_f1.csv"));
  const r2 = run(path.join(ROOT, "public", "samples", key + "_f2.csv"));
  const sameFormats = r1.weeks.length === r2.weeks.length && r1.weeks.every((w, i) =>
    w.level === r2.weeks[i].level && w.prob === r2.weeks[i].prob && w.pattern === r2.weeks[i].pattern);
  const lab = new Map(r1.counterparties.map((c) => [c.cpKey, c.label]));
  const expBy = new Map(exp.weeks.map((e) => [e.week, e]));
  const b0First = r1.weeks.find((w) => w.b0)?.week ?? null;
  const firstCard = r1.weeks.find((w) => w.level === "watch" || w.level === "high")?.week ?? null;
  const firstHigh = r1.weeks.find((w) => w.level === "high")?.week ?? null;
  console.log(md ? `\n**${meta.id} ${meta.title}** (${key}, 모델 ${r1.modelVersion}, f1=f2 ${sameFormats ? "같음" : "다름 ≠"})\n` :
    `\n== ${meta.id} ${meta.title} (${key}) model=${r1.modelVersion} f1==f2:${sameFormats}`);
  if (md) console.log("| 주 | 실제 level | 기대 level | 실제 수법(첫·둘째) | 기대 수법 | b0 | 확률 | 켜진 신호 | 상대방 |\n|---|---|---|---|---|---|---|---|---|");
  for (const w of r1.weeks) {
    const e = expBy.get(w.week);
    const expLevel = e ? e.level : exp.other_weeks;
    const lvOk = w.level === "insufficient" && !e ? true : levelOk(expLevel, w.level);
    const patOk = !e || !e.pattern || e.pattern === w.pattern;
    const show = !!e || w.level === "watch" || w.level === "high" || w.b0 || !lvOk;
    if (!show) continue;
    if (!lvOk || !patOk) allSame = false;
    const fired = w.signals.filter((s) => s.fired).map((s) => s.id).join(",");
    const cps = w.cpKeys.map((c) => lab.get(c) ?? c).join("/");
    const got = `${w.pattern ?? "-"}${w.pattern2 ? "·" + w.pattern2 : ""}`;
    const ep = e?.pattern ? `${e.pattern}${e.pattern2 ? "·" + e.pattern2 : ""}` : "-";
    const prob = w.prob === null ? "-" : w.prob.toFixed(3);
    if (md) {
      console.log(`| ${w.week} | ${w.level} | ${expLevel}${lvOk ? "" : " ≠"} | ${got} | ${ep}${patOk ? "" : " ≠"} | ${w.b0 ? "Y" : ""} | ${prob} | ${fired} | ${cps} |`);
    } else {
      console.log(`wk${String(w.week).padStart(2)} level=${w.level.padEnd(12)} exp=${expLevel.padEnd(15)}${lvOk ? "  " : "≠ "} pattern=${got.padEnd(30)} exp=${ep}${patOk ? "" : " ≠"} b0=${w.b0 ? 1 : 0} p=${prob} fired=${fired} cp=${cps}`);
    }
  }
  const b0Line = exp.b0_first_week !== undefined ? ` · B0 첫 경고 실제 ${b0First} / 기대 ${exp.b0_first_week}${b0First === exp.b0_first_week ? "" : " ≠"}` : ` · B0 첫 경고 ${b0First}`;
  console.log((md ? "\n" : "") + `첫 카드 주 ${firstCard} · 첫 high 주 ${firstHigh}${b0Line}`);
  if (exp.b0_first_week !== undefined && b0First !== exp.b0_first_week) allSame = false;
  if (!sameFormats) allSame = false;
}
console.log(md ? `\n결과: ${allSame ? "기대와 모두 같음" : "기대와 다른 칸 있음(≠)"}` : `\nRESULT ${allSame ? "SAME" : "DIFF"}`);
