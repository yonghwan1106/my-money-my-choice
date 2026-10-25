"use client";
// ⑩ 흔한 경고와 비교 (구현명세 §7-6) — 값 = data/scenarios/A_minsu.json·D_haneul.json의 compare.
// 임시: data/scenarios/<id>.json(C9)이 없으면 같은 정의(§8-1)로 예시 파일을 같은 엔진으로 분석해 계산한다.
import Link from "next/link";
import { useEffect, useState } from "react";
import type { WeekResult } from "@/lib/engine/types";
import { krw } from "@/lib/engine/format";
import { analyzeParsed, readUrl } from "./engine";
import { SCENARIO_COMPARE } from "./scenarioData";

export interface CompareA {
  b0_first_week: number | null;
  b0_first_max_krw: number | null;
  model_first_week: number | null;
  model_first_level: string | null;
  model_first_max_krw: number | null;
}
export interface CompareD {
  fridge_week: number | null;
  b0: boolean | null;
  model_level: string | null;
}

type TxLite = { id: string; amount: number; category: string };
const OUT_CATS = ["transfer_out", "cash_withdraw", "card_daily", "micro_payment"];

function maxOut(w: WeekResult, txs: TxLite[]): number | null {
  const ids = new Set(w.txIds);
  const outs = txs.filter((t) => ids.has(t.id) && t.amount < 0 && OUT_CATS.includes(t.category)).map((t) => -t.amount);
  return outs.length ? Math.max(...outs) : null;
}

export function computeCompareA(weeks: WeekResult[], txs: TxLite[]): CompareA {
  const b0 = weeks.find((w) => w.b0) ?? null;
  const m = weeks.find((w) => w.level === "watch" || w.level === "high") ?? null;
  return {
    b0_first_week: b0?.week ?? null,
    b0_first_max_krw: b0 ? maxOut(b0, txs) : null,
    model_first_week: m?.week ?? null,
    model_first_level: m?.level ?? null,
    model_first_max_krw: m ? maxOut(m, txs) : null,
  };
}

export function computeCompareD(weeks: WeekResult[], txs: TxLite[]): CompareD {
  // 냉장고 = 가장 큰 카드 결제가 든 주
  const cards = txs.filter((t) => t.category === "card_daily" && t.amount < 0);
  if (cards.length === 0) return { fridge_week: null, b0: null, model_level: null };
  const big = cards.reduce((a, b) => (b.amount < a.amount ? b : a));
  const w = weeks.find((x) => x.txIds.includes(big.id)) ?? null;
  return { fridge_week: w?.week ?? null, b0: w ? w.b0 : null, model_level: w?.level ?? null };
}

function modelText(level: string | null): string {
  if (level === "watch") return "물어보고, '내가 하고 싶어서 했어요'를 누르면 끝";
  if (level === "high") return "'위험이 높아요'로 물어봐요";
  return "묻지 않아요";
}

export function CompareBoard() {
  const [a, setA] = useState<CompareA | null>(SCENARIO_COMPARE.A);
  const [d, setD] = useState<CompareD | null>(SCENARIO_COMPARE.D);
  useEffect(() => {
    if (a && d) return;
    let alive = true;
    (async () => {
      const [pa, pd] = await Promise.all([readUrl("/samples/A_minsu_f1.csv"), readUrl("/samples/D_haneul_f1.csv")]);
      const ra = analyzeParsed(pa).result;
      const rd = analyzeParsed(pd).result;
      if (!alive) return;
      setA(computeCompareA(ra.weeks, ra.txs));
      setD(computeCompareD(rd.weeks, rd.txs));
    })();
    return () => {
      alive = false;
    };
  }, [a, d]);

  const showA =
    a && a.b0_first_week !== null && a.model_first_week !== null && a.model_first_week < a.b0_first_week;
  return (
    <section className="mt-5" data-testid="compare-board">
      {!a || !d ? <p className="text-muted">계산하는 중이에요.</p> : null}
      {a && d ? (
        <div className="overflow-hidden rounded-2xl border border-line bg-white">
          <table className="w-full table-fixed border-collapse text-[1rem]">
            <thead>
              <tr className="bg-soft text-left align-bottom">
                <th className="w-[28%] px-2 py-2"> </th>
                <th className="px-2 py-2">30만 원이 넘으면 울리는 경고</th>
                <th className="px-2 py-2 text-accent">이 AI</th>
              </tr>
            </thead>
            <tbody>
              {showA ? (
                <tr className="border-t border-line align-top" data-testid="compare-row-a">
                  <th className="px-2 py-3 text-left">처음 알아챈 때 (민수 씨)</th>
                  <td className="px-2 py-3">
                    {a.b0_first_week}주 — {a.b0_first_max_krw !== null ? `${krw(a.b0_first_max_krw)}이 나간 뒤` : ""}
                  </td>
                  <td className="px-2 py-3 font-semibold">
                    {a.model_first_week}주 — {a.model_first_max_krw !== null ? `${krw(a.model_first_max_krw)}을 보내기 시작한 주` : ""}
                  </td>
                </tr>
              ) : null}
              <tr className="border-t border-line align-top" data-testid="compare-row-d">
                <th className="px-2 py-3 text-left">냉장고를 샀을 때 (하늘 씨)</th>
                <td className="px-2 py-3">{d.b0 ? "경고가 울려요" : "울리지 않아요"}</td>
                <td className="px-2 py-3 font-semibold">{modelText(d.model_level)}</td>
              </tr>
            </tbody>
          </table>
        </div>
      ) : null}
      <p className="mt-4">가상 데이터 기준이에요. 다른 경우에는 결과가 다를 수 있어요. 전체 성적은 AI 성적표에서 볼 수 있어요.</p>
      <Link href="/eval" className="btn btn-primary mt-4">
        AI 성적표
      </Link>
    </section>
  );
}
