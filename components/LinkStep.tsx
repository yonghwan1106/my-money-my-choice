"use client";
// ④ 믿는 사람 연결 (구현명세 §7-4 문구 그대로) — 건너뛴 사람은 「연결 모름」
import { useState } from "react";
import type { Counterparty, Helper, HelperId } from "@/lib/engine/types";
import { RelationIcon } from "./Icon";
import { josa } from "./josa";

type Pick = { state: "linked"; cpKey: string } | { state: "not_in_list" };

export function LinkStep({
  helpers,
  counterparties,
  onDone,
}: {
  helpers: Helper[];
  counterparties: Counterparty[];
  onDone: (links: Record<HelperId, Helper["link"]>) => void;
}) {
  const people = counterparties
    .filter((c) => c.type === "person")
    .sort((a, b) => b.txCount - a.txCount || a.cpKey.localeCompare(b.cpKey))
    .slice(0, 12);
  const [picks, setPicks] = useState<Partial<Record<HelperId, Pick>>>({});
  const finish = (skipRest: boolean) => {
    const out = {} as Record<HelperId, Helper["link"]>;
    for (const h of helpers) out[h.id] = picks[h.id] ?? { state: "unknown" };
    void skipRest;
    onDone(out);
  };
  const allPicked = helpers.every((h) => picks[h.id]);
  return (
    <section data-testid="link-step">
      <h1 className="h1 mt-2">믿는 사람 연결</h1>
      <p className="mt-2">거래 기록에 나온 사람이에요. 믿는 사람이 이 목록에 있으면 골라 주세요.</p>
      <div className="mt-4 flex flex-col gap-5">
        {helpers.map((h) => (
          <fieldset key={h.id} className="card" data-testid={`link-${h.id}`}>
            <legend className="sr-only">{josa(h.alias, "은", "는")} 누구예요?</legend>
            <div className="flex items-center gap-3">
              <RelationIcon relation={h.relation} size={40} className="shrink-0 text-accent" />
              <p className="h3">{josa(h.alias, "은", "는")} 누구예요?</p>
            </div>
            <div className="mt-3 flex flex-col gap-2">
              {people.map((c) => {
                const on = picks[h.id]?.state === "linked" && (picks[h.id] as { cpKey: string }).cpKey === c.cpKey;
                return (
                  <button
                    key={c.cpKey}
                    type="button"
                    className="btn btn-secondary btn-choice !justify-start !text-[1rem]"
                    aria-pressed={on}
                    onClick={() => setPicks({ ...picks, [h.id]: { state: "linked", cpKey: c.cpKey } })}
                  >
                    {c.label} · {c.txCount}번
                  </button>
                );
              })}
              <button
                type="button"
                className="btn btn-secondary btn-choice !text-[1rem]"
                aria-pressed={picks[h.id]?.state === "not_in_list"}
                onClick={() => setPicks({ ...picks, [h.id]: { state: "not_in_list" } })}
              >
                이 목록에 없어요
              </button>
            </div>
          </fieldset>
        ))}
      </div>
      <div className="mt-5 flex flex-col gap-3">
        <button type="button" className="btn btn-primary" disabled={!allPicked} onClick={() => finish(false)}>
          다음
        </button>
        <button type="button" className="btn btn-secondary" onClick={() => finish(true)}>
          건너뛰기
        </button>
      </div>
      <p className="small mt-3">연결은 이 기기에만 있고, 새로고침하면 지워져요.</p>
    </section>
  );
}
