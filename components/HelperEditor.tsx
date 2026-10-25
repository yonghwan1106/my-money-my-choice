"use client";
// ③-3 믿는 사람 · ③-4 범위(사람마다) (구현명세 §7-3 문구 그대로)
import type { Helper, HelperId, PatternId, Relation } from "@/lib/engine/types";
import { RELATION_LABEL, RelationIcon } from "./Icon";
import { EXCLUDE_OPTIONS } from "./patterns";

export interface HelperDraft {
  alias: string;
  relation: Relation | null;
}

const RELATIONS: Relation[] = ["family", "center", "activity", "other"];
export const ALIAS_MAX = 12;

export function HelperEditor({
  drafts,
  onChange,
  onNext,
}: {
  drafts: HelperDraft[];
  onChange: (d: HelperDraft[]) => void;
  onNext: () => void;
}) {
  const set = (i: number, patch: Partial<HelperDraft>) => onChange(drafts.map((d, j) => (j === i ? { ...d, ...patch } : d)));
  return (
    <section data-testid="helper-editor">
      <h1 className="h1 mt-2">믿는 사람을 정해요</h1>
      <p className="mt-2">위험이 높을 때 알려 줄 사람이에요. 정하지 않아도 괜찮아요.</p>
      <ol className="mt-4 flex flex-col gap-4">
        {drafts.map((d, i) => (
          <li key={i} className="card" data-testid={`helper-draft-${i + 1}`}>
            <div className="grid grid-cols-2 gap-2" role="group" aria-label={`${i + 1}번째 사람의 관계`}>
              {RELATIONS.map((r) => (
                <button
                  key={r}
                  type="button"
                  className="btn btn-secondary btn-choice !min-h-[84px] flex-col !gap-1 !text-[1rem]"
                  aria-pressed={d.relation === r}
                  onClick={() => set(i, { relation: r })}
                >
                  <RelationIcon relation={r} size={32} />
                  {RELATION_LABEL[r]}
                </button>
              ))}
            </div>
            <label className="mt-3 block">
              <span className="sr-only">부르는 이름</span>
              <input
                className="field"
                value={d.alias}
                maxLength={ALIAS_MAX}
                placeholder="예: 누나, 이수진 선생님"
                onChange={(e) => set(i, { alias: e.target.value })}
                aria-label={`${i + 1}번째 사람을 부르는 이름`}
              />
            </label>
          </li>
        ))}
      </ol>
      <div className="mt-4 flex flex-col gap-3">
        {drafts.length < 3 ? (
          <button type="button" className="btn btn-secondary" onClick={() => onChange([...drafts, { alias: "", relation: null }])}>
            한 명 더
          </button>
        ) : null}
        <button type="button" className="btn btn-primary" onClick={onNext}>
          다음
        </button>
      </div>
    </section>
  );
}

/** 초안 → Helper[] (이름이 빈 칸은 버림, 관계를 안 고르면 「그 밖의 사람」) */
export function draftsToHelpers(drafts: HelperDraft[], prev: Helper[]): Helper[] {
  const ids: HelperId[] = ["h1", "h2", "h3"];
  return drafts
    .map((d) => ({ ...d, alias: d.alias.trim() }))
    .filter((d) => d.alias.length > 0)
    .slice(0, 3)
    .map((d, i) => {
      const old = prev.find((p) => p.alias === d.alias);
      return {
        id: ids[i],
        alias: d.alias,
        relation: d.relation ?? "other",
        scope: old?.scope ?? "high_only",
        excludePatterns: old?.excludePatterns ?? [],
        link: { state: "unknown" },
      } satisfies Helper;
    });
}

export function ScopeStep({
  helper,
  onChange,
  onNext,
}: {
  helper: Helper;
  onChange: (h: Helper) => void;
  onNext: () => void;
}) {
  const toggle = (p: PatternId) =>
    onChange({
      ...helper,
      excludePatterns: helper.excludePatterns.includes(p)
        ? helper.excludePatterns.filter((x) => x !== p)
        : [...helper.excludePatterns, p],
    });
  return (
    <section data-testid={`scope-step-${helper.id}`}>
      <div className="mt-2 flex items-center gap-3">
        <RelationIcon relation={helper.relation} size={48} className="text-accent" />
        <h1 className="h2">{helper.alias}에게 언제 알릴까요?</h1>
      </div>
      <div className="mt-4 flex flex-col gap-3" role="group">
        <button
          type="button"
          className="btn btn-secondary btn-choice"
          aria-pressed={helper.scope === "high_only"}
          onClick={() => onChange({ ...helper, scope: "high_only" })}
        >
          위험이 높을 때만 알려요
        </button>
        <button
          type="button"
          className="btn btn-secondary btn-choice"
          aria-pressed={helper.scope === "none"}
          onClick={() => onChange({ ...helper, scope: "none" })}
        >
          알리지 않아요
        </button>
      </div>
      <fieldset className="mt-6">
        <legend className="h3">이럴 때는 {helper.alias}에게 알리지 않아요(골라도 되고 안 골라도 돼요)</legend>
        <div className="mt-3 flex flex-col gap-2">
          {EXCLUDE_OPTIONS.map((o) => (
            <label key={o.id} className="flex min-h-[56px] cursor-pointer items-center gap-3 rounded-xl border-2 border-line bg-white px-3">
              <input
                type="checkbox"
                className="h-7 w-7 accent-[#1d4ed8]"
                checked={helper.excludePatterns.includes(o.id)}
                onChange={() => toggle(o.id)}
              />
              <span>{o.label}</span>
            </label>
          ))}
        </div>
      </fieldset>
      <button type="button" className="btn btn-primary mt-6" onClick={onNext}>
        다음
      </button>
    </section>
  );
}
