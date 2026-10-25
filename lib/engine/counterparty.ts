// 상대방 키 (구현명세 §5-1). 정규화한 이름 → 처음 나온 순서대로 cp_01, cp_02 …. 현금 인출은 cpKey = null.
// 같은 정규화 이름은 범주가 달라도 같은 키를 쓴다(예: 급여 준 곳과 그곳으로 간 송금 — S10 비교용).
import type { Category, Counterparty, CpType, Tx } from "./types";
import { GENERIC_WORDS, cleanName } from "./lexicon";
import { personToken } from "./categorize";

const GENERIC_SORTED = [...GENERIC_WORDS].sort((a, b) => b.length - a.length);

function stripGeneric(s: string): string {
  let out = String(s ?? "");
  for (const g of GENERIC_SORTED) out = out.split(g).join(" ");
  // 계좌·전화 모양 숫자(4자리 이상)는 이름에서 뺀다
  return cleanName(out.replace(/\d{4,}[-\d]*/g, " "));
}

export function cpTypeOf(category: Category, isPerson: boolean): CpType | null {
  switch (category) {
    case "cash_withdraw":
      return null;
    case "transfer_out":
    case "transfer_in":
      return isPerson ? "person" : "merchant";
    case "card_daily":
    case "micro_payment":
      return "merchant";
    case "bill_recurring":
    case "telecom":
    case "loan_repay":
      return "biller";
    case "loan_in":
      return "lender";
    case "income_salary":
      return "employer";
    case "income_benefit":
      return "agency";
    default:
      return isPerson ? "person" : null;
  }
}

/** 한 거래의 상대방 이름·종류 (모르면 null) */
export function extractCounterparty(
  memo1: string,
  memo2: string,
  category: Category,
): { label: string; norm: string; type: CpType } | null {
  if (category === "cash_withdraw") return null;
  const person = personToken(memo2, memo1);
  if (person && category !== "income_salary" && category !== "income_benefit" && category !== "loan_in") {
    const type = cpTypeOf(category, true);
    if (!type) return null;
    return { label: person, norm: cleanName(person), type };
  }
  if (category === "unknown") return null;
  // 기재내용 → 적요 순서로 일반 낱말을 지우고 남은 것
  for (const f of [memo2, memo1]) {
    if (!f) continue;
    const norm = stripGeneric(f);
    if (norm.length >= 2) {
      const type = cpTypeOf(category, false);
      if (!type) return null;
      return { label: f.trim().replace(/\s+/g, " "), norm, type };
    }
  }
  const whole = cleanName([memo1, memo2].filter(Boolean).join(""));
  if (whole.length >= 2) {
    const type = cpTypeOf(category, false);
    if (!type) return null;
    return { label: [memo1, memo2].filter(Boolean).join(" ").trim(), norm: whole, type };
  }
  return null;
}

/** 키 붙이기: 입력을 바꾸지 않고 새 Tx 배열을 돌려준다. fields[i] = 그 거래의 [적요, 기재내용] */
export function assignCounterparties(txs: Tx[], fields: [string, string][]): Tx[] {
  const keys = new Map<string, { key: string; label: string }>();
  return txs.map((t, i) => {
    const [m1, m2] = fields[i] ?? ["", ""];
    const cp = extractCounterparty(m1, m2, t.category);
    if (!cp) return { ...t, cpKey: null, cpLabel: null, cpType: null };
    let k = keys.get(cp.norm);
    if (!k) {
      const label = cp.type === "person" ? cp.norm : displayLabel(cp.label, cp.norm);
      k = { key: `cp_${String(keys.size + 1).padStart(2, "0")}`, label };
      keys.set(cp.norm, k);
    }
    return { ...t, cpKey: k.key, cpLabel: k.label, cpType: cp.type };
  });
}

function displayLabel(raw: string, norm: string): string {
  // 화면용: 일반 낱말을 뺀 이름(예: 「급여 햇살보호작업장」 → 「햇살보호작업장」)
  return norm || raw;
}

/** cpKey별 집계 (analyze.ts가 써도 된다) */
export function summarizeCounterparties(txs: Tx[]): Counterparty[] {
  const map = new Map<string, Counterparty>();
  for (const t of txs) {
    if (!t.cpKey) continue;
    let c = map.get(t.cpKey);
    if (!c) {
      c = { cpKey: t.cpKey, label: t.cpLabel ?? "", type: t.cpType ?? "merchant", firstDay: t.day, txCount: 0, outKrw: 0, inKrw: 0 };
      map.set(t.cpKey, c);
    }
    c.txCount += 1;
    if (t.day < c.firstDay) c.firstDay = t.day;
    if (t.amount < 0) c.outKrw += -t.amount;
    else c.inKrw += t.amount;
  }
  return [...map.values()].sort((a, b) => a.cpKey.localeCompare(b.cpKey));
}
