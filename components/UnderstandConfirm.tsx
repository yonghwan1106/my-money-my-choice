"use client";
// ⑤-1′ 알아들은 내용 확인 (구현명세 §7-5) — 본인이 [맞아요]를 눌러야 반영
import type { UnderstandLabel, UnderstandResponse } from "@/lib/engine/types";

export const LABEL_BUTTON_WORD: Record<Exclude<UnderstandLabel, "unclear">, string> = {
  my_choice: "내가 하고 싶어서 했어요",
  asked_by_someone: "누가 하라고 했어요",
  threatened: "누가 하라고 했어요",
  not_sure: "잘 모르겠어요",
};

export function UnderstandConfirm({
  label,
  evidence,
  mode,
  onReply,
}: {
  label: UnderstandLabel;
  evidence: string;
  mode: UnderstandResponse["mode"];
  onReply: (ok: boolean) => void;
}) {
  if (label === "unclear") {
    return (
      <section data-testid="understand-confirm" data-label="unclear">
        <p className="h2">잘 못 알아들었어요. 버튼으로 골라 줄래요?</p>
        {mode === "rule" ? <p className="small mt-2">AI 연결 없이 낱말로 알아들었어요.</p> : null}
        <button type="button" className="btn btn-primary mt-6" onClick={() => onReply(false)}>
          버튼으로 고를게요
        </button>
      </section>
    );
  }
  return (
    <section data-testid="understand-confirm" data-label={label}>
      <p className="h2">&apos;{LABEL_BUTTON_WORD[label]}&apos;로 알아들었어요. 맞아요?</p>
      {evidence ? <p className="small mt-2">&quot;{evidence}&quot;를 보고 알아들었어요.</p> : null}
      {mode === "rule" ? (
        <p className="small mt-1" data-testid="rule-note">
          AI 연결 없이 낱말로 알아들었어요.
        </p>
      ) : null}
      <div className="mt-6 flex flex-col gap-3">
        <button type="button" className="btn btn-primary" onClick={() => onReply(true)}>
          맞아요
        </button>
        <button type="button" className="btn btn-secondary" onClick={() => onReply(false)}>
          아니에요, 버튼으로 고를게요
        </button>
      </div>
    </section>
  );
}
