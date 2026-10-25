// 시연 사전계산(구현명세 §8-1 data/scenarios/<id>.json의 precomputed)과 예시 칩 문장(§7-5 ⑤-1).
// 임시: data/scenarios/<id>.json(C9)이 아직 없어 사전계산은 null — 그 동안 칩을 누르면 /api/understand를 실제로 부른다.
// 파일이 생기면 import를 풀어 precomputed 블록을 넣는다(B5).
import type { PrecomputedBlock } from "@/lib/precomputed";
import type { ScenarioId } from "./AppState";

export const SCENARIO_CHIP: Record<ScenarioId, string> = {
  A: "형이 급하다고 빌려 달래서 보냈어요",
  B: "선생님이 달라고 했어요",
  C: "잘 모르겠어요 그냥 보냈어요",
  D: "냉장고가 고장 나서 내가 샀어요",
};

export const SCENARIO_PRE: Record<ScenarioId, PrecomputedBlock | null> = {
  A: null,
  B: null,
  C: null,
  D: null,
};
