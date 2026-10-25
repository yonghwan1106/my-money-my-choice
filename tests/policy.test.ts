// 지원의사결정 규칙 시험 P-01~P-29 (구현명세 §6-3). 시험 이름은 「P-xx」로 시작해야 policy_count.ts가 센다.
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import type { PolicyMemory, Settings, UserInput, WeekResult } from "../lib/engine/types";
import { dueReasks, newMemory, next, recordWeek, repeatCount, startEvent, type Flow } from "../lib/engine/policy";
import { DAY0, FACTS_A20, FACTS_B16, FACTS_C16, FACTS_C18, FACTS_C19, FACTS_D21, mkHelper, mkSettings, mkWeek } from "./_fixtures";
import { responder, runDemo, stepTrace, type ScenarioId } from "../scripts/lib/demo_paths";

// ---- 도우미 ----
function memUpTo(weeks: WeekResult[], upto: number, base: PolicyMemory = newMemory()): PolicyMemory {
  let m = base;
  for (const w of weeks) if (w.week <= upto) m = recordWeek(m, w);
  return m;
}
/** 입력을 차례로 넣고 단계 종류 목록을 돌려준다. */
function drive(flow: Flow, inputs: UserInput[], s: Settings, mem: PolicyMemory) {
  const kinds: string[] = [flow.step.kind];
  let f = flow; let m = mem;
  const steps = [f.step];
  for (const inp of inputs) {
    const o = next(f, inp, s, m);
    f = o.flow; m = o.mem;
    kinds.push(f.step.kind);
    steps.push(f.step);
  }
  return { kinds, flow: f, mem: m, steps };
}
const C: UserInput = { type: "continue" };
const ans = (a: "my_choice" | "not_sure" | "someone_told"): UserInput => ({ type: "answer", answer: a });

// 시나리오 A 설정(§4-3): h1 누나 linked cp_01, h2 이수진 선생님 not_in_list
const SA = mkSettings([
  mkHelper("h1", "누나", "family", { state: "linked", cpKey: "cp_01" }, { exclude: ["micro_repeat"] }),
  mkHelper("h2", "이수진 선생님", "center", { state: "not_in_list" }),
], "민수");
// 시나리오 B 설정: h1 김도현 선생님 linked cp_05(=상대방), h2 언니 not_in_list
const SB = mkSettings([
  mkHelper("h1", "김도현 선생님", "activity", { state: "linked", cpKey: "cp_05" }),
  mkHelper("h2", "언니", "family", { state: "not_in_list" }),
], "서연");
const SC = mkSettings([mkHelper("h1", "오지현 선생님", "center", { state: "not_in_list" })], "영호");
const SD = mkSettings([mkHelper("h1", "엄마", "family", { state: "linked", cpKey: "cp_02" })], "하늘");

const A18 = mkWeek({ week: 18, level: "watch", pattern: "same_person", facts: { ...FACTS_A20, cum_count: 2, cum_weeks: 1 }, cpKeys: ["cp_09"] });
const A19 = mkWeek({ week: 19, level: "watch", pattern: "same_person", facts: { ...FACTS_A20, cum_count: 4, cum_weeks: 2 }, cpKeys: ["cp_09"] });
const A20 = mkWeek({ week: 20, level: "high", pattern: "same_person", pattern2: "after_income", facts: FACTS_A20, cpKeys: ["cp_09"] });
const B16 = mkWeek({ week: 16, level: "high", pattern: "after_income", facts: FACTS_B16, cpKeys: ["cp_05"] });
const C16 = mkWeek({ week: 16, level: "high", pattern: "loan_passthrough", facts: FACTS_C16, cpKeys: ["cp_07"] });
const C17 = mkWeek({ week: 17, level: "high", pattern: "loan_passthrough", facts: FACTS_C16, cpKeys: ["cp_07"] });
const C18 = mkWeek({ week: 18, level: "high", pattern: "new_phone_bills", facts: FACTS_C18, cpKeys: [] });
const C19 = mkWeek({ week: 19, level: "high", pattern: "after_income", facts: FACTS_C19, cpKeys: ["cp_07"] });
const D21 = mkWeek({ week: 21, level: "watch", pattern: "big_spend", facts: FACTS_D21, cpKeys: [], fired: ["S1"] });

test("P-01 판단 보류 → no_card(insufficient)", () => {
  const w = mkWeek({ week: 2, level: "insufficient" });
  const f = startEvent(w, SA, recordWeek(newMemory(), w));
  assert.deepEqual(f.step, { kind: "no_card", reason: "insufficient" });
});

test("P-02 보통 → no_card(normal)", () => {
  const w = mkWeek({ week: 10, level: "normal" });
  const f = startEvent(w, SA, recordWeek(newMemory(), w));
  assert.deepEqual(f.step, { kind: "no_card", reason: "normal" });
});

test("P-03 watch + my_choice → done, 28일 안 같은 key watch → suppressed, 같은 key high → ask", () => {
  const m1 = recordWeek(newMemory(), D21);
  const r = drive(startEvent(D21, SD, m1), [ans("my_choice")], SD, m1);
  assert.deepEqual(r.kinds, ["ask", "done"]);
  assert.equal(r.mem.suppress.length, 1);
  assert.equal(r.mem.suppress[0].untilDay, D21.weekStartDay + 6 + 28);
  const w25 = mkWeek({ week: 25, level: "watch", pattern: "big_spend", facts: FACTS_D21 }); // 28일 뒤 = 같은 날 → 아직 숨김
  const m2 = recordWeek(r.mem, w25);
  assert.deepEqual(startEvent(w25, SD, m2).step, { kind: "no_card", reason: "suppressed" });
  const w25h = { ...w25, level: "high" as const };
  assert.equal(startEvent(w25h, SD, recordWeek(r.mem, w25h)).step.kind, "ask");
  const w26 = mkWeek({ week: 26, level: "watch", pattern: "big_spend", facts: FACTS_D21 }); // 35일 뒤 → 다시 물음
  assert.equal(startEvent(w26, SD, recordWeek(r.mem, w26)).step.kind, "ask");
  const other = mkWeek({ week: 22, level: "watch", pattern: "micro_repeat", facts: { micro_count: 9 } }); // 다른 key
  assert.equal(startEvent(other, SD, recordWeek(r.mem, other)).step.kind, "ask");
});

test("P-04 숨김 중에도 highWeeks·repeatCount는 센다", () => {
  const w1 = mkWeek({ week: 10, level: "watch", pattern: "micro_repeat", facts: { micro_count: 9 } });
  let m = recordWeek(newMemory(), w1);
  m = drive(startEvent(w1, SD, m), [ans("my_choice")], SD, m).mem;
  const h11 = mkWeek({ week: 11, level: "high", pattern: "micro_repeat", facts: { micro_count: 30 } });
  const h12 = mkWeek({ week: 12, level: "high", pattern: "micro_repeat", facts: { micro_count: 30 } });
  m = recordWeek(recordWeek(m, h11), h12);
  const w13 = mkWeek({ week: 13, level: "watch", pattern: "micro_repeat", facts: { micro_count: 9 } });
  m = recordWeek(m, w13);
  assert.equal(startEvent(w13, SD, m).step.kind, "no_card");
  assert.equal(m.highWeeks.length, 2);
  const h14 = mkWeek({ week: 14, level: "high", pattern: "micro_repeat", facts: { micro_count: 30 } });
  m = recordWeek(m, h14);
  assert.equal(repeatCount(m, h14), 3);
});

test("P-05 watch + not_sure → explain → help_offer → help_pick(scope none 포함, involved 제외) → preview(help_request)", () => {
  const s = mkSettings([
    mkHelper("h1", "누나", "family", { state: "linked", cpKey: "cp_09" }),
    mkHelper("h2", "이수진 선생님", "center", { state: "unknown" }, { scope: "none" }),
    mkHelper("h3", "형", "family", { state: "unknown" }),
  ]);
  const m = memUpTo([A18], 18);
  const r = drive(startEvent(A18, s, m), [ans("not_sure"), C, { type: "help", want: true }], s, m);
  assert.deepEqual(r.kinds, ["ask", "explain", "help_offer", "help_pick"]);
  const hp = r.flow.step;
  assert.ok(hp.kind === "help_pick");
  assert.deepEqual(hp.kind === "help_pick" && hp.helperIds, ["h2", "h3"]);
  const r2 = drive(r.flow, [{ type: "help_pick", pick: ["h2"] }, C], s, r.mem);
  assert.deepEqual(r2.steps[1], { kind: "preview", messages: [{ helperId: "h2", type: "help_request" }] });
  assert.equal(r2.kinds.at(-1), "done");
  assert.equal(r2.mem.reasks.length, 0);
});

test("P-06 watch + someone_told → who → HIGH", () => {
  const m = memUpTo([A18], 18);
  const r = drive(startEvent(A18, SA, m), [ans("someone_told"), { type: "who", pick: "other" }], SA, m);
  assert.deepEqual(r.kinds, ["ask", "who", "notify_choice"]);
  assert.equal(r.flow.ctx.effLevel, "high");
});

test("P-07 high + someone_told + linked 관련자(시나리오 B) → who 생략 → involved_notice(h1) → notify_choice([h2], single)", () => {
  const m = memUpTo([B16], 16);
  const r = drive(startEvent(B16, SB, m), [ans("someone_told"), C], SB, m);
  assert.deepEqual(r.kinds, ["ask", "involved_notice", "notify_choice"]);
  assert.deepEqual(r.steps[1], { kind: "involved_notice", helperIds: ["h1"] });
  assert.deepEqual(r.steps[2], { kind: "notify_choice", helperIds: ["h2"], multi: false, also: false });
});

test("P-08 high + someone_told + 관련자 없음 → who → h1 고름 → involved_notice → 나머지로 notify_choice", () => {
  const m = memUpTo([A20], 20);
  const r = drive(startEvent(A20, SA, m), [ans("someone_told"), { type: "who", pick: "h1" }, C], SA, m);
  assert.deepEqual(r.kinds, ["ask", "who", "involved_notice", "notify_choice"]);
  assert.deepEqual(r.steps[1], { kind: "who", helperIds: ["h1", "h2"] });
  assert.deepEqual(r.steps[2], { kind: "involved_notice", helperIds: ["h1"] });
  assert.deepEqual(r.steps[3], { kind: "notify_choice", helperIds: ["h2"], multi: false, also: false });
});

test("P-09 who \"other\" → unknown 연결이어도 relation_check 없음", () => {
  const s = mkSettings([mkHelper("h1", "누나", "family", { state: "unknown" })]);
  const m = memUpTo([A20], 20);
  const r = drive(startEvent(A20, s, m), [ans("someone_told"), { type: "who", pick: "other" }], s, m);
  assert.deepEqual(r.kinds, ["ask", "who", "notify_choice"]);
});

test("P-10 who \"no_say\" + unknown 연결 → relation_check", () => {
  const s = mkSettings([mkHelper("h1", "누나", "family", { state: "unknown" })]);
  const m = memUpTo([A20], 20);
  const r = drive(startEvent(A20, s, m), [ans("someone_told"), { type: "who", pick: "no_say" }], s, m);
  assert.deepEqual(r.kinds, ["ask", "who", "relation_check"]);
  assert.deepEqual(r.steps[2], { kind: "relation_check", helperId: "h1" });
});

test("P-11 relation yes·dont_know → 제외 / no → 유지", () => {
  const s = mkSettings([
    mkHelper("h1", "김도현 선생님", "activity", { state: "unknown" }),
    mkHelper("h2", "언니", "family", { state: "unknown" }),
  ], "서연");
  const m = memUpTo([B16], 16);
  for (const reply of ["yes", "dont_know"] as const) {
    const r = drive(startEvent(B16, s, m), [ans("not_sure"), C, { type: "relation", reply }, C, { type: "relation", reply: "no" }], s, m);
    assert.deepEqual(r.kinds, ["ask", "explain", "relation_check", "involved_notice", "relation_check", "notify_choice"]);
    assert.deepEqual(r.steps[3], { kind: "involved_notice", helperIds: ["h1"] });
    assert.deepEqual(r.steps[5], { kind: "notify_choice", helperIds: ["h2"], multi: false, also: false });
  }
  const r = drive(startEvent(B16, s, m), [ans("not_sure"), C, { type: "relation", reply: "no" }, { type: "relation", reply: "no" }], s, m);
  assert.deepEqual(r.steps.at(-1), { kind: "notify_choice", helperIds: ["h1", "h2"], multi: true, also: false });
});

test("P-12 상대방 없는 일(현금) + linked 조력자 → relation_check(cleared 아님)", () => {
  const w = mkWeek({ week: 15, level: "high", pattern: "after_income", facts: { ...FACTS_B16, out_mode: "cash" }, cpKeys: [] });
  const s = mkSettings([mkHelper("h1", "엄마", "family", { state: "linked", cpKey: "cp_02" })]);
  const m = memUpTo([w], 15);
  const r = drive(startEvent(w, s, m), [ans("my_choice")], s, m);
  assert.deepEqual(r.kinds, ["ask", "relation_check"]);
});

test("P-13 상대방 있는 일 + not_in_list → relation_check 없음", () => {
  const m = memUpTo([C19], 19);
  const r = drive(startEvent(C19, SC, m), [ans("my_choice")], SC, m);
  assert.deepEqual(r.kinds, ["ask", "notify_choice"]);
});

test("P-14 후보 1명: my_choice → also=true / not_sure → also=false", () => {
  const m = memUpTo([C19], 19);
  const r1 = drive(startEvent(C19, SC, m), [ans("my_choice")], SC, m);
  assert.deepEqual(r1.steps[1], { kind: "notify_choice", helperIds: ["h1"], multi: false, also: true });
  const r2 = drive(startEvent(C19, SC, m), [ans("not_sure"), C], SC, m);
  assert.deepEqual(r2.steps[2], { kind: "notify_choice", helperIds: ["h1"], multi: false, also: false });
});

test("P-15 후보 2명 → multi=true, 둘 다 고르면 alert 2개", () => {
  const m = memUpTo([A20], 20);
  const r = drive(startEvent(A20, SA, m), [ans("not_sure"), C, { type: "notify", pick: ["h1", "h2"] }], SA, m);
  assert.deepEqual(r.steps[2], { kind: "notify_choice", helperIds: ["h1", "h2"], multi: true, also: false });
  assert.deepEqual(r.steps[3], { kind: "preview", messages: [{ helperId: "h1", type: "alert" }, { helperId: "h2", type: "alert" }] });
});

test("P-16 excludePatterns(micro_repeat)에 걸린 조력자는 후보에서 빠짐", () => {
  const w = mkWeek({ week: 14, level: "high", pattern: "micro_repeat", facts: { micro_count: 30 }, cpKeys: ["cp_09"] });
  const m = memUpTo([w], 14);
  const r = drive(startEvent(w, SA, m), [ans("not_sure"), C], SA, m);
  assert.deepEqual(r.steps[2], { kind: "notify_choice", helperIds: ["h2"], multi: false, also: false });
});

test("P-17 scope none은 후보 아님", () => {
  const s = mkSettings([
    mkHelper("h1", "누나", "family", { state: "not_in_list" }, { scope: "none" }),
    mkHelper("h2", "이수진 선생님", "center", { state: "not_in_list" }),
  ]);
  const m = memUpTo([A20], 20);
  const r = drive(startEvent(A20, s, m), [ans("not_sure"), C], s, m);
  assert.deepEqual(r.steps[2], { kind: "notify_choice", helperIds: ["h2"], multi: false, also: false });
});

test("P-18 후보가 모두 빠지면 counsel_offer(no_helper)", () => {
  const m = memUpTo([B16], 16);
  const s = mkSettings([mkHelper("h1", "김도현 선생님", "activity", { state: "linked", cpKey: "cp_05" })], "서연");
  const r = drive(startEvent(B16, s, m), [ans("someone_told"), C, { type: "counsel", yes: true }, C], s, m);
  assert.deepEqual(r.kinds, ["ask", "involved_notice", "counsel_offer", "counsel_info", "done"]);
  assert.deepEqual(r.steps[2], { kind: "counsel_offer", reason: "no_helper" });
  const none = mkSettings([], "서연");
  const r2 = drive(startEvent(B16, none, m), [ans("my_choice")], none, m);
  assert.deepEqual(r2.steps[1], { kind: "counsel_offer", reason: "no_helper" });
});

test("P-19 pick=[] → decline_ack + reask(day+1), dueReasks가 돌려줌, 두 번째도 []면 used·더 없음", () => {
  const m = memUpTo([C19], 19);
  const r = drive(startEvent(C19, SC, m), [ans("my_choice"), { type: "notify", pick: [] }], SC, m);
  const day = C19.weekStartDay + 6;
  assert.deepEqual(r.steps[2], { kind: "decline_ack", reaskDay: day + 1 });
  assert.deepEqual(r.mem.reasks, [{ eventId: "w19", atDay: day + 1, helperIds: ["h1"], used: false }]);
  const r2 = drive(r.flow, [C], SC, r.mem);
  assert.equal(r2.kinds.at(-1), "done");
  assert.equal(dueReasks(r2.mem, day, SC, [C19]).length, 0);
  const due = dueReasks(r2.mem, day + 1, SC, [C19]);
  assert.equal(due.length, 1);
  assert.deepEqual(due[0].step, { kind: "reask", helperIds: ["h1"] });
  const r3 = drive(due[0], [{ type: "notify", pick: [] }], SC, r2.mem);
  assert.equal(r3.kinds.at(-1), "done");
  assert.equal(r3.mem.reasks[0].used, true);
  assert.equal(dueReasks(r3.mem, day + 5, SC, [C19]).length, 0);
});

test("P-20 reask에서 pick → preview(alert)", () => {
  const m = memUpTo([C19], 19);
  const r = drive(startEvent(C19, SC, m), [ans("my_choice"), { type: "notify", pick: [] }, C], SC, m);
  const due = dueReasks(r.mem, C19.weekStartDay + 7, SC, [C19]);
  const r2 = drive(due[0], [{ type: "notify", pick: ["h1"] }, C], SC, r.mem);
  assert.deepEqual(r2.steps[1], { kind: "preview", messages: [{ helperId: "h1", type: "alert" }] });
  assert.equal(r2.kinds.at(-1), "done");
  assert.equal(r2.mem.reasks[0].used, true);
});

test("P-21 같은 상대방 high 16·17·19주(시나리오 C) → 19주 counsel_offer(repeat), 28일 안 다시 안 띄움", () => {
  const ws = [C16, C17, C18, C19];
  const m = memUpTo(ws, 19);
  assert.equal(repeatCount(m, C19), 3);
  assert.equal(repeatCount(memUpTo(ws, 18), C18), 1);
  const r = drive(startEvent(C19, SC, m), [ans("not_sure"), C, { type: "notify", pick: ["h1"] }, C, { type: "counsel", yes: true }, C], SC, m);
  assert.deepEqual(r.kinds, ["ask", "explain", "notify_choice", "preview", "counsel_offer", "counsel_info", "done"]);
  assert.deepEqual(r.steps[4], { kind: "counsel_offer", reason: "repeat" });
  const C20 = mkWeek({ week: 20, level: "high", pattern: "after_income", facts: FACTS_C19, cpKeys: ["cp_07"] });
  const m20 = recordWeek(r.mem, C20);
  const r20 = drive(startEvent(C20, SC, m20), [ans("not_sure"), C, { type: "notify", pick: ["h1"] }, C], SC, m20);
  assert.equal(r20.kinds.at(-1), "done");
  assert.ok(!r20.kinds.includes("counsel_offer"));
});

test("P-22 상대방이 달라도 같은 pattern high 3주 → repeat", () => {
  const ws = [10, 12, 14].map((wk, i) => mkWeek({ week: wk, level: "high", pattern: "micro_repeat", facts: { micro_count: 30 }, cpKeys: [`cp_1${i}`] }));
  const m = memUpTo(ws, 14);
  assert.equal(repeatCount(m, ws[2]), 3);
  const r = drive(startEvent(ws[2], SC, m), [ans("not_sure"), C, { type: "notify", pick: [] }, C], SC, m);
  assert.deepEqual(r.steps.at(-1), { kind: "counsel_offer", reason: "repeat" });
});

test("P-23 8주보다 오래된 high는 세지 않음", () => {
  const ws = [5, 6, 14].map((wk) => mkWeek({ week: wk, level: "high", pattern: "micro_repeat", facts: { micro_count: 30 } }));
  const m = memUpTo(ws, 14);
  assert.equal(repeatCount(m, ws[2]), 1);
  // 경계: 14 − 7 = 7주는 셈, 6주는 안 셈
  const ws2 = [6, 7, 14].map((wk) => mkWeek({ week: wk, level: "high", pattern: "micro_repeat", facts: { micro_count: 30 } }));
  assert.equal(repeatCount(memUpTo(ws2, 14), ws2[2]), 2);
});

test("P-24 threatened 확인 → 횟수 < 3이어도 counsel_offer(threat)", () => {
  const m = memUpTo([C19], 19); // high 1주뿐
  const r = drive(startEvent(C19, SC, m), [
    { type: "understood", label: "threatened", evidence: "무서워요", mode: "rule" },
    { type: "understand_reply", ok: true },
    { type: "who", pick: "no_say" },
    { type: "notify", pick: ["h1"] }, C,
  ], SC, m);
  assert.deepEqual(r.kinds, ["ask", "understand_confirm", "who", "notify_choice", "preview", "counsel_offer"]);
  assert.deepEqual(r.steps.at(-1), { kind: "counsel_offer", reason: "threat" });
  assert.equal(r.flow.ctx.threat, true);
});

test("P-25 사전 위임 켜짐 + repeat ≥ 3 + cleared → 「이번엔 알리지 마요」 뒤에도 predelegated_sent", () => {
  const s: Settings = { ...SC, predelegate: { enabled: true, helperId: "h1" } };
  const m = memUpTo([C16, C17, C18, C19], 19);
  const r = drive(startEvent(C19, s, m), [ans("my_choice"), { type: "notify", pick: [] }, C], s, m);
  assert.deepEqual(r.kinds, ["ask", "notify_choice", "decline_ack", "predelegated_sent"]);
  assert.deepEqual(r.steps.at(-1), { kind: "predelegated_sent", helperId: "h1" });
  assert.deepEqual(r.flow.ctx.notified, ["h1"]);
});

test("P-26 사전 위임 + cleared 아님 → relation_check 먼저, yes면 보내지 않음", () => {
  const s = mkSettings([mkHelper("h1", "엄마", "family", { state: "linked", cpKey: "cp_02" }, { scope: "none" })], "영호", { enabled: true, helperId: "h1" });
  const ws = [16, 17, 18].map((wk) => mkWeek({ week: wk, level: "high", pattern: "after_income", facts: { ...FACTS_B16, out_mode: "cash" }, cpKeys: [] }));
  const m = memUpTo(ws, 18);
  const r = drive(startEvent(ws[2], s, m), [ans("my_choice"), { type: "counsel", yes: false }], s, m);
  assert.deepEqual(r.kinds, ["ask", "counsel_offer", "relation_check"]);
  assert.deepEqual(r.steps[2], { kind: "relation_check", helperId: "h1" });
  const yes = drive(r.flow, [{ type: "relation", reply: "yes" }], s, r.mem);
  assert.equal(yes.kinds.at(-1), "done");
  assert.ok(!yes.kinds.includes("predelegated_sent"));
  assert.deepEqual(yes.flow.ctx.notified, []);
  const no = drive(r.flow, [{ type: "relation", reply: "no" }], s, r.mem);
  assert.deepEqual(no.steps.at(-1), { kind: "predelegated_sent", helperId: "h1" });
});

test("P-27 사전 위임 꺼짐 + later → tray, 자동 알림 없음", () => {
  const m = memUpTo([C16, C17, C18, C19], 19);
  const r = drive(startEvent(C19, SC, m), [{ type: "later" }, C], SC, m);
  assert.deepEqual(r.kinds, ["ask", "later_ack", "done"]);
  assert.deepEqual(r.mem.tray, ["w19"]);
  assert.deepEqual(r.flow.ctx.notified, []);
  assert.equal(r.mem.reasks.length, 0);
  // 다시 열면 같은 eventId로 ask
  const again = startEvent(C19, SC, r.mem);
  assert.equal(again.eventId, "w19");
  assert.equal(again.step.kind, "ask");
});

test("P-28 understand unclear → ask로 돌아감 / understand_reply false → ask로 돌아감", () => {
  const m = memUpTo([A20], 20);
  const r = drive(startEvent(A20, SA, m), [
    { type: "understood", label: "unclear", evidence: "", mode: "rule" }, { type: "understand_reply", ok: true },
  ], SA, m);
  assert.deepEqual(r.kinds, ["ask", "understand_confirm", "ask"]);
  const r2 = drive(startEvent(A20, SA, m), [
    { type: "understood", label: "asked_by_someone", evidence: "빌려 달래서", mode: "live" }, { type: "understand_reply", ok: false },
  ], SA, m);
  assert.deepEqual(r2.kinds, ["ask", "understand_confirm", "ask"]);
  assert.equal(r2.flow.ctx.answer, null);
});

// ---- P-29: 시나리오 A~D 시연 답 경로 → §8-2 단계 순서 ----
// data/scenarios/<id>.json(사전계산)이 있으면 그 analysis.weeks·settings로, 없으면 각본 기대값 주로 확인한다.
const EXPECTED: Record<ScenarioId, string[]> = {
  A: ["ask", "understand_confirm(asked_by_someone)", "who[h1,h2]", "notify_choice[h1,h2] multi", "preview[h2 alert]", "done"],
  B: ["ask", "involved_notice[h1]", "notify_choice[h2] single", "preview[h2 alert]", "done"],
  C: ["ask", "explain", "notify_choice[h1] single", "preview[h1 alert]", "counsel_offer(repeat)", "counsel_info", "done"],
  D: ["ask", "done"],
};
const FIXTURE: Record<ScenarioId, { weeks: WeekResult[]; s: Settings }> = {
  A: { weeks: [A18, A19, A20], s: SA },
  B: { weeks: [B16], s: SB },
  C: { weeks: [C16, C17, C18, C19], s: SC },
  D: { weeks: [D21], s: SD },
};
const FILES: Record<ScenarioId, string> = { A: "A_minsu", B: "B_seoyeon", C: "C_youngho", D: "D_haneul" };

test("P-29 시나리오 A·B·C·D 시연 답 경로가 §8-2 단계 순서를 낸다", () => {
  const root = path.resolve(__dirname, "..");
  const DEMO = { A: 20, B: 16, C: 19, D: 21 } as const;
  for (const id of ["A", "B", "C", "D"] as ScenarioId[]) {
    const fx = FIXTURE[id];
    const run = runDemo(id, fx.weeks, fx.s, responder(id));
    assert.deepEqual(stepTrace(run.steps), EXPECTED[id], `fixture ${id}`);
    // 사전계산 결과(data/scenarios/<id>.json, 진짜 analyze·모델)로도 같은 순서인지
    const file = path.join(root, "data", "scenarios", `${FILES[id]}.json`);
    if (!fs.existsSync(file)) continue;
    const sc = JSON.parse(fs.readFileSync(file, "utf-8"));
    const understood = id === "A" && sc.script?.[0]?.input?.type === "understood" ? sc.script[0].input : undefined;
    const real = runDemo(id, sc.analysis.weeks, sc.settings, responder(id, understood));
    const trace = stepTrace(real.steps);
    assert.deepEqual(trace, sc.script_trace, `real ${id}: 저장된 script와 다름`);
    // 실제 단계가 각본 기대 주와 같으면 §8-2 순서 그대로여야 한다(다르면 그 주의 실제 level로 규칙표를 따른 것 — check_scenarios가 보고)
    if (real.week === DEMO[id]) assert.deepEqual(trace, EXPECTED[id], `real ${id}`);
  }
  // 시나리오 D는 28일 숨김을 남긴다
  const d = FIXTURE.D;
  let m = recordWeek(newMemory(), D21);
  const f = startEvent(D21, d.s, m);
  m = next(f, ans("my_choice"), d.s, m).mem;
  assert.equal(m.suppress.length, 1);
  assert.equal(DAY0 > 0, true);
});
