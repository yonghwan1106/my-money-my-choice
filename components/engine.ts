// 화면이 쓰는 분석 엔진 진입점 — import 한 곳.
// 진짜 analyze(lib/engine/analyze.ts). 모델이 연결되면(A6) 같은 함수가 모델 단계로 돈다.
import { analyze } from "@/lib/engine/analyze";
export { analyze };

import type { AnalyzeResult, ColumnRole, ParseReport, Tx } from "@/lib/engine/types";
import { parseFile, toTxs } from "@/lib/engine/parse";

export interface Parsed {
  fileName: string;
  rows: string[][];
  report: ParseReport;
}

export async function readFile(file: File): Promise<Parsed> {
  const buf = await file.arrayBuffer();
  const { rows, report } = parseFile(buf, file.name);
  return { fileName: file.name, rows, report };
}

export async function readUrl(url: string): Promise<Parsed> {
  const r = await fetch(url, { cache: "force-cache" });
  const buf = await r.arrayBuffer();
  const name = url.split("/").pop() ?? "sample.csv";
  const { rows, report } = parseFile(buf, name);
  return { fileName: name, rows, report };
}

export function analyzeParsed(p: Parsed, mapping?: Partial<Record<number, ColumnRole>>): { result: AnalyzeResult; txs: Tx[] } {
  const { txs, report } = toTxs(p.rows, p.report, mapping);
  return { result: analyze(txs, report), txs };
}
