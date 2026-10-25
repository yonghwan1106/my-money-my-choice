// server-only — 프롬프트 초판 (구현명세 §6-6). 고칠 때는 개발 문장 40개로만 확인하고 prompt_version을 올린다.
import type { HelperNoteFacts, PatternId } from "../engine/types";
import { LEVEL_LABEL, patternName } from "../engine/templates";

export const UNDERSTAND_VERSION = "understand-v1" as const;
export const HELPERNOTE_VERSION = "helpernote-v1" as const;

export const UNDERSTAND_SYSTEM = `너는 발달장애인 본인이 자기 돈 거래에 대해 한 짧은 말을 다섯 가지 중 하나로 나눈다.
조언·위로·판단을 쓰지 않는다. JSON 한 줄만 출력한다: {"label":"…","evidence":"…"}
- threatened: 무섭다, 때린다, 화낸다, 안 주면 큰일 난다처럼 겁을 먹었거나 위협을 말한다. (가장 먼저 본다)
- asked_by_someone: 다른 사람이 달라고, 빌려 달라고, 하라고, 시켜서, 부탁해서 했다고 말한다.
- my_choice: 다른 사람의 요구 없이 본인이 원해서 했다고 말한다(선물, 사고 싶었다, 주고 싶었다).
- not_sure: 모르겠다, 기억이 안 난다, 헷갈린다고 말한다.
- unclear: 위 넷으로 나눌 수 없거나 돈 거래와 상관없는 말이다.
다른 사람의 요구와 본인 뜻이 함께 나오면 asked_by_someone으로 한다. "누가 시킨 거 아니에요"처럼 요구를 부정하면 그 말을 따른다.
evidence: 판단에 쓴 말을 입력에서 그대로 복사한다(40자 이하). unclear면 "".
[본인] [H1] [H2] [H3] [상대1] [숫자] [전화]는 지운 이름·숫자다.`;

export const HELPERNOTE_SYSTEM = `너는 발달장애인 본인이 허락해서 믿는 사람에게 보내는 알림의 '무슨 일이 있었는지' 부분을 쓴다.
입력 items의 값만 쓰고, 새 숫자를 만들지 않는다. 사람 이름을 쓰지 않는다.
상대의 의도나 행동(요구, 요청, 권유, 시킴, 가져감, 속임, 빼앗음, 협박)을 쓰지 않는다. 돈이 어떻게 움직였는지만 쓴다.
'사기', '범죄', '위험합니다', '신고하세요', '당장', '절대', '차단'을 쓰지 않는다.
존댓말 평서문 1~2문장, 합쳐 90자 이하, 물음표 없음.
JSON 한 줄만 출력한다: {"summary":"…"}`;

export function understandUser(text: string, pattern: PatternId, level: "watch" | "high"): string {
  return JSON.stringify({ text, pattern: patternName(pattern), level: LEVEL_LABEL[level] });
}

export function helperNoteUser(facts: HelperNoteFacts): string {
  return JSON.stringify(facts);
}
