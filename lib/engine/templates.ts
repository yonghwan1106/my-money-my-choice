// 카드 문안 (구현명세 §6-4·§7-9) — 검수한 고정 문장에 숫자만 채운다.
// 언어모델은 이 파일의 문장을 만들거나 고치지 않는다.
import type {
  Answer, AskCard, ExplainCard, Facts, HelperNoteFacts, PatternId, Picture, UnderstandLabel, WeekResult,
} from "./types";
import { count, incomeWord, krw, period, within } from "./format";

export const MAX_TITLE = 14;
export const MAX_LINE = 32;
export const MAX_SUMMARY = 90;

type Family = "transfer" | "cash" | "loan" | "phone" | "payment" | "salary_cut";

const QUESTION: Record<Family, string> = {
  transfer: "이 돈, {이름} 님이 주고 싶어서 보낸 거예요?",
  cash: "이 돈, {이름} 님이 쓰려고 찾은 거예요?",
  loan: "이 대출, {이름} 님이 받고 싶어서 받은 거예요?",
  phone: "이 휴대폰, {이름} 님이 만들고 싶어서 만든 거예요?",
  payment: "이 결제, {이름} 님이 하고 싶어서 한 거예요?",
  salary_cut: "이번 월급, {이름} 님이 안 받기로 한 거예요?",
};
const FOOTER: Record<Family, string> = {
  transfer: "돈 보내기는 막지 않아요.",
  cash: "돈 찾기는 막지 않아요.",
  loan: "대출은 막지 않아요.",
  phone: "휴대폰 요금은 막지 않아요.",
  payment: "결제는 막지 않아요.",
  salary_cut: "{이름} 님이 정해요.",
};

const PICTURE: Record<PatternId, Picture> = {
  same_person: "money_send",
  after_income: "salary",
  loan_passthrough: "loan",
  new_phone_bills: "phone",
  salary_cut: "salary_cut",
  micro_repeat: "card_pay",
  slow_leak: "leak",
  big_spend: "big",
};

export const ALL_PATTERNS: PatternId[] = [
  "same_person", "after_income", "loan_passthrough", "new_phone_bills",
  "salary_cut", "micro_repeat", "slow_leak", "big_spend",
];

/** 버튼 문구(§7-5). */
export const ANSWER_WORD: Record<Answer, string> = {
  my_choice: "내가 하고 싶어서 했어요",
  not_sure: "잘 모르겠어요",
  someone_told: "누가 하라고 했어요",
};
export function labelWord(label: UnderstandLabel): string | null {
  if (label === "my_choice") return ANSWER_WORD.my_choice;
  if (label === "asked_by_someone" || label === "threatened") return ANSWER_WORD.someone_told;
  if (label === "not_sure") return ANSWER_WORD.not_sure;
  return null;
}

export const LEVEL_LABEL = { watch: "살펴보기", high: "위험이 높아요" } as const;

/** 수법 이름(도움 요청·요약·설정에 씀). */
export function patternName(p: PatternId, f: Facts = {}): string {
  switch (p) {
    case "same_person": return count(f.cum_count) === 1 ? "처음 돈을 보낸 사람" : "같은 사람에게 여러 번";
    case "after_income": return "수입이 금방 나감";
    case "loan_passthrough": return "대출금이 바로 나감";
    case "new_phone_bills": return "새 휴대폰 요금";
    case "salary_cut": return "월급이 달라짐";
    case "micro_repeat": return "작은 결제가 많음";
    case "slow_leak": return "조금씩 계속 나감";
    case "big_spend": return "평소보다 큰 지출";
  }
}

/** 설정 화면의 「이럴 때는 알리지 않아요」 문구(§7-3 4). */
export const EXCLUDE_LABEL: Record<PatternId, string> = {
  same_person: "같은 사람에게 여러 번 보낼 때",
  after_income: "수입이 금방 나갈 때",
  loan_passthrough: "대출금이 바로 나갈 때",
  new_phone_bills: "새 휴대폰 요금이 생길 때",
  salary_cut: "월급이 달라질 때",
  micro_repeat: "소액결제가 많을 때",
  slow_leak: "돈이 조금씩 계속 나갈 때",
  big_spend: "큰 돈을 한 번에 쓸 때",
};

// ---------- 숫자 칸 ----------
const n0 = (x: number | undefined) => (Number.isFinite(x as number) ? (x as number) : 0);
const money = (x: number | undefined) => krw(n0(x));
const hoursWord = (f: Facts) => within(Number.isFinite(f.hours as number) ? (f.hours as number) : 999);
const income = (f: Facts) => incomeWord(f.income_kind ?? "salary");
/** 수입·대출 뒤 빠져나간 돈. S4·S5·S10 모두 out_after_income_krw를 쓴다(없으면 그 주 합). */
const outAfter = (f: Facts) => money(f.out_after_income_krw ?? f.week_total_krw);
const isNewCp = (f: Facts) => f.cp_is_new !== false;

function fill(s: string, name: string): string {
  return s.replace(/\{이름\}/g, name);
}
function fit(text: string, short?: string): string {
  return text.length > MAX_LINE && short ? short : text;
}

interface PatternText {
  family: Family;
  title: string;
  l1: string; l1short?: string;
  l2: string; l2short?: string;
  one: string; oneShort?: string;
  e1: string; e2: string;
  summary: string;
  items: Record<string, string>;
  period: string;
}

function familyOf(p: PatternId, f: Facts): Family {
  switch (p) {
    case "same_person": return "transfer";
    case "after_income": return f.out_mode === "cash" ? "cash" : "transfer";
    case "loan_passthrough": return "loan";
    case "new_phone_bills": return "phone";
    case "salary_cut": return f.salary_mode === "returned" ? "transfer" : "salary_cut";
    case "micro_repeat": return "payment";
    case "slow_leak": return f.leak_mode === "cash" ? "cash" : "transfer";
    case "big_spend":
      return f.big_category === "transfer" ? "transfer" : f.big_category === "cash" ? "cash" : "payment";
  }
}

function patternText(p: PatternId, f: Facts, w: WeekResult): PatternText {
  const fam = familyOf(p, f);
  switch (p) {
    case "same_person": {
      const N = count(f.cum_count);
      const per = period(n0(f.cum_weeks));
      const sum = money(f.cum_total_krw);
      const isNew = isNewCp(f);
      const many = N >= 2;
      const l1 = many
        ? (isNew ? `처음 돈을 보낸 사람에게 ${per} 동안 ${N}번 보냈어요.` : `같은 사람에게 ${per} 동안 ${N}번 보냈어요.`)
        : `처음 보낸 사람에게 ${sum}을 보냈어요.`;
      return {
        family: fam,
        title: many ? "같은 사람에게 여러 번" : "처음 돈을 보낸 사람",
        l1, l1short: many ? `같은 사람에게 ${N}번 보냈어요.` : "처음 돈을 보낸 사람에게 갔어요.",
        l2: `모두 ${sum}을 보냈어요.`,
        one: many ? l1 : "처음 돈을 보낸 사람에게 갔어요.",
        oneShort: many ? `같은 사람에게 ${N}번 보냈어요.` : undefined,
        e1: isNew ? "평소에는 이 사람에게 보낸 적이 없어요." : `평소에는 한 주에 ${count(f.usual_week_count)}번쯤 보냈어요.`,
        e2: `이번에는 ${per} 동안 ${sum}을 보냈어요.`,
        summary: `${patternName(p, f)}: ${per} 동안 ${N}번, 모두 ${sum}이 나갔어요.`,
        items: { "횟수": `${N}번`, "합계": sum },
        period: per,
      };
    }
    case "after_income": {
      const inc = income(f);
      const t = hoursWord(f);
      const inK = money(f.income_krw);
      const out = outAfter(f);
      return {
        family: fam,
        title: `${inc}이 금방 나갔어요`,
        l1: `${inc} ${inK}이 들어왔어요.`,
        l2: `${t} ${out}이 나갔어요.`,
        one: `${inc} ${inK} 중 ${out}이 ${t} 나갔어요.`,
        oneShort: `${inc} 대부분이 ${t} 나갔어요.`,
        e1: `평소에는 ${inc}이 여러 날에 걸쳐 나갔어요.`,
        e2: `이번에는 ${t} ${out}이 나갔어요.`,
        summary: `${inc} ${inK}이 들어오고 ${t} ${out}이 나갔어요.`,
        items: { "수입": `${inc} ${inK}`, "수입 뒤 나간 돈": out, "걸린 시간": t },
        period: "1주",
      };
    }
    case "loan_passthrough": {
      const t = hoursWord(f);
      const loan = money(f.loan_krw);
      const out = outAfter(f);
      const cash = f.out_mode === "cash";
      return {
        family: fam,
        title: "대출금이 바로 나갔어요",
        l1: `대출금 ${loan}이 들어왔어요.`,
        l2: cash ? `${t} ${out}을 현금으로 찾았어요.` : `${t} ${out}이 다른 사람에게 갔어요.`,
        one: `대출금 ${loan} 중 ${out}이 바로 나갔어요.`,
        oneShort: "대출금이 바로 나갔어요.",
        e1: "대출금은 {이름} 님이 갚아야 하는 돈이에요.",
        e2: `이번에는 ${t} ${out}이 나갔어요.`,
        summary: `대출금 ${loan}이 들어오고 ${t} ${out}이 나갔어요.`,
        items: { "대출": loan, "대출 뒤 나간 돈": out, "걸린 시간": t },
        period: "1주",
      };
    }
    case "new_phone_bills": {
      const B = count(f.new_bills);
      const U = count(f.usual_bills);
      return {
        family: fam,
        title: "새 휴대폰 요금이 여러 개",
        l1: `한 달 안에 새 요금이 ${B}개 생겼어요.`,
        l2: "요금은 매달 자동으로 나가요.",
        one: `새 휴대폰 요금이 ${B}개 생겼어요.`,
        e1: U === 0 ? "평소에는 휴대폰 요금이 없었어요." : `평소에는 휴대폰 요금이 ${U}개였어요.`,
        e2: `이번 달에 새 요금이 ${B}개 생겼어요.`,
        summary: `한 달 안에 새 휴대폰 요금이 ${B}개 생겼어요.`,
        items: { "새 요금": `${B}개`, "평소 요금": `${U}개` },
        period: "한 달",
      };
    }
    case "salary_cut": {
      const D = count(f.salary_day);
      const returned = f.salary_mode === "returned";
      const t = hoursWord(f);
      const inK = money(f.income_krw);
      const out = outAfter(f);
      return {
        family: fam,
        title: "월급이 달라졌어요",
        l1: returned ? `월급 ${inK}이 들어왔어요.` : `평소 ${D}일쯤 들어오던 월급이 안 들어왔어요.`,
        l2: returned ? `${t} ${out}이 월급 준 곳으로 갔어요.` : "이번 달 월급 기록이 없어요.",
        one: returned ? "월급이 들어오고 바로 다시 나갔어요." : "이번 달 월급이 안 들어왔어요.",
        e1: `평소에는 매달 ${D}일쯤 월급이 들어왔어요.`,
        e2: returned ? "이번에는 들어오자마자 다시 나갔어요." : `이번에는 ${D}일이 지나도 들어오지 않았어요.`,
        summary: "이번 달 월급이 평소와 달라졌어요.",
        items: returned
          ? { "월급": inK, "다시 나간 돈": out, "걸린 시간": t }
          : { "평소 월급날": `${D}일` },
        period: "한 달",
      };
    }
    case "micro_repeat": {
      const N = count(f.micro_count);
      const U = count(f.usual_micro_count);
      const sum = money(f.micro_total_krw);
      return {
        family: fam,
        title: "작은 결제가 아주 많아요",
        l1: `한 주에 작은 결제를 ${N}번 했어요.`,
        l2: `모두 ${sum}이에요.`,
        one: `한 주에 작은 결제를 ${N}번 했어요.`,
        e1: U === 0 ? "평소에는 작은 결제를 거의 안 했어요." : `평소에는 한 주에 ${U}번쯤 했어요.`,
        e2: `이번 주에는 ${N}번, ${sum}이에요.`,
        summary: `한 주에 작은 결제가 ${N}번, 모두 ${sum}이었어요.`,
        items: { "횟수": `${N}번`, "합계": sum },
        period: "1주",
      };
    }
    case "slow_leak": {
      const W = count(f.leak_weeks);
      const ex = money(f.leak_excess_krw);
      return {
        family: fam,
        title: "돈이 조금씩 계속 나가요",
        l1: `${W}주째 평소보다 돈이 더 나가요.`,
        l2: `${W}주 동안 평소보다 ${ex}이 더 나갔어요.`,
        one: `${W}주째 평소보다 돈이 더 나가요.`,
        e1: `평소에는 한 주에 ${money(f.usual_week_krw)}쯤 나갔어요.`,
        e2: `요즘은 한 주에 ${money(f.week_total_krw ?? w.outflow_krw)}쯤 나가요.`,
        summary: `${W}주 동안 평소보다 ${ex}이 더 나갔어요.`,
        items: { "이어진 기간": `${W}주`, "더 나간 돈": ex },
        period: period(W),
      };
    }
    case "big_spend": {
      const amt = money(f.big_krw);
      const cat = f.big_category ?? "card";
      const s1 = w.signals?.find((s) => s.id === "S1")?.fired ?? false;
      const s9 = w.signals?.find((s) => s.id === "S9")?.fired ?? false;
      const lowBalance = !s1 && (s9 || f.balance_low === true);
      const l1 = cat === "transfer"
        ? `한 번에 ${amt}을 보냈어요.`
        : cat === "cash"
          ? `한 번에 현금 ${amt}을 찾았어요.`
          : f.big_place ? `${f.big_place}에서 ${amt}을 썼어요.` : `카드로 ${amt}을 썼어요.`;
      return {
        family: fam,
        title: "평소보다 큰 돈이 나갔어요",
        l1, l1short: cat === "card" ? `카드로 ${amt}을 썼어요.` : undefined,
        l2: lowBalance ? "통장에 남은 돈이 평소보다 아주 적어요." : "평소 한 번에 쓰는 돈보다 훨씬 커요.",
        one: `평소보다 큰 돈 ${amt}이 나갔어요.`,
        e1: `평소에는 한 번에 ${money(f.usual_big_krw)}쯤 썼어요.`,
        e2: `이번에는 한 번에 ${amt}을 썼어요.`,
        summary: `한 번에 ${amt}이 나갔어요. 평소보다 훨씬 큰 돈이에요.`,
        items: { "금액": amt, "평소 한 번": money(f.usual_big_krw) },
        period: "1주",
      };
    }
  }
}

/** 수법이 없을 때(계약상 watch·high에는 늘 있으나 방어용). */
function fallbackText(w: WeekResult): PatternText {
  const out = krw(w.outflow_krw);
  return {
    family: "transfer",
    title: "평소와 다른 돈 흐름",
    l1: "평소와 다른 돈 흐름이 있었어요.",
    l2: `이번 주에 ${out}이 나갔어요.`,
    one: "평소와 다른 돈 흐름이 있었어요.",
    e1: "평소와 다른 점이 보였어요.",
    e2: `이번 주에 ${out}이 나갔어요.`,
    summary: `이번 주에 ${out}이 나갔어요.`,
    items: { "나간 돈": out },
    period: "1주",
  };
}

function textFor(w: WeekResult, p: PatternId | null): PatternText {
  return p ? patternText(p, w.facts ?? {}, w) : fallbackText(w);
}

export function askCard(w: WeekResult, name: string): AskCard {
  const first = textFor(w, w.pattern);
  const second = w.pattern && w.pattern2 && w.pattern2 !== w.pattern ? textFor(w, w.pattern2) : null;
  const lines: [string, string] = second
    ? [fit(first.one, first.oneShort), fit(second.one, second.oneShort)]
    : [fit(first.l1, first.l1short), fit(first.l2, first.l2short)];
  return {
    kind: "ask",
    eventId: `w${w.week}`,
    picture: w.pattern ? PICTURE[w.pattern] : "question",
    title: first.title,
    lines: [fill(lines[0], name), fill(lines[1], name)],
    question: fill(QUESTION[first.family], name),
    footer: fill(FOOTER[first.family], name),
  };
}

export function explainCard(w: WeekResult, name: string): ExplainCard {
  const t = textFor(w, w.pattern);
  return {
    kind: "explain",
    picture: w.pattern ? PICTURE[w.pattern] : "question",
    lines: [fill(t.e1, name), fill(t.e2, name), fill("막지 않아요. {이름} 님이 정해요.", name)],
  };
}

/** 언어모델·고정 문안 공통 입력. 숫자는 모두 서식한 문자열. */
export function helperNoteFacts(w: WeekResult): HelperNoteFacts {
  const first = textFor(w, w.pattern);
  const items: Record<string, string> = { ...first.items };
  if (w.pattern && w.pattern2 && w.pattern2 !== w.pattern) {
    const second = textFor(w, w.pattern2);
    for (const [k, v] of Object.entries(second.items)) {
      if (Object.keys(items).length >= 8) break;
      items[k in items ? `${k}(2)` : k] = v;
    }
  }
  return {
    pattern_label: w.pattern ? patternName(w.pattern, w.facts ?? {}) : "평소와 다른 돈 흐름",
    level_label: w.level === "high" ? LEVEL_LABEL.high : LEVEL_LABEL.watch,
    period: first.period,
    items,
  };
}

/** 언어모델 실패 시 요약(≤90자, 물음표 없음). */
export function helperNoteTemplate(w: WeekResult): string {
  return textFor(w, w.pattern).summary;
}

export function alertMessage(
  summary: string, answer: Answer | null, name: string, opts: { predelegated?: boolean } = {},
): { head: string; body: string[] } {
  return {
    head: `${name} 님이 보낸 알림`,
    body: [
      summary,
      answer ? `${name} 님은 '${ANSWER_WORD[answer]}'라고 답했어요.` : `${name} 님은 아직 답하지 않았어요.`,
      opts.predelegated ? `${name} 님이 미리 정해 둔 대로 보내요.` : `${name} 님이 알려도 된다고 했어요.`,
    ],
  };
}

export function helpRequestMessage(w: WeekResult, name: string): { head: string; body: string[] } {
  const pn = w.pattern ? patternName(w.pattern, w.facts ?? {}) : "평소와 다른 돈 흐름";
  return {
    head: `${name} 님의 도움 요청`,
    body: [`${name} 님이 '${pn}' 일로 도움을 청했어요.`, `${name} 님에게 연락해 주세요.`],
  };
}
