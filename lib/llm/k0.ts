// K0 낱말 규칙 분류기 (구현명세 §6-7) — 키 없음·상한 초과·언어모델 실패 때의 폴백이자 비교 기준.
import type { UnderstandLabel } from "../engine/types";

const RULES: [Exclude<UnderstandLabel, "unclear">, RegExp][] = [
  ["threatened", /무서|때리|때려|맞았|화내|겁|협박|큰일|혼나/u],
  ["asked_by_someone", /달라|달래|빌려 ?달|하라고|하래|시켜|시킨|보내라|보내래|부탁|사 ?달/u],
  ["my_choice", /(내가|제가) ?(하고|주고|사고) ?싶|선물|원해서|하고 싶어서|주고 싶어서/u],
  ["not_sure", /모르겠|몰라|기억이? ?안|헷갈/u],
];

export function k0(text: string): { label: UnderstandLabel; evidence: string } {
  for (const [label, re] of RULES) {
    const m = text.match(re);
    if (m) return { label, evidence: m[0].slice(0, 40) };
  }
  return { label: "unclear", evidence: "" };
}
