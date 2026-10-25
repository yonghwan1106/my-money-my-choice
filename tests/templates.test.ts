import { test } from "node:test";
import assert from "node:assert/strict";
import type { Facts, PatternId, WeekResult } from "../lib/engine/types";
import {
  ALL_PATTERNS, alertMessage, askCard, explainCard, helpRequestMessage, helperNoteFacts, helperNoteTemplate,
  MAX_LINE, MAX_SUMMARY, MAX_TITLE,
} from "../lib/engine/templates";
import { incomeWord, krw, period, within } from "../lib/engine/format";
import { findBanned, findIntent } from "../lib/llm/banned";
import {
  FACTS_A20, FACTS_B16, FACTS_C16, FACTS_C18, FACTS_C19, FACTS_D21, FACTS_EXTREME, mkWeek,
} from "./_fixtures";

const NAMES = ["민수", "가나다라"];

const NORMAL: Facts = { ...FACTS_A20, ...FACTS_C16, ...FACTS_C18, ...FACTS_D21, micro_count: 12, micro_total_krw: 84_000,
  usual_micro_count: 1, leak_weeks: 5, leak_excess_krw: 400_000, usual_week_krw: 60_000, week_total_krw: 150_000, salary_day: 10,
  salary_mode: "missing", usual_week_count: 1 };

// 모드·경계값 변형(모든 문안 갈래를 지나가게)
const VARIANTS: Facts[] = [
  NORMAL, FACTS_EXTREME, FACTS_A20, FACTS_B16, FACTS_C16, FACTS_C18, FACTS_C19, FACTS_D21,
  { ...FACTS_EXTREME, out_mode: "cash", leak_mode: "cash", big_category: "cash", salary_mode: "missing", cp_is_new: false },
  { ...FACTS_EXTREME, big_category: "transfer", cum_count: 1, usual_bills: 0, usual_micro_count: 0, hours: 10 },
  { ...FACTS_EXTREME, big_place: null, income_kind: "salary", hours: 40 },
  { ...NORMAL, cum_count: 1, cp_is_new: true, hours: 100 },
  {}, // 빈 facts(방어)
];

function allTexts(w: WeekResult, name: string) {
  const a = askCard(w, name);
  const e = explainCard(w, name);
  const sum = helperNoteTemplate(w);
  const help = helpRequestMessage(w, name);
  const alert = alertMessage(sum, "someone_told", name);
  return { a, e, sum, help, alert };
}

function weeksFor(): WeekResult[] {
  const out: WeekResult[] = [];
  for (const f of VARIANTS) {
    for (const p of ALL_PATTERNS) {
      for (const p2 of [null, ...ALL_PATTERNS] as (PatternId | null)[]) {
        for (const fired of [["S1"], ["S9"], []] as const) {
          if (p !== "big_spend" && fired.length) continue;
          out.push(mkWeek({ week: 20, level: "high", pattern: p, pattern2: p2, facts: f, cpKeys: ["cp_01"], fired: [...fired] }));
        }
      }
    }
  }
  out.push(mkWeek({ week: 20, level: "watch", pattern: null, facts: {} }));
  return out;
}

const SENT_END = /요[.?]$/u;
const NO_DECIMAL = /\d\.\d/u;

test("format: krw·period·within·incomeWord", () => {
  assert.equal(krw(1_470_000), "147만 원");
  assert.equal(krw(1_070_000), "107만 원");
  assert.equal(krw(6_000), "6천 원");
  assert.equal(krw(99_990_000), "9,999만 원");
  assert.equal(krw(120_000_000), "1억 2천만 원");
  assert.equal(krw(-50_000), "5만 원");
  assert.equal(period(3), "3주");
  assert.equal(period(0.5), "며칠");
  assert.equal(within(24), "하루 만에");
  assert.equal(within(48), "이틀 만에");
  assert.equal(within(72), "사흘 만에");
  assert.equal(incomeWord("salary"), "월급");
  assert.equal(incomeWord("benefit"), "수당");
});

test("시나리오 A 20주 카드가 §7-9 예와 같다", () => {
  const w = mkWeek({ week: 20, level: "high", pattern: "same_person", pattern2: "after_income", facts: FACTS_A20, cpKeys: ["cp_03"] });
  const c = askCard(w, "민수");
  assert.equal(c.title, "같은 사람에게 여러 번");
  assert.deepEqual(c.lines, ["처음 돈을 보낸 사람에게 3주 동안 5번 보냈어요.", "월급 130만 원 중 107만 원이 하루 만에 나갔어요."]);
  assert.equal(c.question, "이 돈, 민수 님이 주고 싶어서 보낸 거예요?");
  assert.equal(c.footer, "돈 보내기는 막지 않아요.");
  assert.equal(c.picture, "money_send");
  assert.equal(c.eventId, "w20");
  const hn = helperNoteFacts(w);
  assert.equal(hn.pattern_label, "같은 사람에게 여러 번");
  assert.equal(hn.level_label, "위험이 높아요");
  assert.equal(hn.period, "3주");
  assert.equal(hn.items["합계"], "147만 원");
  assert.equal(hn.items["수입 뒤 나간 돈"], "107만 원");
  assert.equal(helperNoteTemplate(w), "같은 사람에게 여러 번: 3주 동안 5번, 모두 147만 원이 나갔어요.");
});

test("시나리오 D 21주 카드(큰 지출, 카드 결제)", () => {
  const w = mkWeek({ week: 21, level: "watch", pattern: "big_spend", facts: FACTS_D21, fired: ["S1"] });
  const c = askCard(w, "하늘");
  assert.equal(c.title, "평소보다 큰 돈이 나갔어요");
  assert.deepEqual(c.lines, ["푸른가전에서 129만 원을 썼어요.", "평소 한 번에 쓰는 돈보다 훨씬 커요."]);
  assert.equal(c.question, "이 결제, 하늘 님이 하고 싶어서 한 거예요?");
  assert.equal(c.footer, "결제는 막지 않아요.");
});

test("계약: 제목 ≤14·줄 ≤32·ask 2줄·explain 3줄·요약 ≤90·물음표 없음 (극단값 포함 전 조합)", () => {
  const ws = weeksFor();
  let n = 0;
  for (const w of ws) for (const name of NAMES) {
    const { a, e, sum } = allTexts(w, name);
    assert.ok(a.title.length <= MAX_TITLE, `title ${a.title}`);
    assert.equal(a.lines.length, 2);
    for (const l of a.lines) assert.ok(l.length <= MAX_LINE, `ask line ${l.length}: ${l}`);
    assert.equal(e.lines.length, 3);
    for (const l of e.lines) assert.ok(l.length <= MAX_LINE, `explain line ${l.length}: ${l}`);
    assert.ok(sum.length <= MAX_SUMMARY, `summary ${sum}`);
    assert.ok(!sum.includes("?"), `summary ? ${sum}`);
    const hn = helperNoteFacts(w);
    assert.ok(Object.keys(hn.items).length <= 8);
    for (const v of Object.values(hn.items)) assert.ok(v.length <= 30);
    n++;
  }
  assert.ok(n > 1000, `조합 수 ${n}`);
});

test("금지: %·소수점·「배」·금지어·의도 단정 0개, 문장 끝 「요.」「요?」", () => {
  for (const w of weeksFor()) for (const name of NAMES) {
    const { a, e, sum, help, alert } = allTexts(w, name);
    const sentences = [...a.lines, a.question, a.footer, ...e.lines, sum, ...help.body, ...alert.body];
    const all = [a.title, ...sentences, help.head, alert.head];
    for (const s of all) {
      assert.ok(!s.includes("%"), `% ${s}`);
      assert.ok(!NO_DECIMAL.test(s), `decimal ${s}`);
      assert.ok(!s.includes("배"), `배 ${s}`);
      assert.deepEqual(findBanned(s), [], `banned ${s}`);
    }
    // 의도 단정: 「도움 요청」 머리(본인이 직접 청하는 것)는 상대 의도가 아니므로 제외
    for (const s of [a.title, ...sentences, alert.head]) assert.deepEqual(findIntent(s), [], `intent ${s}`);
    for (const s of sentences) {
      for (const part of s.split(/(?<=[.?])\s+/u)) assert.ok(SENT_END.test(part), `end ${part}`);
    }
  }
});

test("alertMessage·helpRequestMessage 문구(§7-5 ⑦)", () => {
  const m = alertMessage("요약이에요.", "someone_told", "민수");
  assert.equal(m.head, "민수 님이 보낸 알림");
  assert.deepEqual(m.body, ["요약이에요.", "민수 님은 '누가 하라고 했어요'라고 답했어요.", "민수 님이 알려도 된다고 했어요."]);
  assert.equal(alertMessage("x", null, "민수").body[1], "민수 님은 아직 답하지 않았어요.");
  assert.equal(alertMessage("x", null, "민수", { predelegated: true }).body[2], "민수 님이 미리 정해 둔 대로 보내요.");
  const w = mkWeek({ week: 20, level: "watch", pattern: "micro_repeat", facts: { micro_count: 9 } });
  const h = helpRequestMessage(w, "민수");
  assert.equal(h.head, "민수 님의 도움 요청");
  assert.deepEqual(h.body, ["민수 님이 '작은 결제가 많음' 일로 도움을 청했어요.", "민수 님에게 연락해 주세요."]);
});
