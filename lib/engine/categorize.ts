// 범주 정하기 (구현명세 §5-1) — 사전만, 위에서부터 첫 일치. memo + memo2 + branch를 본다.
import type { Category } from "./types";
import { CATEGORY_RULES, STORE_NAMES, STORE_RE, isPersonName } from "./lexicon";

/** 적요·기재내용 낱말 중 사람 이름이 있으면 그 이름 */
export function personToken(...fields: string[]): string | null {
  for (const f of fields) {
    if (!f) continue;
    if (isPersonName(f)) return f.trim();
    for (const tok of f.split(/[\s,/·|]+/)) {
      if (tok && isPersonName(tok)) return tok.replace(/\(.*?\)|님$/g, "").trim();
    }
  }
  return null;
}

export function categorize(memo1: string, memo2: string, branch: string, amount: number): Category {
  const text = [memo1, memo2, branch].filter(Boolean).join(" ");
  const dir = amount < 0 ? "out" : "in";
  for (const r of CATEGORY_RULES) {
    if (r.dir !== "any" && r.dir !== dir) continue;
    if (r.category === "card_daily") {
      if (r.re.test(text) || STORE_NAMES.some((n) => text.includes(n)) || STORE_RE.test(text)) return "card_daily";
      continue;
    }
    if (r.category === "transfer") {
      if (r.re.test(text) || personToken(memo2, memo1)) return dir === "out" ? "transfer_out" : "transfer_in";
      continue;
    }
    if (r.re.test(text)) return r.category;
  }
  return "unknown";
}
