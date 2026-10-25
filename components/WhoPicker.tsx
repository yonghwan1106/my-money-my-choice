"use client";
// ⑤-2 누구예요? (구현명세 §7-5)
import type { Helper, HelperId } from "@/lib/engine/types";
import { RelationIcon } from "./Icon";

export function WhoPicker({ helpers, onPick }: { helpers: Helper[]; onPick: (p: HelperId | "other" | "no_say") => void }) {
  return (
    <section data-testid="who-picker">
      <h2 className="h2">누구예요?</h2>
      <p className="mt-2">하라고 한 사람을 골라 주세요. 말하지 않아도 돼요.</p>
      <div className="mt-4 flex flex-col gap-3">
        {helpers.map((h) => (
          <button key={h.id} type="button" className="btn btn-secondary !justify-start" onClick={() => onPick(h.id)} data-helper={h.id}>
            <RelationIcon relation={h.relation} size={36} className="text-accent" />
            {h.alias}
          </button>
        ))}
        <button type="button" className="btn btn-secondary" onClick={() => onPick("other")}>
          다른 사람
        </button>
        <button type="button" className="btn btn-secondary" onClick={() => onPick("no_say")}>
          말하고 싶지 않아요
        </button>
      </div>
    </section>
  );
}
