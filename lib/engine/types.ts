export type Category =
  | "income_salary" | "income_benefit" | "transfer_out" | "transfer_in" | "cash_withdraw"
  | "card_daily" | "bill_recurring" | "telecom" | "micro_payment" | "loan_in" | "loan_repay" | "unknown";
export type CpType = "person" | "merchant" | "biller" | "lender" | "employer" | "agency";

export interface Tx {
  id: string;              // "r" + 원본 행 번호(1부터)
  day: number;             // 일 번호 = Date.UTC(y, m - 1, d) / 86400000  (new Date(문자열) 금지)
  minute: number | null;   // 0~1439, 시각 없으면 null
  amount: number;          // 원. 출금 음수, 입금 양수
  balance: number | null;
  memo: string;            // 적요 + " " + 기재내용 (기기 안에서만)
  branch: string | null;   // 거래점·거래기점·구분
  category: Category;
  cpKey: string | null;    // "cp_01"… / null = 누구인지 모름
  cpLabel: string | null;  // 화면용 원래 이름(서버로 보내지 않음)
  cpType: CpType | null;
}
export type ColumnRole = "datetime" | "date" | "time" | "memo" | "memo2" | "out" | "in" | "amount" | "io_sign"
  | "balance" | "branch" | "ignore" | "unknown";
export interface ParseReport {
  encoding: "utf-8" | "euc-kr" | "xlsx";
  headerRow: number;
  columns: { index: number; header: string; role: ColumnRole; confident: boolean }[];
  rowsRead: number; rowsSkipped: number;
  missingRequired: ("datetime_or_date" | "amount")[];   // 비어 있지 않으면 분석 시작 안 함
  unknownCategoryShare: number;                          // 0~1
  firstDay: number | null; lastDay: number | null;
}
export type SignalId = "S1" | "S2" | "S3" | "S4" | "S5" | "S6" | "S7" | "S8" | "S9" | "S10";
export interface Facts {
  cum_count?: number; cum_weeks?: number; cum_total_krw?: number; cp_is_new?: boolean;
  week_total_krw?: number; usual_week_krw?: number; usual_week_count?: number; week_count?: number;
  income_kind?: "salary" | "benefit"; income_krw?: number; out_after_income_krw?: number; hours?: number;
  out_mode?: "transfer" | "cash"; loan_krw?: number; new_bills?: number; usual_bills?: number;
  micro_count?: number; micro_total_krw?: number; usual_micro_count?: number;
  leak_weeks?: number; leak_excess_krw?: number; leak_mode?: "transfer" | "cash";
  big_krw?: number; big_category?: "card" | "transfer" | "cash"; big_place?: string | null; usual_big_krw?: number;
  salary_day?: number; salary_mode?: "missing" | "returned"; balance_low?: boolean;
}
export interface SignalResult { id: SignalId; value: number | null; fired: boolean; facts: Facts; cpKeys: string[]; }
export type Level = "normal" | "watch" | "high" | "insufficient";
export type PatternId = "loan_passthrough" | "new_phone_bills" | "salary_cut" | "same_person" | "after_income"
  | "micro_repeat" | "slow_leak" | "big_spend";
export interface WeekResult {
  week: number;                 // 1부터 (파일 첫 거래일이 든 주의 월요일 = 1주)
  weekStartDay: number;
  baselineWeeks: number;        // 깨끗한 평소 주 수 0~8
  signals: SignalResult[];      // 항상 10개, S1~S10 순서
  anyFired: boolean;
  features: number[];           // FEATURE_NAMES 순서 22개
  prob: number | null;          // 보정 확률, 판단 보류면 null
  level: Level;
  pattern: PatternId | null;    // 첫째 수법(카드 제목·첫 줄)
  pattern2: PatternId | null;   // 둘째 수법(카드 둘째 줄)
  facts: Facts;                 // 첫째·둘째 수법 facts 합침
  cpKeys: string[];             // 켜진 신호에 걸린 상대방
  hasCp: boolean;
  why: { feature: string; label: string; contribution: number }[];   // 상위 3개
  txIds: string[];
  outflow_krw: number;          // 그 주 「필수 아님」 출금 합(송금+현금+소액결제) — 타임라인 y
  band: { lo: number; mid: number; hi: number } | null;  // 평소 범위
  b0: boolean;                  // B0 고정 금액 규칙 경고
  b3: number;                   // 켜진 신호 수
}
export interface Counterparty { cpKey: string; label: string; type: CpType; firstDay: number; txCount: number; outKrw: number; inKrw: number; }
export interface AnalyzeResult { weeks: WeekResult[]; txs: Tx[]; counterparties: Counterparty[]; report: ParseReport; modelVersion: "gbm-v1" | "lr-v1" | "none"; }

export type Relation = "family" | "center" | "activity" | "other";
export type HelperId = "h1" | "h2" | "h3";
export type LinkState = { state: "linked"; cpKey: string } | { state: "not_in_list" } | { state: "unknown" };
export interface Helper { id: HelperId; alias: string; relation: Relation; scope: "high_only" | "none"; excludePatterns: PatternId[]; link: LinkState; }
export interface Settings { consent: boolean; displayName: string; helpers: Helper[]; predelegate: { enabled: boolean; helperId: HelperId | null }; }

export type Answer = "my_choice" | "not_sure" | "someone_told";
export type UnderstandLabel = "my_choice" | "asked_by_someone" | "threatened" | "not_sure" | "unclear";
export type Picture = "money_send" | "cash" | "loan" | "phone" | "card_pay" | "salary" | "salary_cut" | "leak" | "big" | "question";
export interface AskCard { kind: "ask"; eventId: string; picture: Picture; title: string; lines: [string, string]; question: string; footer: string; }
export interface ExplainCard { kind: "explain"; picture: Picture; lines: [string, string, string]; }

export type Step =
  | { kind: "no_card"; reason: "insufficient" | "normal" | "suppressed" }
  | { kind: "ask"; card: AskCard }
  | { kind: "understand_confirm"; label: UnderstandLabel; mapped: Answer | null; evidence: string; mode: UnderstandResponse["mode"] }
  | { kind: "who"; helperIds: HelperId[] }
  | { kind: "explain"; card: ExplainCard }
  | { kind: "help_offer" }
  | { kind: "help_pick"; helperIds: HelperId[] }
  | { kind: "involved_notice"; helperIds: HelperId[] }
  | { kind: "relation_check"; helperId: HelperId }
  | { kind: "notify_choice"; helperIds: HelperId[]; multi: boolean; also: boolean }
  | { kind: "preview"; messages: { helperId: HelperId; type: "alert" | "help_request" }[] }
  | { kind: "decline_ack"; reaskDay: number }
  | { kind: "reask"; helperIds: HelperId[] }
  | { kind: "predelegated_sent"; helperId: HelperId }
  | { kind: "counsel_offer"; reason: "repeat" | "threat" | "no_helper" }
  | { kind: "counsel_info" }
  | { kind: "later_ack" }
  | { kind: "done" };
export type UserInput =
  | { type: "answer"; answer: Answer }
  | { type: "understood"; label: UnderstandLabel; evidence: string; mode: UnderstandResponse["mode"] }
  | { type: "understand_reply"; ok: boolean }      // [맞아요]=true / [아니에요, 버튼으로 고를게요]=false
  | { type: "later" }                               // [나중에 답할게요]
  | { type: "continue" }                            // 설명·안내·미리보기 화면의 [다음]
  | { type: "who"; pick: HelperId | "other" | "no_say" }
  | { type: "relation"; reply: "no" | "yes" | "dont_know" }
  | { type: "notify"; pick: HelperId[] }            // 빈 배열 = [이번엔 알리지 마요]
  | { type: "help"; want: boolean }
  | { type: "help_pick"; pick: HelperId[] }
  | { type: "counsel"; yes: boolean };
export interface PolicyMemory {
  day: number;
  highWeeks: { week: number; pattern: PatternId | null; cpKeys: string[] }[];   // 모델 단계 high인 주(답과 무관)
  suppress: { key: string; untilDay: number }[];
  counselOffered: { key: string; day: number }[];
  reasks: { eventId: string; atDay: number; helperIds: HelperId[]; used: boolean }[];
  tray: string[];
}

// /api 계약
export interface UnderstandRequest { prompt_version: "understand-v1"; text: string; pattern: PatternId; level: "watch" | "high"; }
export interface UnderstandResponse { mode: "live" | "cache" | "precomputed" | "rule"; label: UnderstandLabel; evidence: string; validator: { passed: boolean; checks: Record<string, boolean> }; }
export interface HelperNoteFacts { pattern_label: string; level_label: string; period: string; items: Record<string, string>; } // 값은 코드가 서식한 문자열("147만 원","3주","하루 만에")
export interface HelperNoteRequest { prompt_version: "helpernote-v1"; pattern: PatternId; level: "watch" | "high"; facts: HelperNoteFacts; }
export interface HelperNoteResponse { mode: "live" | "cache" | "precomputed" | "template"; summary: string; validator: { passed: boolean; checks: Record<string, boolean> }; }
export interface HealthResponse { ok: true; llm: "live" | "demo"; model: string; version: string; limits: { rpm_per_ip: number; daily_per_instance: number }; }
