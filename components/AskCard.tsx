"use client";
// ⑤ 본인 확인 카드 (구현명세 §7-5) — 문장은 templates.ts의 고정 문안(언어모델이 쓰지 않음)
import type { AskCard as AskCardT, Answer, ExplainCard } from "@/lib/engine/types";
import { PictureIcon } from "./Icon";
import { SpeakButton } from "./SpeakButton";

export const ANSWER_BUTTONS: { answer: Answer; label: string }[] = [
  { answer: "my_choice", label: "내가 하고 싶어서 했어요" },
  { answer: "not_sure", label: "잘 모르겠어요" },
  { answer: "someone_told", label: "누가 하라고 했어요" },
];

export function AskCard({
  card,
  onAnswer,
  onFree,
  onLater,
  interactive = true,
}: {
  card: AskCardT;
  onAnswer?: (a: Answer) => void;
  onFree?: () => void;
  onLater?: () => void;
  /** 대표 이미지(/thumb)는 버튼만 보이고 누를 수 없게 */
  interactive?: boolean;
}) {
  const speech = [card.title, ...card.lines, card.question].join(" ");
  return (
    <article data-testid="ask-card" data-event={card.eventId}>
      <div className="flex items-start justify-between gap-2">
        <PictureIcon picture={card.picture} size={56} className="text-accent" />
        {interactive ? <SpeakButton text={speech} /> : null}
      </div>
      <h2 className="h2 mt-3" data-testid="ask-title">
        {card.title}
      </h2>
      <div className="mt-2 flex flex-col gap-1 text-[1.1rem]" data-testid="ask-lines">
        <p>{card.lines[0]}</p>
        <p>{card.lines[1]}</p>
      </div>
      <p className="mt-4 text-[1.2rem] font-bold" data-testid="ask-question">
        {card.question}
      </p>
      <div className="mt-4 flex flex-col gap-3">
        {ANSWER_BUTTONS.map((b) => (
          <button
            key={b.answer}
            type="button"
            className="btn btn-secondary"
            data-answer={b.answer}
            tabIndex={interactive ? 0 : -1}
            onClick={interactive && onAnswer ? () => onAnswer(b.answer) : undefined}
          >
            {b.label}
          </button>
        ))}
      </div>
      {interactive ? (
        <div className="mt-3 flex flex-col items-center gap-3">
          <button type="button" className="chip" onClick={onFree} data-testid="btn-free">
            말로 할래요
          </button>
        </div>
      ) : null}
      <p className="mt-4 text-center font-semibold" data-testid="ask-footer">
        {card.footer}
      </p>
      {interactive ? (
        <p className="mt-2 text-center">
          <button type="button" className="link text-[1rem]" onClick={onLater} data-testid="btn-later">
            나중에 답할게요
          </button>
        </p>
      ) : null}
    </article>
  );
}

export function ExplainCardView({ card, onNext }: { card: ExplainCard; onNext: () => void }) {
  return (
    <article data-testid="explain-card">
      <PictureIcon picture={card.picture} size={56} className="text-accent" />
      <div className="mt-3 flex flex-col gap-2 text-[1.1rem]">
        {card.lines.map((l, i) => (
          <p key={i} className={i === 2 ? "font-bold" : ""}>
            {l}
          </p>
        ))}
      </div>
      <button type="button" className="btn btn-primary mt-6" onClick={onNext}>
        다음
      </button>
    </article>
  );
}
