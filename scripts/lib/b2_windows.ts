// B2(언어모델만) 비교용 200개 주 고르기 + 프롬프트 서식 (구현명세 §10-3 C8) → pipeline/work/b2_windows.json
//   pipeline/baseline_llm.py가 읽어 언어모델에 보낸다. 같은 200개 주의 GBM 값(동결 모델)도 여기서 같이 적는다.
//   고르기: 시험 사람(truth split=test)의 판단 보류가 아닌 주에서 양성 100 · 음성 100(그중 30은 까다로운 착취 없음 사람), 시드 20261026.
//   거래 요약은 프롬프트 서식일 뿐 특징이 아니다. 사람 상대방은 「상대1」… 별칭.
//   실행: npx --prefix <repo> tsx <repo>\scripts\lib\b2_windows.ts
import fs from "node:fs";
import path from "node:path";
import type { Category, Tx, WeekResult } from "../../lib/engine/types";
import { parseToTxs } from "../../lib/engine/parse";
import { analyze } from "../../lib/engine/analyze";
import { fmtDay } from "../../lib/engine/dates";

const ROOT = path.resolve(__dirname, "..", "..");
const SEED = 20261026;
const N_POS = 100, N_NEG = 100, N_NEG_TRICKY = 30, MAX_LINES = 60;

const CAT: Record<Category, string> = {
  income_salary: "급여 입금", income_benefit: "수당 입금", transfer_out: "송금", transfer_in: "받은 송금",
  cash_withdraw: "현금 인출", card_daily: "카드 결제", bill_recurring: "자동이체", telecom: "통신 요금",
  micro_payment: "소액결제", loan_in: "대출 입금", loan_repay: "대출 상환", unknown: "분류 모름",
};

export const B2_SYSTEM = `너는 발달장애인 본인의 통장 거래 한 주를 보고, 아는 사람이 돈을 조금씩 또는 한꺼번에 가져가는 경제적 착취가 이 주에 있었을 가능성을 0에서 1 사이 숫자로 낸다.
「앞 8주 범주별 합계」는 이 사람의 평소 흐름이다. 상대1·상대2…는 이름을 지운 사람이다.
JSON 한 줄만 출력한다: {"p":0.0}`;

function rng(seed: number) { let s = seed >>> 0; return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 2 ** 32; }; }
function shuffle<T>(a: T[], r: () => number): T[] { const b = [...a]; for (let i = b.length - 1; i > 0; i--) { const j = Math.floor(r() * (i + 1)); [b[i], b[j]] = [b[j], b[i]]; } return b; }
const won = (n: number) => `${Math.round(n).toLocaleString("en-US")}원`;
const hhmm = (m: number | null) => (m === null ? "--:--" : `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`);

function promptFor(weeks: WeekResult[], txs: Tx[], w: WeekResult, alias: Map<string, string>): string {
  const ids = new Set(w.txIds);
  const label = (t: Tx) => (t.cpKey && alias.has(t.cpKey) ? alias.get(t.cpKey)! : t.cpType === "person" ? "상대?" : t.cpLabel ?? "");
  const cur = txs.filter((t) => ids.has(t.id));
  const lines = cur.slice(0, MAX_LINES).map((t) =>
    `- ${fmtDay(t.day)} ${hhmm(t.minute)} ${t.amount < 0 ? "출금" : "입금"} ${won(Math.abs(t.amount))} ${CAT[t.category]}${label(t) ? " " + label(t) : ""}`);
  if (cur.length > MAX_LINES) lines.push(`- (그 밖 ${cur.length - MAX_LINES}건 생략)`);
  const prev = weeks.filter((x) => x.week >= w.week - 8 && x.week < w.week);
  const prevIds = new Set(prev.flatMap((x) => x.txIds));
  const sums = new Map<Category, number>();
  for (const t of txs) if (prevIds.has(t.id)) sums.set(t.category, (sums.get(t.category) ?? 0) + Math.abs(t.amount));
  const sumLines = [...sums.entries()].sort((a, b) => b[1] - a[1]).map(([c, v]) => `- ${CAT[c]}: ${won(v)}`);
  return [
    `이번 주(${fmtDay(w.weekStartDay)}부터 7일) 거래 ${cur.length}건:`, ...(lines.length ? lines : ["- 없음"]),
    `앞 8주(${prev.length}주) 범주별 합계:`, ...(sumLines.length ? sumLines : ["- 없음"]),
  ].join("\n");
}

function main() {
  const synth = path.join(ROOT, "pipeline", "work", "synth");
  const truth = JSON.parse(fs.readFileSync(path.join(synth, "truth.json"), "utf-8")) as Record<string, { split: string; tricky: string | null; cohort: string }>;
  const thr = JSON.parse(fs.readFileSync(path.join(ROOT, "data", "model", "thresholds.json"), "utf-8")) as { t1: number };
  // 라벨 = features.csv(featurize.ts, W-A 정의)
  const feat = fs.readFileSync(path.join(ROOT, "pipeline", "work", "features.csv"), "utf-8").split(/\r?\n/);
  const head = feat[0].split(",");
  const iP = head.indexOf("person_id"), iW = head.indexOf("week"), iL = head.indexOf("label");
  const labelOf = new Map<string, number>();
  for (const l of feat.slice(1)) { if (!l) continue; const c = l.split(","); labelOf.set(`${c[iP]}:${c[iW]}`, Number(c[iL])); }

  type Win = { pid: string; week: number; label: number; tricky: boolean; gbm_prob: number; gbm_card: boolean; user: string };
  const pos: Win[] = [], negT: Win[] = [], negO: Win[] = [];
  const ids = Object.keys(truth).filter((p) => truth[p].split === "test").sort();
  for (const pid of ids) {
    const b = fs.readFileSync(path.join(synth, "persons", `${pid}.csv`));
    const { txs, report } = parseToTxs(b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength) as ArrayBuffer, `${pid}.csv`);
    const res = analyze(txs, report);
    const persons = res.counterparties.filter((c) => c.type === "person").sort((x, y) => x.cpKey.localeCompare(y.cpKey));
    const alias = new Map(persons.map((c, i) => [c.cpKey, `상대${i + 1}`]));
    for (const w of res.weeks) {
      if (w.prob === null || w.level === "insufficient") continue;
      const lab = labelOf.get(`${pid}:${w.week}`);
      if (lab === undefined) continue;
      const win: Win = { pid, week: w.week, label: lab, tricky: truth[pid].tricky !== null, gbm_prob: w.prob, gbm_card: w.prob >= thr.t1, user: promptFor(res.weeks, res.txs, w, alias) };
      if (lab === 1) pos.push(win); else if (win.tricky) negT.push(win); else negO.push(win);
    }
  }
  const r = rng(SEED);
  const pick = [
    ...shuffle(pos, r).slice(0, N_POS),
    ...shuffle(negT, r).slice(0, N_NEG_TRICKY),
    ...shuffle(negO, r).slice(0, N_NEG - Math.min(N_NEG_TRICKY, negT.length)),
  ];
  const out = { seed: SEED, t1: thr.t1, system: B2_SYSTEM, pools: { pos: pos.length, neg_tricky: negT.length, neg_other: negO.length }, windows: pick };
  fs.writeFileSync(path.join(ROOT, "pipeline", "work", "b2_windows.json"), JSON.stringify(out) + "\n", "utf-8");
  const chars = pick.map((w) => w.user.length);
  console.log(`windows=${pick.length} pos=${pick.filter((w) => w.label === 1).length} neg=${pick.filter((w) => w.label === 0).length} tricky_neg=${pick.filter((w) => w.label === 0 && w.tricky).length} pools=${JSON.stringify(out.pools)} prompt_chars avg=${Math.round(chars.reduce((a, b) => a + b, 0) / chars.length)} max=${Math.max(...chars)}`);
}

main();
