// 시연 답 경로(구현명세 §4-3) — 단계마다 어떤 입력을 넣는지. precompute.ts(script 필드)와 tests/policy.test.ts(P-29)가 같이 쓴다.
// 단계 종류로 입력을 고르므로, 실제 모델 단계가 기대와 달라도 「그 주의 실제 level로 규칙표를 따른」 흐름이 나온다.
import type { HelperId, Settings, Step, UserInput, WeekResult } from "../../lib/engine/types";
import { newMemory, next, recordWeek, startEvent, type Flow } from "../../lib/engine/policy";
import type { PolicyMemory } from "../../lib/engine/types";

export type ScenarioId = "A" | "B" | "C" | "D";

/** §7-5 ⑤-1 예시 칩 문장(이름 없는 문장 그대로). */
export const CHIP: Record<ScenarioId, string> = {
  A: "형이 급하다고 빌려 달래서 보냈어요",
  B: "선생님이 달라고 했어요",
  C: "잘 모르겠어요 그냥 보냈어요",
  D: "냉장고가 고장 나서 내가 샀어요",
};

/** 시연에서 카드를 여는 주(각본 기대값). 실제 분석에서 그 주가 카드가 없으면 첫 high 주(없으면 첫 watch 주)를 쓴다. */
export const DEMO_WEEK: Record<ScenarioId, number> = { A: 20, B: 16, C: 19, D: 21 };

export interface Responder { (step: Step, s: Settings): UserInput | null }

const findAlias = (s: Settings, word: string): HelperId | undefined => s.helpers.find((h) => h.alias.includes(word))?.id;

export function responder(id: ScenarioId, understood?: UserInput): Responder {
  return (step, s) => {
    switch (step.kind) {
      case "ask":
        if (id === "A") return understood ?? { type: "understood", label: "asked_by_someone", evidence: "빌려 달래서", mode: "precomputed" };
        if (id === "B") return { type: "answer", answer: "someone_told" };
        if (id === "C") return { type: "answer", answer: "not_sure" };
        return { type: "answer", answer: "my_choice" };
      case "understand_confirm": return { type: "understand_reply", ok: true };
      case "who": return { type: "who", pick: "other" };
      case "relation_check": return { type: "relation", reply: "no" };
      case "notify_choice": {
        if (id === "A") { const h2 = findAlias(s, "이수진"); return { type: "notify", pick: h2 && step.helperIds.includes(h2) ? [h2] : [step.helperIds[0]] }; }
        return { type: "notify", pick: [step.helperIds[0]] };
      }
      case "help_offer": return { type: "help", want: false };
      case "help_pick": return { type: "help_pick", pick: [] };
      case "counsel_offer": return { type: "counsel", yes: true };
      case "reask": return { type: "notify", pick: [] };
      case "explain": case "involved_notice": case "preview": case "decline_ack": case "predelegated_sent":
      case "counsel_info": case "later_ack":
        return { type: "continue" };
      default: return null;
    }
  };
}

export interface RunStep { step: Step; input: UserInput | null }

/** 한 흐름을 끝(done·no_card)까지 돌린다. */
export function runFlow(flow: Flow, s: Settings, mem: PolicyMemory, r: Responder, maxSteps = 40): { steps: RunStep[]; mem: PolicyMemory; flow: Flow } {
  const steps: RunStep[] = [];
  let f = flow; let m = mem;
  for (let i = 0; i < maxSteps; i++) {
    const kind = f.step.kind;
    if (kind === "done" || kind === "no_card") { steps.push({ step: f.step, input: null }); break; }
    const input = r(f.step, s);
    steps.push({ step: f.step, input });
    if (!input) break;
    const o = next(f, input, s, m);
    f = o.flow; m = o.mem;
  }
  return { steps, mem: m, flow: f };
}

/** 카드를 열 주를 고른다: 기대 주가 watch·high면 그 주, 아니면 첫 high, 그것도 없으면 첫 watch. */
export function pickDemoWeek(id: ScenarioId, weeks: WeekResult[]): WeekResult | null {
  const want = weeks.find((w) => w.week === DEMO_WEEK[id]);
  if (want && (want.level === "watch" || want.level === "high")) return want;
  return weeks.find((w) => w.level === "high") ?? weeks.find((w) => w.level === "watch") ?? null;
}

/** 재생처럼 1주부터 그 주까지 recordWeek를 돌린 뒤 그 주 흐름을 시연 경로로 끝까지 간다. */
export function runDemo(id: ScenarioId, weeks: WeekResult[], s: Settings, r: Responder = responder(id)) {
  const target = pickDemoWeek(id, weeks);
  if (!target) return { week: null as number | null, steps: [] as RunStep[] };
  let mem = newMemory();
  for (const w of weeks) { if (w.week > target.week) break; mem = recordWeek(mem, w); }
  const flow = startEvent(target, s, mem);
  const { steps } = runFlow(flow, s, mem, r);
  return { week: target.week, steps };
}

/** 단계 순서를 §8-2 표기와 비슷한 짧은 문자열로. */
export function stepTrace(steps: RunStep[]): string[] {
  return steps.map(({ step }) => {
    switch (step.kind) {
      case "understand_confirm": return `understand_confirm(${step.label})`;
      case "who": return `who[${step.helperIds.join(",")}]`;
      case "notify_choice": return `notify_choice[${step.helperIds.join(",")}]${step.multi ? " multi" : " single"}`;
      case "preview": return `preview[${step.messages.map((m) => `${m.helperId} ${m.type}`).join(",")}]`;
      case "involved_notice": return `involved_notice[${step.helperIds.join(",")}]`;
      case "relation_check": return `relation_check(${step.helperId})`;
      case "counsel_offer": return `counsel_offer(${step.reason})`;
      case "no_card": return `no_card(${step.reason})`;
      default: return step.kind;
    }
  });
}
