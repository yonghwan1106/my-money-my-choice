"use client";
// ⑥ 누구에게 알릴까요? · 도움 요청 고르기 (구현명세 §7-5)
import { useState } from "react";
import { Check } from "lucide-react";
import type { Helper, HelperId } from "@/lib/engine/types";
import { RelationIcon } from "./Icon";

function HelperChoice({ h, on, toggle }: { h: Helper; on: boolean; toggle: () => void }) {
  return (
    <button type="button" className="btn btn-secondary btn-choice !justify-between" aria-pressed={on} onClick={toggle} data-helper={h.id}>
      <span className="flex items-center gap-2">
        <RelationIcon relation={h.relation} size={36} className="text-accent" />
        {h.alias}
      </span>
      <span className={`flex h-8 w-8 items-center justify-center rounded-full border-2 ${on ? "border-accent bg-accent text-white" : "border-[#9aa1ab]"}`}>
        {on ? <Check size={20} aria-hidden="true" /> : null}
      </span>
    </button>
  );
}

export function NotifyPicker({
  helpers,
  multi,
  also,
  onPick,
}: {
  helpers: Helper[];
  multi: boolean;
  also: boolean;
  onPick: (pick: HelperId[]) => void;
}) {
  const [sel, setSel] = useState<HelperId[]>([]);
  const toggle = (id: HelperId) => setSel(sel.includes(id) ? sel.filter((x) => x !== id) : [...sel, id]);
  const one = helpers[0];
  return (
    <section data-testid="notify-picker" data-multi={multi ? "1" : "0"}>
      {multi ? (
        <>
          <h2 className="h2">누구에게 알릴까요?</h2>
          <p className="mt-2">여러 명을 골라도 돼요.</p>
          <div className="mt-4 flex flex-col gap-2">
            {helpers.map((h) => (
              <HelperChoice key={h.id} h={h} on={sel.includes(h.id)} toggle={() => toggle(h.id)} />
            ))}
          </div>
        </>
      ) : one ? (
        <div className="flex flex-col items-start gap-3">
          <RelationIcon relation={one.relation} size={56} className="text-accent" />
          <h2 className="h2">{also ? `${one.alias}에게도 알려 줄까요?` : `${one.alias}에게 알릴까요?`}</h2>
        </div>
      ) : null}
      <div className="mt-5 grid grid-cols-2 gap-3">
        <button
          type="button"
          className="btn btn-primary"
          disabled={multi && sel.length === 0}
          onClick={() => onPick(multi ? helpers.filter((h) => sel.includes(h.id)).map((h) => h.id) : one ? [one.id] : [])}
        >
          알려 주세요
        </button>
        <button type="button" className="btn btn-secondary" onClick={() => onPick([])}>
          이번엔 알리지 마요
        </button>
      </div>
      <p className="mt-4">거래 기록은 보내지 않아요. 무슨 일이 있었는지만 짧게 가요.</p>
      <p className="mt-1 font-semibold">돈 보내기는 막지 않아요.</p>
    </section>
  );
}

export function HelpOffer({ onWant }: { onWant: (want: boolean) => void }) {
  return (
    <section data-testid="help-offer">
      <h2 className="h2">믿는 사람에게 물어볼래요?</h2>
      <div className="mt-5 flex flex-col gap-3">
        <button type="button" className="btn btn-primary" onClick={() => onWant(true)}>
          물어볼래요
        </button>
        <button type="button" className="btn btn-secondary" onClick={() => onWant(false)}>
          괜찮아요
        </button>
      </div>
    </section>
  );
}

export function HelpPick({ helpers, onPick }: { helpers: Helper[]; onPick: (pick: HelperId[]) => void }) {
  const [sel, setSel] = useState<HelperId[]>([]);
  const toggle = (id: HelperId) => setSel(sel.includes(id) ? sel.filter((x) => x !== id) : [...sel, id]);
  return (
    <section data-testid="help-pick">
      <h2 className="h2">누구에게 물어볼까요?</h2>
      <div className="mt-4 flex flex-col gap-2">
        {helpers.map((h) => (
          <HelperChoice key={h.id} h={h} on={sel.includes(h.id)} toggle={() => toggle(h.id)} />
        ))}
      </div>
      <button type="button" className="btn btn-primary mt-5" onClick={() => onPick(helpers.filter((h) => sel.includes(h.id)).map((h) => h.id))}>
        보내기 전에 미리 볼게요
      </button>
    </section>
  );
}
