// 기준선 B0·B3 (구현명세 §5-3, 설계서 §11-3)
// B0 = 흔한 고정 금액 규칙: 송금·현금 인출·카드·소액결제 1회 ≥ 30만 원, 또는 하루 송금 ≥ 3회 (자동이체·통신·대출 상환 제외)
// B3 = 켜진 신호 수 (1 = 살펴보기, 2 이상 = 위험이 높아요)
import type { Category, SignalResult, Tx } from "./types";

const B0_CATS: Category[] = ["transfer_out", "cash_withdraw", "card_daily", "micro_payment"];
export const B0_AMOUNT = 300_000;
export const B0_DAILY_TRANSFERS = 3;

export function b0Of(txs: Tx[]): boolean {
  const perDay = new Map<number, number>();
  for (const t of txs) {
    if (t.amount >= 0 || !B0_CATS.includes(t.category)) continue;
    if (Math.abs(t.amount) >= B0_AMOUNT) return true;
    if (t.category === "transfer_out") {
      const n = (perDay.get(t.day) ?? 0) + 1;
      if (n >= B0_DAILY_TRANSFERS) return true;
      perDay.set(t.day, n);
    }
  }
  return false;
}

export function b3Of(signals: SignalResult[]): number {
  let n = 0;
  for (const s of signals) if (s.fired) n++;
  return n;
}
