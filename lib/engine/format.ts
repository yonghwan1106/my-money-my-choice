// 숫자 표기 (구현명세 §6-4) — 카드·요약의 숫자는 모두 여기서 서식한다.
// 「%」·소수점·「배」를 만들지 않는다.

function withComma(n: number): string {
  const s = String(Math.trunc(n));
  return s.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
}

/** ≥10,000원: 만 원 단위 반올림(「147만 원」, 9,999만 넘으면 「1억 2천만 원」) · <10,000원: 천 원 단위(「6천 원」). */
export function krw(n: number): string {
  const v = Math.round(Math.abs(Number.isFinite(n) ? n : 0));
  if (v >= 9_500) {
    const man = Math.round(v / 10_000);
    if (man <= 9_999) return `${withComma(Math.max(man, 1))}만 원`;
    const eok = Math.floor(man / 10_000);
    const rest = man % 10_000;
    if (rest === 0) return `${withComma(eok)}억 원`;
    if (rest % 1_000 === 0) return `${withComma(eok)}억 ${rest / 1_000}천만 원`;
    return `${withComma(eok)}억 ${withComma(rest)}만 원`;
  }
  if (v >= 500) return `${Math.round(v / 1_000)}천 원`;
  return `${v}원`;
}

/** 「3주」 (1주 미만은 「며칠」). */
export function period(weeks: number): string {
  if (!Number.isFinite(weeks) || weeks < 1) return "며칠";
  return `${Math.round(weeks)}주`;
}

/** ≤24 「하루 만에」, ≤48 「이틀 만에」, ≤72 「사흘 만에」, 그 밖 「며칠 만에」. */
export function within(hours: number): string {
  if (!Number.isFinite(hours)) return "며칠 만에";
  if (hours <= 24) return "하루 만에";
  if (hours <= 48) return "이틀 만에";
  if (hours <= 72) return "사흘 만에";
  return "며칠 만에";
}

export function incomeWord(kind: "salary" | "benefit"): "월급" | "수당" {
  return kind === "benefit" ? "수당" : "월급";
}

/** 횟수·개수 표기(정수). */
export function count(n: number | undefined): number {
  return Math.max(0, Math.round(Number.isFinite(n as number) ? (n as number) : 0));
}
