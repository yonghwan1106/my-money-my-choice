// P4 특징 추출 (구현명세 §4-4): persons/*.csv + truth.json → features.csv (사람×주 행)
// parse.ts(B) → analyze.ts(A, 모델 없이)로 계산한다. Python에서 특징을 다시 계산하지 않는다. 숫자는 String(x).
// 사용: npx --prefix <repo> tsx <repo>\scripts\featurize.ts --in <repo>\pipeline\work\synth --out <repo>\pipeline\work\features.csv
//       [--fired-out <path>]  (신호별 발화 여부 — 발화 조건 조정용, 선택)
import fs from "node:fs";
import path from "node:path";
import { parseToTxs } from "../lib/engine/parse";
import { analyze } from "../lib/engine/analyze";
import { FEATURE_NAMES } from "../lib/engine/features";

const D0 = Date.UTC(2026, 3, 6) / 86400000; // 합성 데이터 첫날 2026-04-06

interface Truth {
  split: string; cohort: string; pattern: string | null; perpetrator: string | null;
  exploit_rows: number[]; missing_salary_days?: number[];
}

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(name);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

function ab(p: string): ArrayBuffer {
  const b = fs.readFileSync(p);
  return b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength) as ArrayBuffer;
}

export function featurizeDir(inDir: string): { header: string[]; rows: string[][]; fired: string[][] } {
  const truth: Record<string, Truth> = JSON.parse(fs.readFileSync(path.join(inDir, "truth.json"), "utf-8"));
  const header = ["person_id", "week", "split", "cohort", "pattern", "perpetrator", "label", "baseline_weeks",
    "level_insufficient", "b0", "b3", ...FEATURE_NAMES];
  const rows: string[][] = [];
  const fired: string[][] = [];
  for (const pid of Object.keys(truth).sort()) {
    const tr = truth[pid];
    const { txs, report } = parseToTxs(ab(path.join(inDir, "persons", pid + ".csv")), pid + ".csv");
    if (report.missingRequired.length) throw new Error(pid + ": missing " + report.missingRequired.join(","));
    const res = analyze(txs, report, { model: "none" });
    const exploitIds = new Set(tr.exploit_rows.map((n) => "r" + n));
    const missDays = (tr.missing_salary_days ?? []).map((d) => D0 + d);
    for (const w of res.weeks) {
      const lab = w.txIds.some((id) => exploitIds.has(id)) || missDays.some((d) => d >= w.weekStartDay && d <= w.weekStartDay + 6);
      rows.push([pid, String(w.week), tr.split, tr.cohort, tr.pattern ?? "", tr.perpetrator ?? "", lab ? "1" : "0",
        String(w.baselineWeeks), w.level === "insufficient" ? "1" : "0", w.b0 ? "1" : "0", String(w.b3),
        ...w.features.map((x) => String(x))]);
      fired.push([pid, String(w.week), ...w.signals.map((s) => (s.fired ? "1" : "0"))]);
    }
  }
  return { header, rows, fired };
}

function main() {
  const inDir = arg("--in");
  const out = arg("--out");
  if (!inDir || !out) {
    console.error("usage: featurize.ts --in <dir> --out <features.csv> [--fired-out <path>]");
    process.exit(2);
  }
  const t0 = Date.now();
  const { header, rows, fired } = featurizeDir(inDir);
  fs.mkdirSync(path.dirname(out), { recursive: true });
  fs.writeFileSync(out, [header.join(","), ...rows.map((r) => r.join(","))].join("\n") + "\n", "utf-8");
  const fo = arg("--fired-out");
  if (fo) {
    const h = ["person_id", "week", "S1", "S2", "S3", "S4", "S5", "S6", "S7", "S8", "S9", "S10"];
    fs.writeFileSync(fo, [h.join(","), ...fired.map((r) => r.join(","))].join("\n") + "\n", "utf-8");
  }
  const persons = new Set(rows.map((r) => r[0])).size;
  console.log(`rows=${rows.length} persons=${persons} cols=${header.length} positives=${rows.filter((r) => r[6] === "1").length} ms=${Date.now() - t0}`);
}

main();
