"use client";
// 관련자 확인 · 관련자 안내 (구현명세 §7-5)
import type { Helper } from "@/lib/engine/types";
import { RelationIcon } from "./Icon";

export function RelationCheck({ helper, onReply }: { helper: Helper; onReply: (r: "no" | "yes" | "dont_know") => void }) {
  return (
    <section data-testid="relation-check" data-helper={helper.id}>
      <RelationIcon relation={helper.relation} size={56} className="text-accent" />
      <h2 className="h2 mt-3">이번 일과 관련된 사람이 {helper.alias}인가요?</h2>
      <div className="mt-5 flex flex-col gap-3">
        <button type="button" className="btn btn-secondary" onClick={() => onReply("no")}>
          아니에요
        </button>
        <button type="button" className="btn btn-secondary" onClick={() => onReply("yes")}>
          맞아요
        </button>
        <button type="button" className="btn btn-secondary" onClick={() => onReply("dont_know")}>
          모르겠어요
        </button>
      </div>
      <p className="small mt-4">맞거나 모르겠으면 {helper.alias}에게는 알리지 않아요.</p>
    </section>
  );
}

export function InvolvedNotice({ helpers, onNext }: { helpers: Helper[]; onNext: () => void }) {
  const names = helpers.map((h) => h.alias).join(", ");
  return (
    <section data-testid="involved-notice">
      <p className="h2">이 일과 관련된 분이라 {names}에게는 알리지 않아요.</p>
      <button type="button" className="btn btn-primary mt-6" onClick={onNext}>
        다음
      </button>
    </section>
  );
}
