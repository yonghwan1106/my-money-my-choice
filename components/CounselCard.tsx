"use client";
// ⑧ 상담 (구현명세 §7-5 문구 그대로) — 이 화면은 대신 전화하지 않는다
import { Phone } from "lucide-react";

const REASON_LINE = {
  repeat: "같은 일이 몇 주째 이어지고 있어요.",
  threat: "무서운 일이 있었다면 혼자 견디지 않아도 돼요.",
  no_helper: "알릴 수 있는 사람이 없어요. 상담을 안내할 수 있어요.",
} as const;

export function CounselOffer({ reason, onReply }: { reason: keyof typeof REASON_LINE; onReply: (yes: boolean) => void }) {
  return (
    <section data-testid="counsel-offer" data-reason={reason}>
      <Phone size={56} strokeWidth={1.75} aria-hidden="true" className="text-accent" />
      <h2 className="h2 mt-3">상담을 받아 볼래요?</h2>
      <p className="mt-2">{REASON_LINE[reason]}</p>
      <div className="mt-5 grid grid-cols-2 gap-3">
        <button type="button" className="btn btn-primary" onClick={() => onReply(true)}>
          네
        </button>
        <button type="button" className="btn btn-secondary" onClick={() => onReply(false)}>
          아니요
        </button>
      </div>
    </section>
  );
}

export function CounselInfo({ name, onHome }: { name: string; onHome: () => void }) {
  return (
    <section data-testid="counsel-info">
      <Phone size={56} strokeWidth={1.75} aria-hidden="true" className="text-accent" />
      <h2 className="h2 mt-3">상담 안내</h2>
      <p className="mt-3 text-[1.5rem] font-extrabold leading-snug" data-testid="counsel-number">
        장애인권익옹호기관 1644-8295
      </p>
      <p className="mt-3">전화·문자·카카오톡 모두 돼요. 전국 어디서나 같은 번호예요.</p>
      <p className="mt-2">사는 곳 지역발달장애인지원센터에서도 도와줘요.</p>
      <p className="mt-2 font-semibold">전화할지는 {name} 님이 정해요. 이 화면은 대신 전화하지 않아요.</p>
      <p className="small mt-3">출처: 보건복지부 보도자료(2025-09-26) 14쪽</p>
      <button type="button" className="btn btn-primary mt-5" onClick={onHome}>
        처음으로
      </button>
    </section>
  );
}
