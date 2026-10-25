// 「이렇게 정했어요」 요약 (구현명세 §7-3 6번)
import type { Settings } from "@/lib/engine/types";
import { RELATION_LABEL, RelationIcon } from "./Icon";
import { EXCLUDE_OPTIONS } from "./patterns";

export function SettingsSummary({ settings }: { settings: Settings }) {
  const pre = settings.helpers.find((h) => h.id === settings.predelegate.helperId);
  return (
    <div className="mt-4 flex flex-col gap-3">
      <div className="card">
        <p className="small">부르는 이름</p>
        <p className="h3">{settings.displayName} 님</p>
      </div>
      <div className="card">
        <p className="small">믿는 사람</p>
        {settings.helpers.length === 0 ? (
          <p className="font-semibold">정하지 않았어요</p>
        ) : (
          <ul className="mt-1 flex flex-col gap-3">
            {settings.helpers.map((h) => (
              <li key={h.id} className="flex gap-3">
                <RelationIcon relation={h.relation} size={40} className="mt-1 shrink-0 text-accent" />
                <div>
                  <p className="font-bold">
                    {h.alias} <span className="font-normal text-muted">({RELATION_LABEL[h.relation]})</span>
                  </p>
                  <p>{h.scope === "high_only" ? "위험이 높을 때만 알려요" : "알리지 않아요"}</p>
                  {h.excludePatterns.length > 0 ? (
                    <p className="text-[1rem] text-muted">
                      알리지 않는 때: {EXCLUDE_OPTIONS.filter((o) => h.excludePatterns.includes(o.id)).map((o) => o.label).join(", ")}
                    </p>
                  ) : null}
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
      <div className="card">
        <p className="small">미리 정해 두기</p>
        <p className="font-semibold">{settings.predelegate.enabled && pre ? `켜짐 — ${pre.alias}` : "꺼짐"}</p>
      </div>
    </div>
  );
}
