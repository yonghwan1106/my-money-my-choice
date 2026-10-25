// L0 파일 해석 (구현명세 §5-1). 브라우저·Node 공용. 외부 패키지는 XLSX 읽기(SheetJS)만.
// Node 스크립트는 fs.readFileSync 버퍼를 ArrayBuffer로 넘긴다:
//   const b = fs.readFileSync(p); parseFile(b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength), p)
import * as XLSX from "xlsx";
import type { ColumnRole, ParseReport, Tx } from "./types";
import { roleOfHeader } from "./lexicon";
import { parseDateTime, parseTime } from "./dates";
import { categorize } from "./categorize";
import { assignCounterparties } from "./counterparty";

/** 한 역할에 한 열만 쓰는 역할 */
const SINGLE_ROLES: ColumnRole[] = ["datetime", "date", "time", "memo", "memo2", "out", "in", "amount", "io_sign", "balance", "branch"];

// ---------- CSV ----------
/** 따옴표·쉼표·줄바꿈 처리. 구분자는 쉼표(첫 줄에 탭이 더 많으면 탭). */
export function parseCsvText(text: string): string[][] {
  let s = String(text ?? "");
  if (s.charCodeAt(0) === 0xfeff) s = s.slice(1);
  const firstLine = s.slice(0, Math.max(0, s.indexOf("\n")) || s.length);
  const delim = (firstLine.match(/\t/g)?.length ?? 0) > (firstLine.match(/,/g)?.length ?? 0) ? "\t" : ",";
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let inQ = false;
  for (let i = 0; i < s.length; i++) {
    const ch = s[i];
    if (inQ) {
      if (ch === '"') {
        if (s[i + 1] === '"') {
          cell += '"';
          i++;
        } else inQ = false;
      } else cell += ch;
      continue;
    }
    if (ch === '"' && cell.trim() === "") {
      inQ = true;
      cell = "";
    } else if (ch === delim) {
      row.push(cell);
      cell = "";
    } else if (ch === "\r") {
      // \r\n 또는 \r 단독
      row.push(cell);
      rows.push(row);
      row = [];
      cell = "";
      if (s[i + 1] === "\n") i++;
    } else if (ch === "\n") {
      row.push(cell);
      rows.push(row);
      row = [];
      cell = "";
    } else cell += ch;
  }
  if (cell !== "" || row.length > 0) {
    row.push(cell);
    rows.push(row);
  }
  return rows.map((r) => r.map((c) => c.trim()));
}

// ---------- 인코딩 ----------
function isXlsx(bytes: Uint8Array, fileName: string): boolean {
  if (/\.(xlsx|xls)$/i.test(fileName)) return true;
  return bytes.length > 3 && bytes[0] === 0x50 && bytes[1] === 0x4b; // PK
}

function decodeText(bytes: Uint8Array): { text: string; encoding: "utf-8" | "euc-kr" } {
  let text: string;
  let encoding: "utf-8" | "euc-kr" = "utf-8";
  try {
    text = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch {
    text = new TextDecoder("euc-kr").decode(bytes);
    encoding = "euc-kr";
  }
  if (text.charCodeAt(0) === 0xfeff) text = text.slice(1);
  return { text, encoding };
}

function readXlsx(bytes: Uint8Array): string[][] {
  const wb = XLSX.read(bytes, { type: "array" });
  const ws = wb.Sheets[wb.SheetNames[0]];
  if (!ws) return [];
  const aoa = XLSX.utils.sheet_to_json<unknown[]>(ws, { header: 1, raw: true, defval: "" });
  return aoa.map((r) => (r as unknown[]).map((c) => (c === null || c === undefined ? "" : String(c).trim())));
}

// ---------- 머리행·열 ----------
function detectHeader(rows: string[][]): number {
  let best = -1;
  let bestN = 0;
  const lim = Math.min(15, rows.length);
  for (let i = 0; i < lim; i++) {
    const n = rows[i].filter((c) => roleOfHeader(c) !== null).length;
    if (n >= 3) return i;
    if (n > bestN) {
      bestN = n;
      best = i;
    }
  }
  if (best >= 0) return best;
  const firstNonEmpty = rows.findIndex((r) => r.some((c) => c !== ""));
  return firstNonEmpty < 0 ? 0 : firstNonEmpty;
}

function buildColumns(header: string[]): ParseReport["columns"] {
  const used = new Set<ColumnRole>();
  const cols = header.map((h, index) => {
    const role = roleOfHeader(h);
    if (role && !used.has(role)) {
      used.add(role);
      return { index, header: h, role, confident: true };
    }
    return { index, header: h, role: "unknown" as ColumnRole, confident: false };
  });
  // 「구분」은 단일 금액 열이 없으면 거래점 성격으로 본다
  const hasAmount = cols.some((c) => c.role === "amount");
  if (!hasAmount) {
    for (const c of cols) {
      if (c.role === "io_sign" && c.header.replace(/\s+/g, "") === "구분") {
        c.role = used.has("branch") ? "ignore" : "branch";
        if (c.role === "branch") used.add("branch");
      }
    }
  }
  return cols;
}

function computeMissing(cols: ParseReport["columns"]): ParseReport["missingRequired"] {
  const has = (r: ColumnRole) => cols.some((c) => c.role === r);
  const miss: ParseReport["missingRequired"] = [];
  if (!has("datetime") && !has("date")) miss.push("datetime_or_date");
  if (!has("out") && !has("in") && !has("amount")) miss.push("amount");
  return miss;
}

function emptyReport(encoding: ParseReport["encoding"]): ParseReport {
  return {
    encoding,
    headerRow: 0,
    columns: [],
    rowsRead: 0,
    rowsSkipped: 0,
    missingRequired: ["datetime_or_date", "amount"],
    unknownCategoryShare: 0,
    firstDay: null,
    lastDay: null,
  };
}

/** 파일 → 행 + 첫 보고서(열 인식). 분석은 toTxs에서. */
export function parseFile(input: ArrayBuffer, fileName: string): { rows: string[][]; report: ParseReport } {
  const bytes = new Uint8Array(input);
  let rows: string[][];
  let encoding: ParseReport["encoding"];
  if (isXlsx(bytes, fileName)) {
    try {
      rows = readXlsx(bytes);
      encoding = "xlsx";
    } catch {
      return { rows: [], report: emptyReport("xlsx") };
    }
  } else {
    const d = decodeText(bytes);
    rows = parseCsvText(d.text);
    encoding = d.encoding;
  }
  if (rows.length === 0) return { rows, report: emptyReport(encoding) };
  const headerRow = detectHeader(rows);
  const columns = buildColumns(rows[headerRow] ?? []);
  const dataRows = rows.slice(headerRow + 1).filter((r) => r.some((c) => c !== "")).length;
  return {
    rows,
    report: {
      encoding,
      headerRow,
      columns,
      rowsRead: dataRows,
      rowsSkipped: 0,
      missingRequired: computeMissing(columns),
      unknownCategoryShare: 0,
      firstDay: null,
      lastDay: null,
    },
  };
}

/** 수동 열 지정: 입력을 바꾸지 않고 새 보고서를 돌려준다. 한 역할은 한 열만(앞서 같은 역할이던 열은 「모름」으로). */
export function applyMapping(report: ParseReport, index: number, role: ColumnRole): ParseReport {
  const columns = report.columns.map((c) => {
    if (c.index === index) return { ...c, role, confident: true };
    if (SINGLE_ROLES.includes(role) && c.role === role) return { ...c, role: "unknown" as ColumnRole, confident: false };
    return { ...c };
  });
  return { ...report, columns, missingRequired: computeMissing(columns) };
}

// ---------- 금액 ----------
/** 쉼표·「원」·공백 제거, 괄호 = 음수, 빈칸 = 0. 못 읽으면 null */
export function parseAmount(raw: string): number | null {
  let s = String(raw ?? "").trim();
  if (s === "" || s === "-") return 0;
  let neg = false;
  const paren = /^\((.*)\)$/.exec(s);
  if (paren) {
    neg = true;
    s = paren[1];
  }
  s = s.replace(/[,\s원₩]/g, "");
  if (s.startsWith("+")) s = s.slice(1);
  if (s.startsWith("-")) {
    neg = !neg;
    s = s.slice(1);
  }
  if (s === "") return 0;
  if (!/^\d+(\.\d+)?$/.test(s)) return null;
  const v = Math.round(Number(s));
  return neg ? -v : v;
}

// ---------- 행 → 거래 ----------
export function toTxs(
  rows: string[][],
  report: ParseReport,
  mapping?: Partial<Record<number, ColumnRole>>,
): { txs: Tx[]; report: ParseReport } {
  let rep = report;
  if (mapping) for (const [k, v] of Object.entries(mapping)) if (v) rep = applyMapping(rep, Number(k), v);
  if (rep.missingRequired.length > 0) return { txs: [], report: { ...rep, rowsRead: 0 } };

  const col = (r: ColumnRole) => rep.columns.find((c) => c.role === r)?.index ?? -1;
  const ci = {
    datetime: col("datetime"), date: col("date"), time: col("time"), memo: col("memo"), memo2: col("memo2"),
    out: col("out"), in: col("in"), amount: col("amount"), io: col("io_sign"), balance: col("balance"), branch: col("branch"),
  };
  const cell = (r: string[], i: number) => (i >= 0 ? (r[i] ?? "").trim() : "");

  const raw: { tx: Tx; fields: [string, string]; ord: number }[] = [];
  let skipped = 0;
  for (let i = rep.headerRow + 1; i < rows.length; i++) {
    const r = rows[i];
    if (!r || !r.some((c) => c !== "")) continue; // 빈 줄은 세지 않음
    // 날짜·시각
    let dt = ci.datetime >= 0 ? parseDateTime(cell(r, ci.datetime)) : null;
    if (!dt && ci.date >= 0) dt = parseDateTime(cell(r, ci.date));
    if (!dt) {
      skipped++;
      continue;
    }
    let minute = dt.minute;
    if (minute === null && ci.time >= 0) minute = parseTime(cell(r, ci.time));
    // 금액
    let amount: number | null;
    if (ci.out >= 0 || ci.in >= 0) {
      const o = ci.out >= 0 ? parseAmount(cell(r, ci.out)) : 0;
      const n = ci.in >= 0 ? parseAmount(cell(r, ci.in)) : 0;
      amount = o === null || n === null ? null : Math.abs(n) - Math.abs(o);
      if (amount === 0 && ci.amount >= 0) amount = signedSingle(cell(r, ci.amount), cell(r, ci.io));
    } else {
      amount = signedSingle(cell(r, ci.amount), cell(r, ci.io));
    }
    if (amount === null || amount === 0) {
      skipped++;
      continue;
    }
    const balRaw = cell(r, ci.balance);
    const balance = balRaw === "" ? null : parseAmount(balRaw);
    const m1 = cell(r, ci.memo);
    const m2 = cell(r, ci.memo2);
    const branchRaw = cell(r, ci.branch);
    const category = categorize(m1, m2, branchRaw, amount);
    raw.push({
      tx: {
        id: `r${i - rep.headerRow}`, // 머리행 다음 데이터 행 번호(1부터) = truth.json exploit_rows와 같은 번호
        day: dt.day,
        minute,
        amount,
        balance,
        memo: [m1, m2].filter(Boolean).join(" "),
        branch: branchRaw || null,
        category,
        cpKey: null,
        cpLabel: null,
        cpType: null,
      },
      fields: [m1, m2],
      ord: i,
    });
  }
  // 시간 순(같은 시각은 파일 순서). 은행 파일이 최신순이어도 같은 결과가 되도록.
  const fileAsc = raw.length < 2 || raw[0].tx.day <= raw[raw.length - 1].tx.day;
  raw.sort((a, b) => a.tx.day - b.tx.day || (a.tx.minute ?? -1) - (b.tx.minute ?? -1) || (fileAsc ? a.ord - b.ord : b.ord - a.ord));
  const txs = assignCounterparties(
    raw.map((x) => x.tx),
    raw.map((x) => x.fields),
  );
  const unknown = txs.filter((t) => t.category === "unknown").length;
  return {
    txs,
    report: {
      ...rep,
      rowsRead: txs.length,
      rowsSkipped: skipped,
      unknownCategoryShare: txs.length ? unknown / txs.length : 0,
      firstDay: txs.length ? txs[0].day : null,
      lastDay: txs.length ? txs[txs.length - 1].day : null,
    },
  };
}

function signedSingle(amt: string, io: string): number | null {
  const v = parseAmount(amt);
  if (v === null) return null;
  if (/출금|지급|인출|-/.test(io)) return -Math.abs(v);
  if (/입금|\+/.test(io)) return Math.abs(v);
  return v;
}

/** 편의: 파일 → 거래 (Node 스크립트·시험용) */
export function parseToTxs(input: ArrayBuffer, fileName: string): { txs: Tx[]; report: ParseReport } {
  const { rows, report } = parseFile(input, fileName);
  return toTxs(rows, report);
}
