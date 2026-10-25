"use client";
// ③-5 미리 정해 두기 (기본 꺼짐, 구현명세 §7-3 문구 그대로)
import type { Helper, HelperId, Settings } from "@/lib/engine/types";
import { RelationIcon } from "./Icon";

export function PredelegateToggle({
  helpers,
  value,
  onChange,
  onNext,
}: {
  helpers: Helper[];
  value: Settings["predelegate"];
  onChange: (v: Settings["predelegate"]) => void;
  onNext: () => void;
}) {
  const picked = helpers.find((h) => h.id === value.helperId) ?? null;
  const noHelpers = helpers.length === 0;
  return (
    <section data-testid="predelegate-step">
      <h1 className="h1 mt-2">미리 정해 두기 — 안 해도 돼요</h1>
      <p className="mt-3">
        같은 사람이나 같은 일로 &apos;위험이 높아요&apos;가 8주 안에 3번 생기면, 내 답과 상관없이{" "}
        <strong>{picked ? picked.alias : "[사람 고르기]"}</strong>에게 알려도 돼요.
      </p>
      <div className="mt-3 flex flex-col gap-2" role="group" aria-label="사람 고르기">
        {helpers.map((h) => (
          <button
            key={h.id}
            type="button"
            className="btn btn-secondary btn-choice !justify-start"
            aria-pressed={value.helperId === h.id}
            onClick={() => onChange({ ...value, helperId: h.id as HelperId })}
          >
            <RelationIcon relation={h.relation} size={32} />
            {h.alias}
          </button>
        ))}
      </div>
      <label className="mt-5 flex min-h-[64px] cursor-pointer items-center justify-between gap-3 rounded-2xl border-2 border-line bg-white px-4">
        <span className="text-[20px] font-bold">켜기</span>
        <button
          type="button"
          role="switch"
          aria-checked={value.enabled}
          aria-label="미리 정해 두기 켜기"
          disabled={noHelpers || (!value.enabled && !value.helperId)}
          onClick={() => onChange({ ...value, enabled: !value.enabled })}
          className={`relative h-10 w-[72px] shrink-0 rounded-full transition-colors disabled:opacity-40 ${
            value.enabled ? "bg-accent" : "bg-[#9aa1ab]"
          }`}
        >
          <span
            className={`absolute top-1 h-8 w-8 rounded-full bg-white shadow transition-all ${value.enabled ? "left-[36px]" : "left-1"}`}
          />
        </button>
      </label>
      <p className="mt-3 font-semibold">알릴 때는 나에게도 꼭 알려 줘요.</p>
      <button type="button" className="btn btn-primary mt-6" onClick={onNext}>
        다음
      </button>
    </section>
  );
}
