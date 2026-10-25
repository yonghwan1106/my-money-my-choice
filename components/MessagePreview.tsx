"use client";
// ⑦ 미리보기 (구현명세 §7-5) — 실제로 보내지 않는다. 데스크톱은 둘째 휴대폰 틀에 「{별칭}의 휴대폰」 머리.
import { MessageSquare } from "lucide-react";

export interface PreviewBubble {
  helperId: string;
  alias: string;
  type: "alert" | "help_request";
  head: string;
  body: string[];
  template: boolean; // 요약이 고정 문안(기본 문장)인지
}

export function Bubble({ b }: { b: PreviewBubble }) {
  return (
    <div className="rounded-2xl rounded-tl-sm border border-line bg-white px-4 py-3 shadow-sm" data-testid="preview-bubble" data-type={b.type} data-helper={b.helperId}>
      <p className="flex items-center gap-2 font-bold">
        <MessageSquare size={22} aria-hidden="true" className="text-accent" />
        {b.head}
      </p>
      <div className="mt-2 flex flex-col gap-1.5">
        {b.body.map((l, i) => (
          <p key={i} data-line={i}>
            {l}
          </p>
        ))}
      </div>
      {b.template && b.type === "alert" ? (
        <p className="mt-2">
          <span className="badge bg-soft text-[1rem] text-muted" data-testid="template-badge">
            기본 문장
          </span>
        </p>
      ) : null}
    </div>
  );
}

export function MessagePreview({
  bubbles,
  name,
  loading,
  onNext,
}: {
  bubbles: PreviewBubble[];
  name: string;
  loading: boolean;
  onNext: () => void;
}) {
  const hasHelp = bubbles.some((b) => b.type === "help_request");
  return (
    <section data-testid="message-preview">
      <p className="badge bg-soft text-muted">{hasHelp ? `도움 요청 — ${name} 님이 직접 보내요` : "실제로 보내지 않는 미리보기예요"}</p>
      <div className="mt-3 flex flex-col gap-4">
        {loading ? (
          <p className="text-muted">미리보기를 만드는 중이에요.</p>
        ) : (
          bubbles.map((b) => (
            <div key={b.helperId + b.type}>
              <p className="mb-1 text-[1rem] font-bold text-muted">{b.alias}의 휴대폰</p>
              {/* 데스크톱은 둘째 휴대폰 틀에 보인다 */}
              <div className="lg:hidden">
                <Bubble b={b} />
              </div>
              <p className="hidden text-[1rem] lg:block" aria-hidden="true">
                → 오른쪽 휴대폰
              </p>
            </div>
          ))
        )}
      </div>
      <p className="mt-4">거래 기록·잔액·상대방 이름은 보내지 않아요.</p>
      <button type="button" className="btn btn-primary mt-4" disabled={loading} onClick={onNext}>
        다음
      </button>
    </section>
  );
}
