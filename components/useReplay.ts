"use client";
// 재생·카드 상태 (구현명세 §7-4 ReplayBar·§6-1 policy) — 1주에 0.4초.
// 살펴보기 주 = 「물어볼 것」 칸에 쌓이고 계속, 위험이 높아요 주 = 멈추고 휴대폰 틀에 카드, 다시 묻기 카드는 다음 칸에서 뜸.
import { useCallback, useEffect, useState } from "react";
import type { PolicyMemory, Settings, UserInput, WeekResult } from "@/lib/engine/types";
import { dueReasks, newMemory, next, recordWeek, startEvent, type Flow } from "@/lib/engine/policy";

export const WEEK_MS = 400;

export interface ReplayState {
  cursor: number; // 지금까지 본 주 수(0 = 재생 전)
  playing: boolean;
  mem: PolicyMemory;
  active: Flow | null;
  tray: string[]; // 「물어볼 것」 eventId (w18 …)
  answered: string[];
  activeLater: boolean; // 지금 흐름에서 [나중에 답할게요]를 눌렀는지
}

function initial(): ReplayState {
  return { cursor: 0, playing: false, mem: newMemory(), active: null, tray: [], answered: [], activeLater: false };
}

/** 한 주를 진행한다. 멈춰야 하면 active를 채운다. */
function stepWeek(st: ReplayState, weeks: WeekResult[], s: Settings, pauseOnHigh: boolean, pauseOnWatch = false): ReplayState {
  if (st.cursor >= weeks.length) return { ...st, playing: false };
  const w = weeks[st.cursor];
  let mem = recordWeek(st.mem, w);
  let tray = st.tray;
  let active: Flow | null = null;
  // 다시 묻기(하루 뒤) — 다음 칸에서 뜬다
  const due = dueReasks(mem, mem.day, s, weeks);
  if (due.length > 0 && pauseOnHigh) active = due[0];
  if (w.level === "watch" || w.level === "high") {
    const f = startEvent(w, s, mem);
    if (f.step.kind === "ask") {
      if ((w.level === "high" ? pauseOnHigh : pauseOnWatch) && !active) active = f;
      else if (!tray.includes(f.eventId) && !st.answered.includes(f.eventId)) tray = [...tray, f.eventId];
    }
  }
  return { ...st, cursor: st.cursor + 1, mem, tray, active, activeLater: false, playing: active ? false : st.playing && st.cursor + 1 < weeks.length };
}

export function useReplay(weeks: WeekResult[] | null, settings: Settings | null, mode: "demo" | "file") {
  const [st, setSt] = useState<ReplayState>(initial);

  // 결과가 바뀌면 새로 시작. 본인 파일은 처음에 모든 주를 멈추지 않고 진행(카드는 「물어볼 것」에).
  useEffect(() => {
    if (!weeks || !settings) {
      setSt(initial());
      return;
    }
    if (mode === "file") {
      let s = initial();
      while (s.cursor < weeks.length) s = stepWeek(s, weeks, settings, false);
      setSt({ ...s, playing: false, active: null });
    } else setSt(initial());
  }, [weeks, mode]);

  useEffect(() => {
    if (!st.playing || !weeks || !settings) return;
    const t = setTimeout(() => setSt((cur) => (cur.playing ? stepWeek(cur, weeks, settings, true) : cur)), WEEK_MS);
    return () => clearTimeout(t);
  }, [st.playing, st.cursor, weeks, settings]);

  const play = useCallback(() => {
    setSt((cur) => {
      if (!weeks) return cur;
      if (cur.cursor >= weeks.length) return { ...initial(), playing: true };
      return { ...cur, playing: true, active: null };
    });
  }, [weeks]);

  const pause = useCallback(() => setSt((cur) => ({ ...cur, playing: false })), []);

  /** 카드가 온 주로 바로 가기 — 다음 카드(살펴보기 포함)가 있는 주까지 한꺼번에 */
  const skipToCard = useCallback(() => {
    if (!weeks || !settings) return;
    setSt((cur) => {
      let s: ReplayState = { ...cur, playing: true, active: null };
      if (s.cursor >= weeks.length) s = { ...initial(), playing: true };
      while (s.cursor < weeks.length) {
        s = stepWeek(s, weeks, settings, true, true);
        if (s.active) break;
      }
      return { ...s, playing: false };
    });
  }, [weeks, settings]);

  /** 물어볼 것에서 카드 열기 — startEvent를 다시 부른다(같은 eventId) */
  const openFromTray = useCallback(
    (eventId: string) => {
      if (!weeks || !settings) return;
      setSt((cur) => {
        const w = weeks.find((x) => `w${x.week}` === eventId);
        if (!w) return cur;
        const f = startEvent(w, settings, cur.mem);
        return { ...cur, playing: false, active: f, activeLater: false, tray: cur.tray.filter((x) => x !== eventId) };
      });
    },
    [weeks, settings],
  );

  /** 흐름에 답 넣기 */
  const answer = useCallback(
    (input: UserInput) => {
      if (!settings) return;
      setSt((cur) => {
        if (!cur.active) return cur;
        const out = next(cur.active, input, settings, cur.mem);
        const isLater = input.type === "later" || cur.activeLater;
        let tray = cur.tray;
        let answered = cur.answered;
        if (input.type === "later" && !tray.includes(cur.active.eventId)) tray = [...tray, cur.active.eventId];
        const k = out.flow.step.kind;
        if ((k === "done" || k === "no_card") && !isLater && !answered.includes(cur.active.eventId)) answered = [...answered, cur.active.eventId];
        return { ...cur, active: out.flow, mem: out.mem, tray, answered, activeLater: isLater };
      });
    },
    [settings],
  );

  /** 카드 닫기([다른 주 보기]) */
  const close = useCallback(() => setSt((cur) => ({ ...cur, active: null })), []);

  return { st, play, pause, skipToCard, openFromTray, answer, close };
}
