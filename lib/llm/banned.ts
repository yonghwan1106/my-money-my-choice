// 금지어·의도 단정 낱말·사람 이름 패턴 (구현명세 §6-7) — 카드 문안·요약·화면 문자열 시험에도 쓴다.
// 브라우저·서버 공용(외부 의존 없음).

/** 공통 금지어. */
export const BANNED_WORDS = [
  "사기", "범죄", "차단", "막았", "신고하세요", "위험합니다", "당장", "절대", "보호자", "감시", "정상인", "가짜",
] as const;

/** 상대의 의도를 단정하는 낱말(요약·카드에 늘 금지). */
export const INTENT_WORDS = [
  "요구", "요청", "권했", "권유", "시켰", "시킨", "달라고", "보내라고", "가져갔", "가져간", "속였", "속인", "빼앗", "협박",
] as const;

export function findBanned(text: string): string[] {
  return BANNED_WORDS.filter((w) => text.includes(w));
}
export function findIntent(text: string): string[] {
  return INTENT_WORDS.filter((w) => text.includes(w));
}

/** §5-1 흔한 성 목록(한 글자) + 두 글자 성. */
export const SURNAMES_1 = (
  "김 이 박 최 정 강 조 윤 장 임 한 오 서 신 권 황 안 송 류 전 홍 고 문 양 손 배 백 허 유 남 심 노 하 곽 성 차 주 우 구 " +
  "민 진 나 지 엄 채 원 천 방 공 현 함 변 염 여 추 도 소 석 선 설 마 길 연 위 표 명 기 반 왕 금 옥 육 인 맹 제 모 탁 국 어 은 편 용 예 경 봉 사 부"
).split(" ");
export const SURNAMES_2 = ["황보", "남궁", "제갈", "선우", "독고"];

/**
 * 요약에 흔히 나오는 낱말(성으로 시작하지만 사람 이름이 아닌 것).
 * 요약 문장은 짧고 낱말이 정해져 있으므로 목록으로 거른다.
 */
export const COMMON_WORDS = new Set<string>([
  "이번", "이번에", "이번에는", "이번엔", "이번주", "이번달", "이들", "이후", "이상", "이내", "이틀", "이틀만에", "이체", "이체로",
  "이어서", "이어", "이어진", "이어졌어요", "이에요", "이었어요", "이고", "이며", "이라", "이나",
  "한번", "한번에", "한주", "한달", "한달안에", "한꺼번에", "한사람", "한사람에게", "한명", "한곳",
  "같은", "모두", "모두합쳐", "합계", "합쳐", "합해", "평소", "평소에", "평소에는", "평소보다", "평소와",
  "월급", "월급이", "월급을", "월급은", "월급날", "수당", "수당이", "수당을", "수입", "수입이", "수입을", "수입뒤",
  "대출", "대출금", "대출금이", "대출금을", "현금", "현금으로", "결제", "결제가", "결제를", "요금", "요금이", "요금을",
  "주에", "주째", "주동안", "동안", "만에", "하루", "하루만에", "사흘", "사흘만에", "며칠", "며칠만에", "바로", "금방",
  "정도", "정해", "정한", "기간", "기록", "기록이", "다시", "다른", "다른곳", "다른사람", "다른사람에게", "사람", "사람에게",
  "새로", "새로운", "작은", "큰돈", "큰", "돈이", "돈을", "들어오고", "들어온", "들어왔어요", "나갔어요", "나간", "나가요",
  "보냈어요", "보낸", "보내", "찾았어요", "찾은", "썼어요", "생겼어요", "생긴", "있었어요", "없었어요", "많아요", "많이",
  "조금씩", "계속", "주", "명의", "통장", "통장에", "남은", "잔액", "가게", "가게에서", "카드", "카드로", "카드결제",
  "소액결제", "여러", "여러번", "여러날", "번", "도움", "연락", "지원", "센터", "선생님", "가족", "누나", "언니", "형", "오빠", "엄마", "아빠",
  "부모", "부모님", "친구", "이웃", "주인", "주변", "구매", "구입", "가전", "정기", "정기적", "자동", "자동이체", "자동으로",
  "전부", "전체", "전에", "전보다", "안에", "안에서", "보다", "훨씬", "아주", "모든", "처음", "처음보는",
  "하루안에", "이틀안에", "사흘안에", "만원", "천원", "억원", "원이", "원을", "원", "개", "개가", "개월", "달",
  "지난", "지난주", "지난달", "한꺼번", "주말", "오늘", "어제", "인출", "은행", "연속", "이달", "이주", "기간동안", "조금", "모두합",
]);

/** §4-6 이름 목록(가명의 이름 부분) — 이 목록이 들어 있으면 이름으로 본다. */
export const GIVEN_NAMES = (
  "민준 서준 예준 지호 주원 하준 지훈 준서 시우 은우 서연 서윤 지우 하은 민서 지민 수아 지아 채원 다은 " +
  "예린 수빈 유진 정민 영호 성민 상훈 혜진 미영 은정 경수 동현 재영 태식 수진 하늘 민수 도현 서진 지현"
).split(" ");

const JOSA = /(님에게|님께|님이|님은|님을|님|씨에게|씨가|씨는|씨|에게서|에게|한테|께서|께|에서|으로|로|이가|이는|이를|이와|가|는|은|을|를|와|과|의|도|에)$/u;
const JOSA_ONLY = new RegExp("^(?:" + JOSA.source.slice(1, -2) + ")+$", "u");
const VERB_END = /[요고다며니갔했었았던됨음함]$/u;

/**
 * 한글 토큰이 사람 이름처럼 보이는지(§6-7 no_name). 조사를 뗀 2~4자, 성 목록으로 시작, 흔한 낱말이 아님,
 * 그리고 (3자 · 「님/씨」가 붙음 · §4-6 이름이 들어 있음) 중 하나. 2자 낱말(「오늘」「인출」)을 이름으로 잘못 보지 않기 위한 조건이다.
 */
export function looksLikeName(token: string): boolean {
  return nameOf(token) !== null;
}

/** 이름처럼 보이면 조사를 뗀 이름, 아니면 null. */
export function nameOf(token: string): string | null {
  // 흔한 낱말 + 조사(「선생님에게」「이번에는」)는 이름이 아님
  for (const w of COMMON_WORDS) {
    if (w.length >= 2 && token.startsWith(w) && (token.length === w.length || JOSA_ONLY.test(token.slice(w.length)))) return null;
  }
  const honor = /(님|씨)/u.test(token.slice(2));
  const t = token.replace(JOSA, "");
  if (!/^[가-힣]{2,4}$/u.test(t)) return null;
  if (COMMON_WORDS.has(t)) return null;
  if (GIVEN_NAMES.some((g) => t.includes(g)) && (SURNAMES_1.includes(t[0]) || t.length === 2)) return t;
  if (VERB_END.test(t)) return null;
  const surname = (t.length >= 3 && SURNAMES_2.includes(t.slice(0, 2))) || SURNAMES_1.includes(t[0]);
  if (!surname) return null;
  for (const w of COMMON_WORDS) if (w.length >= 2 && t.startsWith(w)) return null;
  return t.length === 3 || honor ? t : null;
}

export function findNames(text: string): string[] {
  const tokens = text.split(/[^가-힣]+/u).filter(Boolean);
  return tokens.map(nameOf).filter((x): x is string => x !== null);
}
