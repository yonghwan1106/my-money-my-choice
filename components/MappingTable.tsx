"use client";
// ④ 열 인식 표 (구현명세 §7-4) — 열 이름 → 뜻. 못 찾은 열은 빨간 글씨 「모름」 + 드롭다운.
import Link from "next/link";
import type { ColumnRole, ParseReport } from "@/lib/engine/types";

export const ROLE_LABEL: Record<Exclude<ColumnRole, "unknown">, string> = {
  datetime: "날짜와 시간",
  date: "날짜",
  time: "시간",
  memo: "내용",
  memo2: "내용 2",
  out: "나간 돈",
  in: "들어온 돈",
  amount: "금액",
  io_sign: "입금·출금 구분",
  balance: "남은 돈",
  branch: "거래한 곳",
  ignore: "쓰지 않음",
};
const ROLE_ORDER = Object.keys(ROLE_LABEL) as Exclude<ColumnRole, "unknown">[];

export function MappingTable({
  rows,
  report,
  onChange,
  onAnalyze,
  failures,
  fileName,
}: {
  rows: string[][];
  report: ParseReport;
  onChange: (index: number, role: ColumnRole) => void;
  onAnalyze: () => void;
  failures: number;
  fileName: string;
}) {
  const sample = rows.slice(report.headerRow + 1).find((r) => r.some((c) => c !== "")) ?? [];
  const blocked = report.missingRequired.length > 0;
  return (
    <section data-testid="mapping-table">
      <h2 className="h2 mt-2">열 이름 확인</h2>
      <p className="small mt-1 break-all">{fileName}</p>
      <div className="mt-3 overflow-hidden rounded-2xl border border-line bg-white">
        <table className="w-full table-fixed border-collapse text-[1rem]">
          <thead>
            <tr className="bg-soft text-left">
              <th className="w-[34%] px-2 py-2 font-bold">열 이름</th>
              <th className="w-[66%] px-2 py-2 font-bold">뜻</th>
            </tr>
          </thead>
          <tbody>
            {report.columns.map((c) => {
              const unknown = c.role === "unknown";
              return (
                <tr key={c.index} className="border-t border-line align-top" data-testid={`map-row-${c.index}`}>
                  <td className="px-2 py-2">
                    <div className="font-semibold break-all">{c.header || `${c.index + 1}번째 열`}</div>
                    {sample[c.index] ? <div className="truncate text-muted">{sample[c.index]}</div> : null}
                  </td>
                  <td className="px-2 py-2">
                    {unknown ? (
                      <div className="mb-1 font-bold text-[#b42318]" data-testid="role-unknown">
                        모름
                      </div>
                    ) : null}
                    <select
                      className="field !min-h-[48px] !text-[1rem]"
                      aria-label={`${c.header || c.index + 1} 열의 뜻`}
                      value={unknown ? "" : c.role}
                      onChange={(e) => onChange(c.index, (e.target.value || "unknown") as ColumnRole)}
                    >
                      {unknown ? <option value="">모름</option> : null}
                      {ROLE_ORDER.map((r) => (
                        <option key={r} value={r}>
                          {ROLE_LABEL[r]}
                        </option>
                      ))}
                    </select>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {blocked ? (
        <p className="mt-3 font-bold text-[#b42318]" role="alert">
          날짜와 금액 열을 골라 주세요
        </p>
      ) : null}
      <button type="button" className="btn btn-primary mt-4" disabled={blocked} onClick={onAnalyze}>
        분석하기
      </button>
      {failures >= 2 ? (
        <Link href="/demo" className="btn btn-secondary mt-3">
          예시 파일로 해 보기
        </Link>
      ) : null}
    </section>
  );
}
