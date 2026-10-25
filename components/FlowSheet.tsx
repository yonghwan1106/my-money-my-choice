"use client";
// ⑤~⑨ 휴대폰 틀 안 흐름 (구현명세 §7-5) — 상태 전이는 policy.next, 화면은 단계 종류별 컴포넌트.
// 언어모델 호출은 redact() 뒤에만, 사전계산이 있으면 호출하지 않는다(lib/precomputed.ts).
import { useEffect, useMemo, useState } from "react";
import type { Helper, HelperId, Settings, UserInput, WeekResult } from "@/lib/engine/types";
import type { Flow } from "@/lib/engine/policy";
import { alertMessage, helpRequestMessage, helperNoteFacts, helperNoteTemplate } from "@/lib/engine/templates";
import { redact } from "@/lib/privacy/redact";
import { getHelperNote, getUnderstand, type PrecomputedBlock } from "@/lib/precomputed";
import { AskCard, ExplainCardView } from "./AskCard";
import { FreeAnswer } from "./FreeAnswer";
import { UnderstandConfirm } from "./UnderstandConfirm";
import { WhoPicker } from "./WhoPicker";
import { InvolvedNotice, RelationCheck } from "./RelationCheck";
import { HelpOffer, HelpPick, NotifyPicker } from "./NotifyPicker";
import { ReaskCard } from "./ReaskCard";
import { MessagePreview, type PreviewBubble } from "./MessagePreview";
import { CounselInfo, CounselOffer } from "./CounselCard";
import { RelationIcon } from "./Icon";
import type { LastMode } from "./AppState";
import { LAYERS, type LayerInfo } from "./layers";

export function layerOfStep(kind: Flow["step"]["kind"], free: boolean): LayerInfo {
  if (free || kind === "understand_confirm") return LAYERS.understand;
  if (kind === "ask" || kind === "explain") return LAYERS.ask;
  if (kind === "preview") return LAYERS.note;
  if (kind === "counsel_offer" || kind === "counsel_info") return LAYERS.counsel;
  return LAYERS.policy;
}

const byIds = (s: Settings, ids: HelperId[]): Helper[] => ids.map((id) => s.helpers.find((h) => h.id === id)).filter((h): h is Helper => !!h);

/** 미리보기 말풍선 만들기 — 알림 요약은 사전계산 → /api/helper-note → 고정 문안 */
export async function buildBubbles(
  flow: Flow,
  s: Settings,
  pre: PrecomputedBlock | null,
): Promise<{ bubbles: PreviewBubble[]; mode: LastMode }> {
  if (flow.step.kind !== "preview") return { bubbles: [], mode: null };
  const w = flow.week;
  const name = s.displayName;
  let summary: string | null = null;
  let mode: LastMode = null;
  const needAlert = flow.step.messages.some((m) => m.type === "alert");
  if (needAlert) {
    const level = w.level === "high" ? "high" : "watch";
    const res = await getHelperNote(pre, {
      prompt_version: "helpernote-v1",
      pattern: w.pattern ?? "slow_leak",
      level,
      facts: helperNoteFacts(w),
    });
    if (res && res.summary) {
      summary = res.summary;
      mode = res.mode;
    } else {
      summary = helperNoteTemplate(w);
      mode = "template";
    }
  }
  const bubbles: PreviewBubble[] = flow.step.messages.map((m) => {
    const h = s.helpers.find((x) => x.id === m.helperId);
    const alias = h?.alias ?? m.helperId;
    if (m.type === "alert") {
      const msg = alertMessage(summary ?? helperNoteTemplate(w), flow.ctx.answer, name, { predelegated: flow.ctx.predelegatedTo === m.helperId });
      return { helperId: m.helperId, alias, type: "alert", head: msg.head, body: msg.body, template: mode === "template" };
    }
    const msg = helpRequestMessage(w, name);
    return { helperId: m.helperId, alias, type: "help_request", head: msg.head, body: msg.body, template: false };
  });
  return { bubbles, mode };
}

export function FlowSheet({
  flow,
  settings,
  weeks,
  cpLabels,
  pre,
  chips,
  onInput,
  onClose,
  onHome,
  onMode,
  onBubbles,
  onLayer,
}: {
  flow: Flow;
  settings: Settings;
  weeks: WeekResult[];
  cpLabels: string[];
  pre: PrecomputedBlock | null;
  chips: string[];
  onInput: (i: UserInput) => void;
  onClose: () => void;
  onHome: () => void;
  onMode: (m: LastMode) => void;
  onBubbles: (b: PreviewBubble[] | null) => void;
  onLayer: (l: LayerInfo) => void;
}) {
  const [free, setFree] = useState(false);
  const [busy, setBusy] = useState(false);
  const [bubbles, setBubbles] = useState<PreviewBubble[] | null>(null);
  const step = flow.step;
  const name = settings.displayName;
  void weeks;

  // 단계가 바뀌면 말로 답하기 칸을 닫는다
  const stepKey = useMemo(() => JSON.stringify(step), [step]);
  useEffect(() => {
    setFree(false);
    setBusy(false);
  }, [stepKey]);

  useEffect(() => {
    onLayer(layerOfStep(step.kind, free));
  }, [step.kind, free, onLayer]);

  // 미리보기 말풍선
  useEffect(() => {
    let alive = true;
    if (step.kind !== "preview") {
      setBubbles(null);
      onBubbles(null);
      return;
    }
    setBubbles(null);
    buildBubbles(flow, settings, pre).then(({ bubbles: b, mode }) => {
      if (!alive) return;
      setBubbles(b);
      onBubbles(b);
      if (mode) onMode(mode);
    });
    return () => {
      alive = false;
    };
    // flow 객체가 바뀔 때만
  }, [stepKey]); // eslint-disable-line react-hooks/exhaustive-deps

  const sendFree = async (raw: string) => {
    if (step.kind !== "ask") return;
    setBusy(true);
    const w = flow.week;
    const text = redact(raw, { displayName: settings.displayName, helpers: settings.helpers, cpLabels });
    const res = await getUnderstand(pre, {
      prompt_version: "understand-v1",
      text: text.slice(0, 200) || raw.slice(0, 200),
      pattern: w.pattern ?? "slow_leak",
      level: w.level === "high" ? "high" : "watch",
    });
    setBusy(false);
    if (!res) {
      onInput({ type: "understood", label: "unclear", evidence: "", mode: "rule" });
      onMode("rule");
      return;
    }
    onMode(res.mode);
    onInput({ type: "understood", label: res.label, evidence: res.evidence, mode: res.mode });
  };

  let body: React.ReactNode = null;
  switch (step.kind) {
    case "ask":
      body = free ? (
        <FreeAnswer chips={chips} busy={busy} onSend={sendFree} onChip={sendFree} onCancel={() => setFree(false)} />
      ) : (
        <AskCard
          card={step.card}
          onAnswer={(a) => onInput({ type: "answer", answer: a })}
          onFree={() => setFree(true)}
          onLater={() => onInput({ type: "later" })}
        />
      );
      break;
    case "understand_confirm":
      body = <UnderstandConfirm label={step.label} evidence={step.evidence} mode={step.mode} onReply={(ok) => onInput({ type: "understand_reply", ok })} />;
      break;
    case "who":
      body = <WhoPicker helpers={byIds(settings, step.helperIds)} onPick={(pick) => onInput({ type: "who", pick })} />;
      break;
    case "explain":
      body = <ExplainCardView card={step.card} onNext={() => onInput({ type: "continue" })} />;
      break;
    case "help_offer":
      body = <HelpOffer onWant={(want) => onInput({ type: "help", want })} />;
      break;
    case "help_pick":
      body = <HelpPick helpers={byIds(settings, step.helperIds)} onPick={(pick) => onInput({ type: "help_pick", pick })} />;
      break;
    case "involved_notice":
      body = <InvolvedNotice helpers={byIds(settings, step.helperIds)} onNext={() => onInput({ type: "continue" })} />;
      break;
    case "relation_check": {
      const h = settings.helpers.find((x) => x.id === step.helperId);
      body = h ? <RelationCheck helper={h} onReply={(reply) => onInput({ type: "relation", reply })} /> : null;
      break;
    }
    case "notify_choice":
      body = (
        <NotifyPicker
          key={stepKey}
          helpers={byIds(settings, step.helperIds)}
          multi={step.multi}
          also={step.also}
          onPick={(pick) => onInput({ type: "notify", pick })}
        />
      );
      break;
    case "preview":
      body = <MessagePreview bubbles={bubbles ?? []} name={name} loading={!bubbles} onNext={() => onInput({ type: "continue" })} />;
      break;
    case "decline_ack":
      body = (
        <section data-testid="decline-ack">
          <p className="h2">알겠어요. 내일 한 번만 다시 물어볼게요.</p>
          <button type="button" className="btn btn-primary mt-6" onClick={() => onInput({ type: "continue" })}>
            다음
          </button>
        </section>
      );
      break;
    case "reask":
      body = <ReaskCard onPick={(notify) => onInput({ type: "notify", pick: notify ? step.helperIds : [] })} />;
      break;
    case "predelegated_sent": {
      const h = settings.helpers.find((x) => x.id === step.helperId);
      body = (
        <section data-testid="predelegated-sent">
          {h ? <RelationIcon relation={h.relation} size={56} className="text-accent" /> : null}
          <p className="h2 mt-3">미리 정한 대로 {h?.alias}에게 알렸어요.</p>
          <p className="mt-3">시작할 때 {name} 님이 정한 약속이에요. 설정에서 바꿀 수 있어요.</p>
          <button type="button" className="btn btn-primary mt-6" onClick={() => onInput({ type: "continue" })}>
            다음
          </button>
        </section>
      );
      break;
    }
    case "counsel_offer":
      body = <CounselOffer reason={step.reason} onReply={(yes) => onInput({ type: "counsel", yes })} />;
      break;
    case "counsel_info":
      body = (
        <CounselInfo
          name={name}
          onHome={() => {
            onInput({ type: "continue" });
            onHome();
          }}
        />
      );
      break;
    case "later_ack":
      body = (
        <section data-testid="later-ack">
          <p className="h2">물어볼 것에 넣어 둘게요. 내일 한 번 더 보여 줄게요.</p>
          <button type="button" className="btn btn-primary mt-6" onClick={() => onInput({ type: "continue" })}>
            다음
          </button>
        </section>
      );
      break;
    case "done":
      body = (
        <section data-testid="flow-done">
          <p className="h2">고마워요. {name} 님이 정한 대로 할게요.</p>
          <button type="button" className="btn btn-primary mt-6" onClick={onClose}>
            다른 주 보기
          </button>
        </section>
      );
      break;
    case "no_card":
      body = null;
      break;
  }

  return (
    <div
      className="fixed inset-0 z-40 flex flex-col bg-bg lg:absolute"
      role="dialog"
      aria-modal="true"
      aria-label={`${flow.week.week}주 확인`}
      data-testid="flow-sheet"
      data-step={step.kind}
      data-week={flow.week.week}
    >
      <div className="flex-1 overflow-y-auto px-4 pb-6 pt-5">
        <p className="mb-3 text-[1rem] font-bold text-muted">
          {flow.week.week}주 ·{" "}
          <span className={`badge badge-${flow.week.level}`}>{flow.week.level === "high" ? "위험이 높아요" : flow.week.level === "watch" ? "살펴보기" : "보통"}</span>
        </p>
        {body}
      </div>
      {step.kind === "ask" ? (
        <div className="border-t border-line bg-[#fffdf5] px-4 py-3 text-center text-[1rem] font-semibold leading-snug" data-testid="fixed-note">
          이 판단은 참고용이에요. 돈을 쓸지 말지는 본인이 정해요.
        </div>
      ) : null}
    </div>
  );
}
