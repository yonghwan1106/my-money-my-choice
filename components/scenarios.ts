// 시연 시나리오 — data/scenarios/meta/*.json(A2)의 설정을 화면 Settings로 푼다(link의 cpLabel → cpKey).
// 임시: data/scenarios/<id>.json(C9 사전계산)이 생기기 전에는 meta + 예시 CSV를 브라우저에서 같은 엔진으로 분석한다.
import type { AnalyzeResult, Helper, Settings } from "@/lib/engine/types";
import metaA from "@/data/scenarios/meta/A_minsu.json";
import metaB from "@/data/scenarios/meta/B_seoyeon.json";
import metaC from "@/data/scenarios/meta/C_youngho.json";
import metaD from "@/data/scenarios/meta/D_haneul.json";
import type { ScenarioId } from "./AppState";

type MetaLink = { state: "linked"; cpLabel: string } | { state: "not_in_list" } | { state: "unknown" };
interface MetaHelper extends Omit<Helper, "link"> {
  link: MetaLink;
}
export interface ScenarioMeta {
  id: string;
  key: string;
  title: string;
  person: { displayName: string; fullName: string };
  sample: { f1: string; f2: string };
  settings: Omit<Settings, "helpers"> & { helpers: MetaHelper[] };
}

export const SCENARIO_META: Record<ScenarioId, ScenarioMeta> = {
  A: metaA as unknown as ScenarioMeta,
  B: metaB as unknown as ScenarioMeta,
  C: metaC as unknown as ScenarioMeta,
  D: metaD as unknown as ScenarioMeta,
};

export function isScenarioId(x: string | null): x is ScenarioId {
  return x === "A" || x === "B" || x === "C" || x === "D";
}

/** meta 설정 → Settings (연결은 분석 결과의 사람 상대방 이름으로 cpKey를 찾음, 못 찾으면 「연결 모름」) */
export function resolveSettings(meta: ScenarioMeta, analysis: AnalyzeResult): Settings {
  const helpers: Helper[] = meta.settings.helpers.map((h) => {
    let link: Helper["link"];
    if (h.link.state === "linked") {
      const label = h.link.cpLabel;
      const cp = analysis.counterparties.find((c) => c.label === label && c.type === "person") ??
        analysis.counterparties.find((c) => c.label === label);
      link = cp ? { state: "linked", cpKey: cp.cpKey } : { state: "unknown" };
    } else if (h.link.state === "not_in_list") link = { state: "not_in_list" };
    else link = { state: "unknown" };
    return { id: h.id, alias: h.alias, relation: h.relation, scope: h.scope, excludePatterns: [...h.excludePatterns], link };
  });
  return {
    consent: true,
    displayName: meta.settings.displayName,
    helpers,
    predelegate: { ...meta.settings.predelegate },
  };
}
