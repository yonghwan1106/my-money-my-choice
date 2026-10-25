// server-only — 프롬프트 초판 (구현명세 §6-6). 고칠 때는 개발 문장 40개로만 확인하고 prompt_version을 올린다.
import type { HelperNoteFacts, PatternId } from "../engine/types";
import { LEVEL_LABEL, patternName } from "../engine/templates";

export const UNDERSTAND_VERSION = "understand-v1" as const;
export const HELPERNOTE_VERSION = "helpernote-v2" as const;

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

// helpernote-v2 (2026-10-25 Advisor 결정): 문체 「~어요」 하나로, 숫자 단위·items 키의 뜻 그대로, 조언·권유·약속 금지(사실 요약만).
// v1과 달라진 줄: 「숫자는 …단위까지」「items의 키는 …(「더」 포함)」「조언·권유…」「모든 문장을 …」. 확인은 개발 문장(val 나눔)으로만 했다.
export const HELPERNOTE_SYSTEM = `너는 발달장애인 본인이 허락해서 믿는 사람에게 보내는 알림의 '무슨 일이 있었는지' 부분을 쓴다.
입력 period와 items의 값만 쓰고, 새 숫자를 만들지 않는다. 사람 이름을 쓰지 않는다.
숫자는 값에 적힌 그대로 단위까지 옮긴다(「5주」는 「5주」, 「4번」은 「4번」, 「147만 원」은 「147만 원」). 주·일·개월·번·원 같은 단위를 바꾸거나 다른 숫자에 붙이지 않는다.
items의 키는 그 값이 무엇인지 알려 준다. 키의 뜻을 바꾸지 않는다(「…더 나간 돈」을 나간 돈 전체처럼, 「같은 사람에게 보낸 합계」를 모든 지출처럼 쓰지 않는다). 값 뒤에 「더」를 붙이는 것은 키에 「더」가 든 값만이다(「금액」과 「평소 한 번」은 두 값을 따로 쓰고 차이로 바꾸지 않는다).
상대의 의도나 행동(요구, 요청, 권유, 시킴, 가져감, 속임, 빼앗음, 협박)을 쓰지 않는다. 돈이 어떻게 움직였는지 사실만 쓴다.
받는 사람에게 하는 조언·권유·부탁·약속·걱정을 쓰지 않는다(「살펴봐 주세요」「확인해 주세요」「함께」「도와」「필요해요」 같은 말 금지).
'사기', '범죄', '위험합니다', '신고하세요', '당장', '절대', '차단'을 쓰지 않는다.
모든 문장을 「~어요」로 끝낸다(나갔어요, 들어왔어요, 생겼어요, 돈이에요). 「~습니다」「~니다」를 쓰지 않는다.
평서문 1~2문장, 합쳐 90자 이하, 물음표 없음.
JSON 한 줄만 출력한다: {"summary":"…"}`;

export function understandUser(text: string, pattern: PatternId, level: "watch" | "high"): string {
  return JSON.stringify({ text, pattern: patternName(pattern), level: LEVEL_LABEL[level] });
}

export function helperNoteUser(facts: HelperNoteFacts): string {
  return JSON.stringify(facts);
}
