// L0 사전 (구현명세 §5-1). 외부 패키지 의존 없음.
// 범주 사전 낱말은 실제 은행 적요를 맞추려는 것이며 화면에 쓰지 않는다.
import type { Category, ColumnRole } from "./types";

/** 열 동의어 (공백 제거 후 비교) */
export const COLUMN_SYNONYMS: { role: ColumnRole; names: string[] }[] = [
  { role: "datetime", names: ["거래일시", "거래일자시간"] },
  { role: "date", names: ["거래일자", "일자", "날짜", "거래일"] },
  { role: "time", names: ["시간", "거래시간", "거래시각"] },
  { role: "memo", names: ["적요", "내용", "거래내용", "받는분/보낸분", "받는분", "보낸분"] },
  { role: "memo2", names: ["기재내용", "메모", "비고", "상대방"] },
  { role: "out", names: ["찾으신금액", "출금액", "출금", "지급금액", "보낸금액", "출금금액"] },
  { role: "in", names: ["맡기신금액", "입금액", "입금", "받은금액", "입금금액"] },
  { role: "amount", names: ["거래금액", "금액"] },
  { role: "io_sign", names: ["입출금구분", "구분"] },
  { role: "balance", names: ["잔액", "거래후잔액"] },
  { role: "branch", names: ["거래점", "거래기점", "거래구분", "처리점"] },
];

export function normHeader(s: string): string {
  return String(s ?? "").replace(/^﻿/, "").replace(/\s+/g, "");
}

/** 머리 글자 → 역할 (모르면 null) */
export function roleOfHeader(h: string): ColumnRole | null {
  const n = normHeader(h);
  if (!n) return null;
  for (const { role, names } of COLUMN_SYNONYMS) {
    if (names.includes(n)) return role;
  }
  return null;
}

/** 범주 사전 — 위에서부터 첫 일치. dir: 입금(in)·출금(out)·둘 다(any) */
export const CATEGORY_RULES: { category: Category | "transfer"; dir: "in" | "out" | "any"; re: RegExp }[] = [
  { category: "loan_in", dir: "in", re: /대출|카드론|캐피탈|저축은행|마이너스|론입금/ },
  { category: "loan_repay", dir: "out", re: /대출상환|원리금|이자|카드론상환/ },
  // 「생계급여」「주거급여」는 규칙 4(수당)가 뜻한 것이라 규칙 3에서 뺀다(명세 순서상 「급여」에 먼저 걸리는 것을 막음)
  { category: "income_salary", dir: "in", re: /(?<!생계|주거)급여|월급|임금|상여|보호작업장/ },
  { category: "income_benefit", dir: "in", re: /연금|수당|생계급여|주거급여|기초|바우처/ },
  { category: "telecom", dir: "out", re: /통신|모바일요금|텔레콤|휴대폰|핸드폰|단말기|할부금/ },
  { category: "bill_recurring", dir: "out", re: /자동이체|월세|관리비|공과금|전기|가스|수도|보험|지로|아파트/ },
  { category: "micro_payment", dir: "out", re: /소액결제|앱결제|게임|충전|콘텐츠|인앱|구글|애플/ },
  { category: "cash_withdraw", dir: "out", re: /ATM|CD출금|현금|자동화기기|출금기/ },
  {
    category: "card_daily",
    dir: "out",
    re: /체크|카드|가맹|편의점|마트|분식|버스|철도|약국|카페|식당|빵|국밥|밥상|문구|안경|미용|세탁|꽃|정형외과|치과|정육/,
  },
  { category: "transfer", dir: "any", re: /이체|송금|타행|인터넷뱅킹|모바일뱅킹|오픈뱅킹|스마트뱅킹/ },
];

/** §4-6 가게 이름(지어낸 일반 이름) — card_daily 판별용 */
export const STORE_NAMES: string[] = [
  "동네편의점", "골목마트", "새싹분식", "따끈국밥", "소담밥상", "늘봄빵집", "별빛카페", "시내버스", "마을버스", "도시철도",
  "동네약국", "초록문구", "바른안경", "하늘미용실", "동네세탁소", "푸른가전", "꽃길꽃집", "튼튼정형외과", "맑은치과", "우리동네정육점",
];
export const STORE_RE = /예시상점\d*/;

/** 흔한 성 목록 (§5-1) */
export const SURNAMES_1: string =
  "김이박최정강조윤장임한오서신권황안송류전홍고문양손배백허유남심노하곽성차주우구민진나지엄채원천방공현함변염여추도소석선설마길연위표명기반왕금옥육인맹제모탁국어은편용예경봉사부";
export const SURNAMES_2: string[] = ["황보", "남궁", "제갈", "선우", "독고"];

/** 상대방 이름을 뽑을 때 지우는 일반 낱말 (긴 것부터) */
export const GENERIC_WORDS: string[] = [
  "인터넷뱅킹", "모바일뱅킹", "오픈뱅킹", "스마트뱅킹", "타행이체", "자동이체", "체크카드", "카드결제", "신용카드",
  "단말기할부", "할부금", "모바일", "인터넷", "타행", "이체", "송금", "입금", "출금", "체크", "결제", "급여", "월급",
  "상여", "대출금", "대출", "론입금", "지로", "CMS", "펌뱅킹", "폰뱅킹", "창구",
];

/** 사람 이름이 아닌 흔한 2~4자 낱말 (성 글자로 시작하지만 이름이 아님) */
export const NOT_NAME_WORDS: string[] = [
  "이체", "송금", "입금", "출금", "결제", "급여", "월급", "수당", "연금", "현금", "대출", "이자", "자동이체", "공과금",
  "관리비", "전기", "가스", "수도", "보험", "지로", "통신", "카드", "체크", "기초", "생계급여", "주거급여", "장애수당",
  "장애인연금", "인터넷", "모바일", "타행", "정기", "적금", "예금", "환불", "취소", "이월", "이자입금", "선물",
  "용돈", "생활비", "병원", "약국", "편의점", "마트", "식당", "카페", "구독", "충전", "장보기", "정산", "회비",
  "기타", "미상", "본인", "전입", "전출", "서비스", "주유", "주차", "부가", "할부",
];

/** 이름에 잘 안 들어가는 낱말 조각(가게·기관·거래 낱말) */
export const NOT_NAME_PARTS =
  /거래|기타|결제|상점|센터|회사|사무|가게|식당|병원|의원|학교|교회|공단|공사|은행|조합|협회|재단|복지|시청|구청|주민|요금|수수료|환급|환불|적금|예금|페이|작업장|마트|상회|약국|세탁|미용|문구|안경|정육|치과/;

/** 사람 이름처럼 생겼는지 (§5-1: 공백·괄호·「님」·「(주)」 제거 뒤 한글 2~4자, 첫 글자가 흔한 성, 사전 낱말 아님) */
export function isPersonName(raw: string): boolean {
  const s = cleanName(raw);
  if (!/^[가-힣]{2,4}$/.test(s)) return false;
  const two = SURNAMES_2.some((p) => s.startsWith(p));
  if (two) {
    if (s.length < 3) return false;
  } else if (!SURNAMES_1.includes(s[0])) {
    return false;
  }
  if (NOT_NAME_WORDS.includes(s)) return false;
  if (NOT_NAME_PARTS.test(s)) return false;
  if (STORE_NAMES.includes(s)) return false;
  for (const r of CATEGORY_RULES) if (r.re.test(s)) return false;
  return true;
}

/** 이름 비교용 정리: 공백·괄호·「님」·「(주)」 제거 */
export function cleanName(raw: string): string {
  return String(raw ?? "")
    .replace(/\(주\)|㈜|주식회사/g, "")
    .replace(/[\s()[\]{}<>]/g, "")
    .replace(/님$/, "");
}
