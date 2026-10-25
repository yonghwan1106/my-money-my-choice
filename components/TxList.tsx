// ④ 거래 기록 탭 (구현명세 §7-4) — 이 앱 자체 목록(은행 앱을 흉내 내지 않음). 카드가 있는 주의 거래는 왼쪽 색 띠.
import type { Level, Tx, WeekResult } from "@/lib/engine/types";
import { fmtDay } from "@/lib/engine/dates";
import { LEVEL_COLOR } from "./Timeline";

const won = (n: number) => `${Math.abs(n).toLocaleString("ko-KR")}원`;

export function TxList({ txs, weeks, shownUpTo }: { txs: Tx[]; weeks: WeekResult[]; shownUpTo: number }) {
  const weekOf = new Map<string, WeekResult>();
  for (const w of weeks) for (const id of w.txIds) weekOf.set(id, w);
  const rows = txs
    .map((t) => ({ t, w: weekOf.get(t.id) }))
    .filter((x) => !x.w || x.w.week <= shownUpTo)
    .reverse();
  return (
    <section className="mt-3" data-testid="tx-list">
      <ul className="flex flex-col divide-y divide-line overflow-hidden rounded-2xl border border-line bg-white">
        {rows.map(({ t, w }) => {
          const lvl: Level | null = w && (w.level === "watch" || w.level === "high") ? w.level : null;
          return (
            <li
              key={t.id}
              className="flex gap-3 py-2 pl-3 pr-3"
              style={{ borderLeft: `6px solid ${lvl ? LEVEL_COLOR[lvl] : "transparent"}` }}
              data-tx={t.id}
              data-level={lvl ?? ""}
            >
              <div className="min-w-0 flex-1">
                <p className="text-[1rem] text-muted">
                  {fmtDay(t.day)}
                  {t.minute !== null ? ` ${String(Math.floor(t.minute / 60)).padStart(2, "0")}:${String(t.minute % 60).padStart(2, "0")}` : ""}
                </p>
                <p className="truncate font-semibold">{t.cpLabel ?? <span className="text-muted">누구인지 모름</span>}</p>
                <p className="truncate text-[1rem] text-muted">{t.memo}</p>
              </div>
              <div className="shrink-0 text-right">
                <p className={`font-bold ${t.amount < 0 ? "" : "text-accent"}`}>
                  {t.amount < 0 ? "나간 돈 " : "들어온 돈 "}
                  {won(t.amount)}
                </p>
                {t.balance !== null ? <p className="text-[1rem] text-muted">남은 돈 {won(t.balance)}</p> : null}
              </div>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
