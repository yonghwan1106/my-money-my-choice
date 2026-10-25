// L4 지원의사결정 규칙 (구현명세 §6-1·§6-2, 설계서 §4-6 규칙 번호) — 순수 함수.
// 입력(flow·mem·settings)을 바꾸지 않고 새 객체를 돌려준다.
// 거래를 멈추게 하는 상태·함수는 만들지 않는다. 자동 알림은 사전 위임(규칙 17) 말고는 없다.
import type {
  Answer, Helper, HelperId, PolicyMemory, Settings, Step, UnderstandLabel, UserInput, WeekResult,
} from "./types";
import { askCard, explainCard } from "./templates";

export type RelationReply = "no" | "yes" | "dont_know";

export interface FlowCtx {
  answer: Answer | null;
  threat: boolean;
  effLevel: "watch" | "high";
  involved: HelperId[];
  identifiedOther: boolean;
  explained: boolean;
  notified: HelperId[];
  relationAsked: Partial<Record<HelperId, RelationReply>>;
  counselShown: boolean;
  // --- 진행 표시(흐름 안에서만) ---
  whoDone: boolean;
  involvedNoticeDone: boolean;
  candidates: HelperId[] | null;     // 단계 d에서 한 번 계산
  relQueue: HelperId[];              // 단계 e에서 물어볼 조력자
  relPurpose: "candidate" | "predelegate" | null;
  relTarget: HelperId | null;
  notifyDone: boolean;
  predelegateDone: boolean;
  predelegatedTo: HelperId | null;
  counselDone: boolean;
  previewKind: "alert" | "help_request" | null;
  reask: boolean;                    // 다시 묻기 흐름
}

export interface Flow { eventId: string; week: WeekResult; step: Step; ctx: FlowCtx; }

// ---------- 보조 정의(§6-1) ----------
export function key(w: WeekResult): string {
  return w.cpKeys.length ? "cp:" + [...w.cpKeys].sort().join(",") : "pt:" + w.pattern;
}
export function cleared(h: Helper, w: WeekResult): boolean {
  return w.hasCp && (h.link.state === "not_in_list" || (h.link.state === "linked" && !w.cpKeys.includes(h.link.cpKey)));
}
export function linkedInvolved(s: Settings, w: WeekResult): HelperId[] {
  return s.helpers.filter((h) => h.link.state === "linked" && w.cpKeys.includes(h.link.cpKey)).map((h) => h.id);
}
export function map(label: UnderstandLabel): Answer | null {
  switch (label) {
    case "my_choice": return "my_choice";
    case "asked_by_someone": return "someone_told";
    case "threatened": return "someone_told";
    case "not_sure": return "not_sure";
    case "unclear": return null;
  }
}

const SUPPRESS_DAYS = 28;
const COUNSEL_DAYS = 28;
const REPEAT_WINDOW_WEEKS = 7; // w.week − 7 ≤ week ≤ w.week (8주)
const REPEAT_MIN = 3;

const cloneMem = (m: PolicyMemory): PolicyMemory => ({
  day: m.day,
  highWeeks: m.highWeeks.map((h) => ({ week: h.week, pattern: h.pattern, cpKeys: [...h.cpKeys] })),
  suppress: m.suppress.map((x) => ({ ...x })),
  counselOffered: m.counselOffered.map((x) => ({ ...x })),
  reasks: m.reasks.map((r) => ({ ...r, helperIds: [...r.helperIds] })),
  tray: [...m.tray],
});
const cloneCtx = (c: FlowCtx): FlowCtx => ({
  ...c,
  involved: [...c.involved],
  notified: [...c.notified],
  relationAsked: { ...c.relationAsked },
  candidates: c.candidates ? [...c.candidates] : null,
  relQueue: [...c.relQueue],
});

export function newMemory(): PolicyMemory {
  return { day: 0, highWeeks: [], suppress: [], counselOffered: [], reasks: [], tray: [] };
}

/** 주마다 먼저 호출 — 모델 단계가 high면 답과 상관없이 highWeeks에 넣는다(규칙 3의 「반복 횟수 계산은 계속」). */
export function recordWeek(mem: PolicyMemory, w: WeekResult): PolicyMemory {
  const m = cloneMem(mem);
  m.day = w.weekStartDay + 6;
  if (w.level === "high") {
    m.highWeeks = m.highWeeks.filter((h) => h.week !== w.week);
    m.highWeeks.push({ week: w.week, pattern: w.pattern, cpKeys: [...w.cpKeys] });
    m.highWeeks.sort((a, b) => a.week - b.week);
  }
  return m;
}

/** 최근 8주(현재 주 포함) 안 같은 상대방 또는 같은 수법의 high 주 수. */
export function repeatCount(mem: PolicyMemory, w: WeekResult): number {
  return mem.highWeeks.filter((h) => {
    if (h.week < w.week - REPEAT_WINDOW_WEEKS || h.week > w.week) return false;
    const overlap = h.cpKeys.some((k) => w.cpKeys.includes(k));
    const samePattern = w.pattern !== null && h.pattern === w.pattern;
    return overlap || samePattern;
  }).length;
}

function freshCtx(w: WeekResult, s: Settings): FlowCtx {
  return {
    answer: null, threat: false, effLevel: w.level === "high" ? "high" : "watch",
    involved: linkedInvolved(s, w), identifiedOther: false, explained: false, notified: [], relationAsked: {},
    counselShown: false,
    whoDone: false, involvedNoticeDone: false, candidates: null, relQueue: [], relPurpose: null, relTarget: null,
    notifyDone: false, predelegateDone: false, predelegatedTo: null, counselDone: false, previewKind: null, reask: false,
  };
}

export function startEvent(w: WeekResult, s: Settings, mem: PolicyMemory): Flow {
  const eventId = `w${w.week}`;
  const ctx = freshCtx(w, s);
  if (w.level === "insufficient") return { eventId, week: w, step: { kind: "no_card", reason: "insufficient" }, ctx }; // [1]
  if (w.level === "normal") return { eventId, week: w, step: { kind: "no_card", reason: "normal" }, ctx };              // [2]
  if (w.level === "watch") {
    const k = key(w);
    if (mem.suppress.some((x) => x.key === k && x.untilDay >= mem.day)) {
      return { eventId, week: w, step: { kind: "no_card", reason: "suppressed" }, ctx };                               // [3]
    }
  }
  return { eventId, week: w, step: { kind: "ask", card: askCard(w, s.displayName) }, ctx };
}

// ---------- 흐름 ----------
type Out = { flow: Flow; mem: PolicyMemory };
const helperById = (s: Settings, id: HelperId) => s.helpers.find((h) => h.id === id);

function at(flow: Flow, ctx: FlowCtx, step: Step, mem: PolicyMemory): Out {
  return { flow: { eventId: flow.eventId, week: flow.week, step, ctx }, mem };
}

/** 답을 받은 뒤 갈래(ROUTE). */
function route(flow: Flow, ctx: FlowCtx, s: Settings, mem: PolicyMemory): Out {
  const w = flow.week;
  if (ctx.effLevel === "watch") {
    if (ctx.answer === "my_choice") {                                                                                  // [4]
      const k = key(w);
      mem.suppress = mem.suppress.filter((x) => x.key !== k);
      mem.suppress.push({ key: k, untilDay: mem.day + SUPPRESS_DAYS });
      return at(flow, ctx, { kind: "done" }, mem);
    }
    if (ctx.answer === "not_sure") {                                                                                   // [5]
      ctx.explained = true;
      return at(flow, ctx, { kind: "explain", card: explainCard(w, s.displayName) }, mem);
    }
    ctx.effLevel = "high";                                                                                             // [6]
  }
  return high(flow, ctx, s, mem);                                                                                      // [7]
}

/** HIGH 단계 a~i를 진행 표시에 따라 이어서 돈다. */
function high(flow: Flow, ctx: FlowCtx, s: Settings, mem: PolicyMemory): Out {
  const w = flow.week;
  // a. 누구예요? [9]
  if (!ctx.whoDone && ctx.answer === "someone_told" && ctx.involved.length === 0) {
    ctx.whoDone = true;
    return at(flow, ctx, { kind: "who", helperIds: s.helpers.map((h) => h.id) }, mem);
  }
  ctx.whoDone = true;
  // b. 잘 모르겠어요 → 설명
  if (ctx.answer === "not_sure" && !ctx.explained) {
    ctx.explained = true;
    return at(flow, ctx, { kind: "explain", card: explainCard(w, s.displayName) }, mem);
  }
  // c. 관련자 안내 [8]
  if (!ctx.involvedNoticeDone && ctx.involved.length > 0) {
    ctx.involvedNoticeDone = true;
    return at(flow, ctx, { kind: "involved_notice", helperIds: [...ctx.involved] }, mem);
  }
  ctx.involvedNoticeDone = true;
  // d. 후보 [20]
  if (ctx.candidates === null) {
    ctx.candidates = s.helpers
      .filter((h) => h.scope === "high_only" && !(w.pattern && h.excludePatterns.includes(w.pattern)) && !ctx.involved.includes(h.id))
      .map((h) => h.id);
    // e. 관련자 확인 대상 [10]
    ctx.relQueue = ctx.identifiedOther
      ? []
      : ctx.candidates.filter((id) => { const h = helperById(s, id); return h ? !cleared(h, w) : false; });
  }
  // e. 관련자 확인 — 한 명씩
  while (ctx.relQueue.length > 0) {
    const id = ctx.relQueue[0];
    if (ctx.relationAsked[id] !== undefined) { ctx.relQueue.shift(); continue; }
    ctx.relPurpose = "candidate";
    ctx.relTarget = id;
    return at(flow, ctx, { kind: "relation_check", helperId: id }, mem);
  }
  // f. 알림 고르기 [11·12·13]
  if (!ctx.notifyDone) {
    ctx.notifyDone = true;
    const cands = ctx.candidates ?? [];
    if (cands.length === 0) {
      ctx.counselShown = true;
      return at(flow, ctx, { kind: "counsel_offer", reason: "no_helper" }, mem);
    }
    return at(flow, ctx, {
      kind: "notify_choice", helperIds: [...cands], multi: cands.length >= 2, also: ctx.answer === "my_choice",
    }, mem);
  }
  // g. 사전 위임 [17·18]
  if (!ctx.predelegateDone) {
    ctx.predelegateDone = true;
    const d = s.predelegate.helperId;
    const dh = d ? helperById(s, d) : undefined;
    if (s.predelegate.enabled && d && dh && repeatCount(mem, w) >= REPEAT_MIN
      && !ctx.notified.includes(d) && !ctx.involved.includes(d)) {
      if (cleared(dh, w) || ctx.relationAsked[d] === "no") {
        ctx.notified.push(d);
        ctx.predelegatedTo = d;
        return at(flow, ctx, { kind: "predelegated_sent", helperId: d }, mem);
      }
      if (ctx.relationAsked[d] === undefined) {
        ctx.relPurpose = "predelegate";
        ctx.relTarget = d;
        return at(flow, ctx, { kind: "relation_check", helperId: d }, mem);
      }
    }
  }
  // h. 상담 [15·16]
  if (!ctx.counselDone) {
    ctx.counselDone = true;
    const k = key(w);
    const recent = mem.counselOffered.some((c) => c.key === k && mem.day - c.day < COUNSEL_DAYS);
    if (!ctx.counselShown && (ctx.threat || repeatCount(mem, w) >= REPEAT_MIN) && !recent) {
      ctx.counselShown = true;
      mem.counselOffered.push({ key: k, day: mem.day });
      return at(flow, ctx, { kind: "counsel_offer", reason: ctx.threat ? "threat" : "repeat" }, mem);
    }
  }
  // i.
  return at(flow, ctx, { kind: "done" }, mem);
}

export function next(flow: Flow, input: UserInput, s: Settings, memIn: PolicyMemory): Out {
  const mem = cloneMem(memIn);
  const ctx = cloneCtx(flow.ctx);
  const st = flow.step;
  const w = flow.week;
  const stay = (): Out => ({ flow: { ...flow, ctx: cloneCtx(flow.ctx) }, mem });

  switch (st.kind) {
    case "ask": {
      if (input.type === "later") {                                                                                     // [19]
        if (!mem.tray.includes(flow.eventId)) mem.tray.push(flow.eventId);
        return at(flow, ctx, { kind: "later_ack" }, mem);
      }
      if (input.type === "answer") { ctx.answer = input.answer; return route(flow, ctx, s, mem); }
      if (input.type === "understood") {
        return at(flow, ctx, {
          kind: "understand_confirm", label: input.label, mapped: map(input.label), evidence: input.evidence, mode: input.mode,
        }, mem);
      }
      return stay();
    }
    case "understand_confirm": {
      if (input.type !== "understand_reply") return stay();
      if (input.ok && st.mapped) {
        ctx.answer = st.mapped;
        if (st.label === "threatened") ctx.threat = true;
        return route(flow, ctx, s, mem);
      }
      return at(flow, ctx, { kind: "ask", card: askCard(w, s.displayName) }, mem);
    }
    case "who": {
      if (input.type !== "who") return stay();
      if (input.pick === "other") ctx.identifiedOther = true;
      else if (input.pick !== "no_say" && !ctx.involved.includes(input.pick)) ctx.involved.push(input.pick);
      return high(flow, ctx, s, mem);
    }
    case "explain": {
      if (input.type !== "continue") return stay();
      if (ctx.effLevel === "watch") return at(flow, ctx, { kind: "help_offer" }, mem);
      return high(flow, ctx, s, mem);
    }
    case "help_offer": {
      if (input.type !== "help") return stay();
      if (!input.want) return at(flow, ctx, { kind: "done" }, mem);
      const ids = s.helpers.map((h) => h.id).filter((id) => !ctx.involved.includes(id));                               // 범위 무관
      if (ids.length === 0) return at(flow, ctx, { kind: "done" }, mem);
      return at(flow, ctx, { kind: "help_pick", helperIds: ids }, mem);
    }
    case "help_pick": {
      if (input.type !== "help_pick") return stay();
      const pick = input.pick.filter((id) => st.helperIds.includes(id));
      if (pick.length === 0) return at(flow, ctx, { kind: "done" }, mem);
      ctx.previewKind = "help_request";
      return at(flow, ctx, { kind: "preview", messages: pick.map((helperId) => ({ helperId, type: "help_request" as const })) }, mem);
    }
    case "involved_notice": {
      if (input.type !== "continue") return stay();
      return high(flow, ctx, s, mem);
    }
    case "relation_check": {
      if (input.type !== "relation") return stay();
      const id = st.helperId;
      ctx.relationAsked[id] = input.reply;
      if (ctx.relPurpose === "predelegate") {                                                                          // [18]
        ctx.relPurpose = null; ctx.relTarget = null;
        if (input.reply === "no") {
          ctx.notified.push(id);
          ctx.predelegatedTo = id;
          return at(flow, ctx, { kind: "predelegated_sent", helperId: id }, mem);
        }
        if (!ctx.involved.includes(id)) ctx.involved.push(id);
        return high(flow, ctx, s, mem);
      }
      ctx.relPurpose = null; ctx.relTarget = null;
      ctx.relQueue = ctx.relQueue.filter((x) => x !== id);
      if (input.reply === "yes" || input.reply === "dont_know") {                                                      // [10]
        if (!ctx.involved.includes(id)) ctx.involved.push(id);
        ctx.candidates = (ctx.candidates ?? []).filter((x) => x !== id);
        return at(flow, ctx, { kind: "involved_notice", helperIds: [id] }, mem);
      }
      return high(flow, ctx, s, mem);
    }
    case "notify_choice": {
      if (input.type !== "notify") return stay();
      const pick = input.pick.filter((id) => st.helperIds.includes(id));
      if (pick.length > 0) {
        ctx.notified = [...pick];
        ctx.previewKind = "alert";
        return at(flow, ctx, { kind: "preview", messages: pick.map((helperId) => ({ helperId, type: "alert" as const })) }, mem);
      }
      const atDay = mem.day + 1;                                                                                       // [14]
      mem.reasks.push({ eventId: flow.eventId, atDay, helperIds: [...st.helperIds], used: false });
      return at(flow, ctx, { kind: "decline_ack", reaskDay: atDay }, mem);
    }
    case "preview": {
      if (input.type !== "continue") return stay();
      if (ctx.reask || ctx.previewKind === "help_request") return at(flow, ctx, { kind: "done" }, mem);
      return high(flow, ctx, s, mem);
    }
    case "decline_ack":
    case "predelegated_sent": {
      if (input.type !== "continue") return stay();
      return high(flow, ctx, s, mem);
    }
    case "counsel_offer": {
      if (input.type !== "counsel") return stay();
      if (input.yes) return at(flow, ctx, { kind: "counsel_info" }, mem);
      return high(flow, ctx, s, mem);
    }
    case "counsel_info": {
      if (input.type !== "continue") return stay();
      return high(flow, ctx, s, mem);
    }
    case "reask": {
      if (input.type !== "notify") return stay();
      mem.reasks = mem.reasks.map((r) => (r.eventId === flow.eventId && !r.used ? { ...r, used: true } : r));
      const pick = input.pick.filter((id) => st.helperIds.includes(id));
      if (pick.length === 0) return at(flow, ctx, { kind: "done" }, mem);
      ctx.notified = [...pick];
      ctx.previewKind = "alert";
      return at(flow, ctx, { kind: "preview", messages: pick.map((helperId) => ({ helperId, type: "alert" as const })) }, mem);
    }
    case "later_ack": {
      if (input.type !== "continue") return stay();
      return at(flow, ctx, { kind: "done" }, mem);
    }
    case "no_card":
    case "done":
    default:
      return stay();
  }
}

/** 하루 뒤 다시 묻기(규칙 14) — atDay ≤ day이고 아직 안 쓴 것. */
export function dueReasks(mem: PolicyMemory, day: number, s: Settings, weeks: WeekResult[]): Flow[] {
  const out: Flow[] = [];
  for (const r of mem.reasks) {
    if (r.used || r.atDay > day) continue;
    const w = weeks.find((x) => `w${x.week}` === r.eventId);
    if (!w) continue;
    const ctx = freshCtx(w, s);
    ctx.reask = true;
    ctx.effLevel = "high";
    ctx.whoDone = true; ctx.involvedNoticeDone = true; ctx.notifyDone = true;
    ctx.predelegateDone = true; ctx.counselDone = true;
    ctx.candidates = [...r.helperIds];
    out.push({ eventId: r.eventId, week: w, step: { kind: "reask", helperIds: [...r.helperIds] }, ctx });
  }
  return out;
}

