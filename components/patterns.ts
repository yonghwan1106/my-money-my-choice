// 수법 이름과 「이럴 때는 알리지 않아요」 체크 문구 (구현명세 §7-3 4번·§7-9)
import type { PatternId } from "@/lib/engine/types";

/** 설정 화면 체크 문구 — 이 순서로 보인다 */
export const EXCLUDE_OPTIONS: { id: PatternId; label: string }[] = [
  { id: "same_person", label: "같은 사람에게 여러 번 보낼 때" },
  { id: "after_income", label: "수입이 금방 나갈 때" },
  { id: "loan_passthrough", label: "대출금이 바로 나갈 때" },
  { id: "new_phone_bills", label: "새 휴대폰 요금이 생길 때" },
  { id: "salary_cut", label: "월급이 달라질 때" },
  { id: "micro_repeat", label: "소액결제가 많을 때" },
  { id: "slow_leak", label: "돈이 조금씩 계속 나갈 때" },
  { id: "big_spend", label: "큰 돈을 한 번에 쓸 때" },
];

/** 수법 이름(도움 요청·요약·설정) — same_person은 cum = 1이면 「처음 돈을 보낸 사람」 */
export const PATTERN_NAME: Record<PatternId, string> = {
  same_person: "같은 사람에게 여러 번",
  after_income: "수입이 금방 나감",
  loan_passthrough: "대출금이 바로 나감",
  new_phone_bills: "새 휴대폰 요금",
  salary_cut: "월급이 달라짐",
  micro_repeat: "작은 결제가 많음",
  slow_leak: "조금씩 계속 나감",
  big_spend: "평소보다 큰 지출",
};
