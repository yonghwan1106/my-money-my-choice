// 시연 사전계산(구현명세 §8-1 data/scenarios/<id>.json의 precomputed·compare, C9)과 예시 칩 문장(§7-5 ⑤-1).
// 칩을 누르면 사전계산 결과를 쓰므로 시연 버튼으로 끝까지 가도 /api 호출이 없다. 본인이 직접 고쳐 쓰면 실제 호출.
import type { PrecomputedBlock } from "@/lib/precomputed";
import type { ScenarioId } from "./AppState";
import type { CompareA, CompareD } from "./CompareBoard";
import scA from "@/data/scenarios/A_minsu.json";
import scB from "@/data/scenarios/B_seoyeon.json";
import scC from "@/data/scenarios/C_youngho.json";
import scD from "@/data/scenarios/D_haneul.json";

interface ScenarioFile {
  precomputed?: PrecomputedBlock;
  compare?: unknown;
}
const pre = (x: unknown): PrecomputedBlock | null => ((x as ScenarioFile).precomputed ?? null);

export const SCENARIO_CHIP: Record<ScenarioId, string> = {
  A: "형이 급하다고 빌려 달래서 보냈어요",
  B: "선생님이 달라고 했어요",
  C: "잘 모르겠어요 그냥 보냈어요",
  D: "냉장고가 고장 나서 내가 샀어요",
};

export const SCENARIO_PRE: Record<ScenarioId, PrecomputedBlock | null> = {
  A: pre(scA),
  B: pre(scB),
  C: pre(scC),
  D: pre(scD),
};

/** ⑩ 비교 값 — data/scenarios/A_minsu.json·D_haneul.json의 compare */
export const SCENARIO_COMPARE: { A: CompareA | null; D: CompareD | null } = {
  A: ((scA as unknown as ScenarioFile).compare as CompareA) ?? null,
  D: ((scD as unknown as ScenarioFile).compare as CompareD) ?? null,
};
