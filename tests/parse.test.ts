// B2 — L0 파일 해석 시험 (구현명세 §5-1). 실행: npx --prefix <repo> tsx --test <repo>\tests\parse.test.ts
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import * as XLSX from "xlsx";
import { parseFile, toTxs, applyMapping, parseCsvText, parseAmount, parseToTxs } from "../lib/engine/parse";
import { parseDateTime, parseTime, dayNo, weekday, mondayOf, fromExcelSerial } from "../lib/engine/dates";
import { categorize } from "../lib/engine/categorize";
import { isPersonName } from "../lib/engine/lexicon";
import { summarizeCounterparties } from "../lib/engine/counterparty";

const ROOT = path.resolve(__dirname, "..");
const FX = path.join(ROOT, "tests", "fixtures");

function ab(p: string): ArrayBuffer {
  const b = fs.readFileSync(p);
  return b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength) as ArrayBuffer;
}
function load(name: string) {
  return parseToTxs(ab(path.join(FX, name)), name);
}
const pick = (t: { day: number; amount: number; category: string; cpLabel: string | null; minute: number | null }) => ({
  day: t.day, amount: t.amount, category: t.category, cpLabel: t.cpLabel, minute: t.minute,
});

const EXPECTED_CATS = [
  "bill_recurring", "card_daily", "card_daily", "transfer_in", "cash_withdraw", "micro_payment", "transfer_out",
  "income_salary", "income_benefit", "telecom", "loan_in", "transfer_out", "card_daily", "card_daily",
  "transfer_out", "transfer_out", "unknown", "telecom", "telecom", "card_daily",
];

test("형식 1 (UTF-8): 머리행·열 역할·행 100%", () => {
  const { txs, report } = load("f1_utf8.csv");
  assert.equal(report.encoding, "utf-8");
  assert.equal(report.headerRow, 0);
  assert.deepEqual(report.missingRequired, []);
  assert.deepEqual(report.columns.map((c) => c.role), ["datetime", "memo", "memo2", "out", "in", "balance", "branch"]);
  assert.equal(report.rowsRead, 20);
  assert.equal(report.rowsSkipped, 0);
  assert.equal(txs.length, 20);
  assert.deepEqual(txs.map((t) => t.category), EXPECTED_CATS);
  assert.equal(report.unknownCategoryShare, 1 / 20);
  assert.equal(report.firstDay, dayNo(2026, 7, 1));
  assert.equal(report.lastDay, dayNo(2026, 8, 7));
  assert.equal(txs[0].id, "r2");
  assert.equal(txs[0].amount, -300000);
  assert.equal(txs[3].amount, 100000);
  assert.equal(txs[1].minute, 12 * 60 + 31);
  assert.equal(txs[0].balance, 1700000);
});

test("형식 2 (CP949): euc-kr로 읽고 같은 거래가 나옴", () => {
  const a = load("f1_utf8.csv");
  const b = load("f2_cp949.csv");
  assert.equal(b.report.encoding, "euc-kr");
  assert.deepEqual(b.report.columns.map((c) => c.role), ["date", "time", "memo", "out", "in", "balance", "branch"]);
  assert.equal(b.report.rowsRead, 20);
  assert.equal(b.report.rowsSkipped, 0);
  assert.deepEqual(b.txs.map(pick), a.txs.map(pick));
});

test("BOM 제거", () => {
  const { txs, report } = load("f1_bom.csv");
  assert.equal(report.columns[0].header, "거래일시");
  assert.equal(report.columns[0].role, "datetime");
  assert.equal(txs.length, 20);
});

test("안내문 2~3줄 뒤 머리행", () => {
  const { txs, report } = load("f2_notice.csv");
  assert.equal(report.headerRow, 3);
  assert.equal(txs.length, 20);
  assert.deepEqual(txs.map(pick), load("f1_utf8.csv").txs.map(pick));
});

test("단일 금액 + 부호 열, 괄호 음수, 여러 날짜 모양, 0원 행 건너뜀", () => {
  const { txs, report } = load("single_amount.csv");
  assert.deepEqual(report.columns.map((c) => c.role), ["date", "memo", "amount", "io_sign", "balance"]);
  assert.equal(txs.length, 4);
  assert.equal(report.rowsSkipped, 1);
  assert.deepEqual(txs.map((t) => t.amount), [-300000, -50000, 100000, -20000]);
  assert.deepEqual(txs.map((t) => t.day), [dayNo(2026, 7, 1), dayNo(2026, 7, 2), dayNo(2026, 7, 5), dayNo(2026, 7, 6)]);
  assert.equal(txs[0].minute, null);
  assert.deepEqual(txs.map((t) => t.category), ["bill_recurring", "transfer_out", "transfer_in", "cash_withdraw"]);
});

test("필수 열이 없으면 분석하지 않음 → 수동 지정으로 풀림", () => {
  const { rows, report } = parseFile(ab(path.join(FX, "missing_amount.csv")), "missing_amount.csv");
  assert.deepEqual(report.missingRequired, ["amount"]);
  assert.equal(toTxs(rows, report).txs.length, 0);
  const fixed = applyMapping(report, 3, "out");
  assert.deepEqual(fixed.missingRequired, []);
  assert.equal(report.missingRequired.length, 1, "입력 보고서는 바뀌지 않음");
  const r = toTxs(rows, fixed);
  assert.equal(r.txs.length, 1);
  assert.equal(r.txs[0].amount, -1000);
  // mapping 인자로도 같은 결과
  assert.equal(toTxs(rows, report, { 3: "out" }).txs.length, 1);
});

test("엑셀(XLSX) — 첫 시트, 엑셀 일련번호 날짜", () => {
  const aoa = [
    ["거래내역 조회"],
    [],
    ["거래일시", "적요", "기재내용", "출금액", "입금액", "잔액"],
    [46238.4375, "인터넷뱅킹", "한지훈", 150000, "", 1000000],
    [46239, "급여", "햇살보호작업장", "", 1300000, 2300000],
  ];
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(aoa), "Sheet1");
  const buf = XLSX.write(wb, { type: "array", bookType: "xlsx" }) as ArrayBuffer;
  const { txs, report } = parseToTxs(buf, "내역.xlsx");
  assert.equal(report.encoding, "xlsx");
  assert.equal(report.headerRow, 2);
  assert.equal(txs.length, 2);
  // 46238 = 2026-08-04
  assert.equal(txs[0].day, dayNo(2026, 8, 4));
  assert.equal(txs[0].minute, 10 * 60 + 30);
  assert.equal(txs[0].amount, -150000);
  assert.equal(txs[0].cpType, "person");
  assert.equal(txs[1].category, "income_salary");
  assert.equal(txs[1].minute, null);
  // PK 시그니처만으로도 XLSX로 봄
  assert.equal(parseFile(buf, "noext").report.encoding, "xlsx");
});

test("상대방 키: 처음 나온 순서, 같은 이름 같은 키, 현금은 null", () => {
  const { txs } = load("f1_utf8.csv");
  const keys = txs.map((t) => t.cpKey);
  assert.equal(txs[4].cpKey, null); // ATM
  assert.equal(txs[0].cpKey, "cp_01");
  assert.equal(txs[14].cpKey, txs[15].cpKey); // 한지훈 두 번
  assert.equal(txs[14].cpLabel, "한지훈");
  assert.equal(txs[14].cpType, "person");
  assert.equal(txs[3].cpType, "person"); // 윤혜진(입금)
  assert.equal(txs[7].cpType, "employer");
  assert.equal(txs[7].cpLabel, "햇살보호작업장");
  assert.equal(txs[8].cpType, "agency");
  assert.equal(txs[10].cpType, "lender");
  assert.equal(txs[10].cpLabel, "예시캐피탈");
  assert.equal(txs[9].cpType, "biller");
  assert.equal(txs[18].cpLabel, "예시통신C");
  assert.equal(txs[1].cpType, "merchant");
  const seen = keys.filter((k): k is string => !!k);
  const firstOrder = [...new Set(seen)];
  firstOrder.forEach((k, i) => assert.equal(k, `cp_${String(i + 1).padStart(2, "0")}`));
  const cps = summarizeCounterparties(txs);
  const hj = cps.find((c) => c.label === "한지훈")!;
  assert.equal(hj.txCount, 2);
  assert.equal(hj.outKrw, 250000);
});

test("최신순 파일도 시간순으로 정렬", () => {
  const text = fs.readFileSync(path.join(FX, "f1_utf8.csv"), "utf-8").trim().split(/\r?\n/);
  const rev = [text[0], ...text.slice(1).reverse()].join("\n");
  const enc = new TextEncoder().encode(rev);
  const r = parseToTxs(enc.buffer.slice(enc.byteOffset, enc.byteOffset + enc.byteLength) as ArrayBuffer, "rev.csv");
  assert.deepEqual(r.txs.map(pick), load("f1_utf8.csv").txs.map(pick));
});

test("CSV 따옴표·쉼표·줄바꿈", () => {
  const rows = parseCsvText('a,"b,1","c ""q"""\r\n"줄\n바꿈",x,\n');
  assert.deepEqual(rows, [["a", "b,1", 'c "q"'], ["줄\n바꿈", "x", ""]]);
});

test("금액 읽기", () => {
  assert.equal(parseAmount("1,070,000"), 1070000);
  assert.equal(parseAmount("(50,000)"), -50000);
  assert.equal(parseAmount("6,000원"), 6000);
  assert.equal(parseAmount(""), 0);
  assert.equal(parseAmount("-1,000"), -1000);
  assert.equal(parseAmount("abc"), null);
});

test("날짜·시각·주 경계", () => {
  assert.deepEqual(parseDateTime("2026.08.04 10:12:30"), { day: dayNo(2026, 8, 4), minute: 612 });
  assert.deepEqual(parseDateTime("2026-08-04 10:12"), { day: dayNo(2026, 8, 4), minute: 612 });
  assert.deepEqual(parseDateTime("2026-08-04"), { day: dayNo(2026, 8, 4), minute: null });
  assert.deepEqual(parseDateTime("2026/08/04"), { day: dayNo(2026, 8, 4), minute: null });
  assert.deepEqual(parseDateTime("20260804"), { day: dayNo(2026, 8, 4), minute: null });
  assert.equal(parseDateTime("2026-02-30"), null);
  assert.equal(parseDateTime("합계"), null);
  assert.deepEqual(fromExcelSerial(46238.5), { day: dayNo(2026, 8, 4), minute: 720 });
  assert.equal(parseTime("21:30"), 1290);
  assert.equal(parseTime("213000"), 1290);
  assert.equal(weekday(dayNo(2026, 4, 6)), 0); // 월
  assert.equal(weekday(dayNo(2026, 10, 4)), 6); // 일
  assert.equal(mondayOf(dayNo(2026, 7, 26)), dayNo(2026, 7, 20)); // 일요일 → 그 주 월요일
  assert.equal(mondayOf(dayNo(2026, 7, 27)), dayNo(2026, 7, 27)); // 월요일
});

test("범주·사람 이름 판별", () => {
  assert.equal(categorize("예시카드론", "", "", 2000000), "loan_in");
  assert.equal(categorize("예시카드론상환", "", "", -100000), "loan_repay");
  assert.equal(categorize("급여 늘봄보호작업장", "", "", 900000), "income_salary");
  assert.equal(categorize("장애수당", "", "", 500000), "income_benefit");
  assert.equal(categorize("게임충전", "", "", -5000), "micro_payment");
  assert.equal(categorize("푸른가전", "", "", -1290000), "card_daily");
  assert.equal(categorize("김도현", "", "", -400000), "transfer_out");
  assert.equal(categorize("기타거래", "", "", -1000), "unknown");
  assert.ok(isPersonName("한지훈"));
  assert.ok(isPersonName("김도현님"));
  assert.ok(isPersonName("남궁민수"));
  assert.ok(!isPersonName("정육점"));
  assert.ok(!isPersonName("도시철도"));
  assert.ok(!isPersonName("기타거래"));
  assert.ok(!isPersonName("예시통신A"));
});

// ---- A 묶음 산출물이 있으면 함께 확인 (없으면 건너뜀) ----
const SAMPLES = path.join(ROOT, "public", "samples");
const sampleFiles = fs.existsSync(SAMPLES) ? fs.readdirSync(SAMPLES).filter((f) => f.endsWith(".csv")).sort() : [];

test("public/samples/*.csv 8개가 행 100% 읽힘, 같은 각본 형식 1·2가 같음", { skip: sampleFiles.length === 0 ? "public/samples 아직 없음(A2)" : false }, () => {
  assert.equal(sampleFiles.length, 8);
  for (const f of sampleFiles) {
    const { rows, report } = parseFile(ab(path.join(SAMPLES, f)), f);
    const dataRows = rows.slice(report.headerRow + 1).filter((r) => r.some((c) => c !== "")).length;
    const r = toTxs(rows, report);
    assert.deepEqual(r.report.missingRequired, [], f);
    assert.equal(r.report.rowsSkipped, 0, f);
    assert.equal(r.txs.length, dataRows, f);
    if (f.endsWith("_f2.csv")) assert.equal(r.report.encoding, "euc-kr", f);
  }
  for (const f of sampleFiles.filter((x) => x.endsWith("_f1.csv"))) {
    const g = f.replace("_f1.csv", "_f2.csv");
    const a = parseToTxs(ab(path.join(SAMPLES, f)), f).txs.map(pick);
    const b = parseToTxs(ab(path.join(SAMPLES, g)), g).txs.map(pick);
    assert.deepEqual(
      b.map(({ minute, ...x }) => x),
      a.map(({ minute, ...x }) => x),
      `${f} vs ${g}`,
    );
  }
});

const SYNTH = path.join(ROOT, "pipeline", "work", "synth", "persons");
const synthFiles = fs.existsSync(SYNTH) ? fs.readdirSync(SYNTH).filter((f) => f.endsWith(".csv")).sort().slice(0, 20) : [];

test("합성 20명이 행 100% 읽힘", { skip: synthFiles.length === 0 ? "pipeline/work/synth 아직 없음(A1)" : false }, () => {
  for (const f of synthFiles) {
    const { rows, report } = parseFile(ab(path.join(SYNTH, f)), f);
    const dataRows = rows.slice(report.headerRow + 1).filter((r) => r.some((c) => c !== "")).length;
    const r = toTxs(rows, report);
    assert.deepEqual(r.report.missingRequired, [], f);
    assert.equal(r.report.rowsSkipped, 0, f);
    assert.equal(r.txs.length, dataRows, f);
  }
});
