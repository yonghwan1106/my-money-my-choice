// 금지 점검 (구현명세 §11-2) — 0건이어야 배포. 실행: npx --prefix <repo> tsx <repo>\scripts\check_forbidden.ts [--strict]
//   --strict: 태그 4개(gen-frozen·signals-frozen·model-frozen·blind-made)가 모두 있어야 통과(배포 직전·통합 단계용).
//   추가지시 §6: 첫 커밋은 실제 시각(2026-10-25) 그대로라 「2026-10-26 이후」 항목은 예외로 보고만 한다.
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { SURNAMES_1, SURNAMES_2, GIVEN_NAMES, WORD_PREFIX } from "../lib/llm/banned";

const ROOT = path.resolve(__dirname, "..");
const strict = process.argv.includes("--strict");
const problems: string[] = [];
const notes: string[] = [];

function git(args: string[]): { ok: boolean; out: string } {
  try { return { ok: true, out: execFileSync("git", ["-C", ROOT, ...args], { encoding: "utf-8", stdio: ["ignore", "pipe", "ignore"] }) }; }
  catch (e) { const out = (e as { stdout?: string }).stdout ?? ""; return { ok: false, out }; }
}

function walk(rel: string, exts: string[]): string[] {
  const abs = path.join(ROOT, rel);
  if (!fs.existsSync(abs)) return [];
  const st = fs.statSync(abs);
  if (st.isFile()) return [rel];
  const out: string[] = [];
  for (const name of fs.readdirSync(abs)) {
    if (name === "node_modules" || name.startsWith(".")) continue;
    const r = path.join(rel, name);
    const s = fs.statSync(path.join(ROOT, r));
    if (s.isDirectory()) out.push(...walk(r, exts));
    else if (exts.some((e) => name.endsWith(e))) out.push(r);
  }
  return out;
}

function readText(rel: string): string {
  const buf = fs.readFileSync(path.join(ROOT, rel));
  try { return new TextDecoder("utf-8", { fatal: true }).decode(buf); } catch { return new TextDecoder("euc-kr").decode(buf); }
}

const norm = (p: string) => p.split(path.sep).join("/");
/** 주석만 있는 줄(「localStorage를 쓰지 않는다」 같은 설명) — API 사용 점검에서는 뺀다. */
const isComment = (line: string) => /^\s*(\/\/|\*|\/\*|\{\s*\/\*)/.test(line);

// 1. 금지 낱말
const WORDS = /보호자|감시|대시보드|모니터링 대상자|정상인|정상 사람|가짜|사기|범죄|차단/u;
const IDEA_LINE = "지원의사결정 기반 발달장애인 경제적 애로 예방 AI 모니터링 서비스";
const WORD_EXCEPT = new Set([
  "lib/llm/banned.ts", "lib/engine/lexicon.ts",
  "lib/llm/prompts.ts", // 프롬프트가 「'사기'·'범죄'·'차단'을 쓰지 않는다」고 말해야 해서(§6-6 원문)
  "scripts/check_forbidden.ts",
]);
const SCAN = ["app", "components", "lib", "data/scenarios", "public/samples", "README.md"];
const TEXT_EXT = [".ts", ".tsx", ".js", ".mjs", ".css", ".json", ".csv", ".md", ".html", ".txt", ".svg"];
for (const top of SCAN) {
  for (const rel of walk(top, TEXT_EXT)) {
    const r = norm(rel);
    if (WORD_EXCEPT.has(r) || /\.test\.ts$/.test(r) || r.startsWith("tests/")) continue;
    readText(rel).split(/\r?\n/).forEach((line, i) => {
      if (line.includes(IDEA_LINE)) return;
      const m = line.match(WORDS);
      if (m) problems.push(`금지 낱말 「${m[0]}」 ${r}:${i + 1}`);
    });
  }
}

// 2. 키 접두어(저장소 전체, git이 추적하는 파일)
const KEYPAT = ["sk", "ant"].join("-");
const g = git(["grep", "-n", KEYPAT]);
if (g.ok && g.out.trim()) for (const l of g.out.trim().split("\n")) problems.push(`키 접두어 ${l.split(":").slice(0, 2).join(":")}`);

// 3. 음성·녹음 API(lib 0건, 받아쓰기는 components/FreeAnswer.tsx 한 곳만)
for (const rel of walk("lib", [".ts", ".tsx"])) {
  readText(rel).split(/\r?\n/).forEach((line, i) => {
    const m = isComment(line) ? null : line.match(/getUserMedia|MediaRecorder|AudioContext|speechToText|webkitSpeechRecognition/);
    if (m) problems.push(`음성 API ${m[0]} ${norm(rel)}:${i + 1}`);
  });
}
for (const rel of [...walk("components", [".ts", ".tsx"]), ...walk("app", [".ts", ".tsx"])]) {
  const r = norm(rel);
  readText(rel).split(/\r?\n/).forEach((line, i) => {
    if (isComment(line)) return;
    const m = line.match(/getUserMedia|MediaRecorder|AudioContext|speechToText/);
    if (m) problems.push(`음성 API ${m[0]} ${r}:${i + 1}`);
    if (/webkitSpeechRecognition/.test(line) && r !== "components/FreeAnswer.tsx") problems.push(`받아쓰기는 FreeAnswer만 ${r}:${i + 1}`);
  });
}

// 4. 브라우저 저장
for (const rel of [...walk("app", [".ts", ".tsx"]), ...walk("components", [".ts", ".tsx"]), ...walk("lib", [".ts", ".tsx"])]) {
  readText(rel).split(/\r?\n/).forEach((line, i) => {
    const m = isComment(line) ? null : line.match(/localStorage|sessionStorage|document\.cookie/);
    if (m) problems.push(`브라우저 저장 ${m[0]} ${norm(rel)}:${i + 1}`);
  });
}

// 5. 사람 이름이 §4-6 목록 조합인지
const SUR20 = "김 이 최 정 강 조 윤 장 임 한 오 서 신 권 황 안 송 류 전 홍".split(" ");
const isListed = (n: string) => n.length === 3 && SUR20.includes(n[0]) && GIVEN_NAMES.includes(n.slice(1));
/** 이름이 아닌 3글자 낱말(가게·적요·범주 낱말). 목록 밖 이름 후보를 볼 때 거른다. */
const NOT_NAMES = new Set([
  "장애인", "장애수", "생계급", "주거급", "기초연", "관리비", "통신비", "보험료", "공과금", "자동이", "체크카", "모바일",
  "이번엔", "선생님", "지원사", "보호작", "작업장", "편의점", "정육점", "미용실", "세탁소", "고장나", "강아지", "점심맛",
  "소담밥", "마을버", "도시철", "하늘미", "안경점", "문구점", "치과의", "급여햇", "급여늘", "급여초", "예시캐", "예시카",
  "예시저", "예시통", "단말기", "할부금", "현금인", "인터넷", "오픈뱅", "스마트", "모바일", "타행이", "송금인", "연습용",
]);
const JOSA = /(님에게|님께|님이|님은|님을|님|씨에게|씨가|씨는|씨|에게서|에게|한테|께서|께|에서|으로|이고|이가|이는|이를|이와|가|는|은|을|를|와|과|의|도|에|이|로)$/u;
const nameFiles = [
  ...walk("data/scenarios", [".json"]), ...walk("public/samples", [".csv"]),
  "pipeline/understand_eval/sentences.jsonl",
].filter((r) => fs.existsSync(path.join(ROOT, r)));
const outside = new Map<string, string>();
const SUR_ALL = new Set([...SURNAMES_1]);
for (const rel of nameFiles) {
  const txt = readText(rel);
  for (const tok of txt.split(/[^가-힣]+/u)) {
    if (!tok) continue;
    const t = tok.length > 3 ? tok.replace(JOSA, "") : tok;
    if (t.length !== 3) continue;
    const two = SURNAMES_2.some((s) => t.startsWith(s));
    if (!SUR_ALL.has(t[0]) && !two) continue;
    if (isListed(t) || NOT_NAMES.has(t) || WORD_PREFIX.has(t.slice(0, 2))) continue;
    // 두 글자 낱말 + 조사(「선물로」「기억이」)는 이름이 아님 — 단 두 글자가 목록 이름이면(「지훈이」) 이름으로 본다
    if (/[이가은는을를로도와과의에]$/u.test(t) && !GIVEN_NAMES.includes(t.slice(0, 2))) continue;
    // 목록의 이름 부분이 들어 있거나(성만 다름), 3글자 이름 모양인데 목록 밖
    const givenLike = GIVEN_NAMES.includes(t.slice(1));
    if (givenLike) { outside.set(t, norm(rel)); continue; }
    // 성 + 흔하지 않은 두 글자: 사람 이름일 수도 있어 보고(낱말이면 NOT_NAMES에 넣는다)
    if (/[요다죠고서면며게어해]$/u.test(t)) continue; // 활용형
    outside.set(t, norm(rel));
  }
}
for (const [n, f] of outside) problems.push(`목록 밖 이름 후보 「${n}」 ${f}`);

// 6. 첫 커밋·원격
const first = git(["log", "--reverse", "--format=%ad", "--date=iso"]).out.split("\n")[0]?.trim() ?? "";
if (first && first < "2026-10-26") notes.push(`첫 커밋 ${first} — 추가지시 §6 예외(실제 시각 그대로)`);
const remotes = git(["remote", "-v"]).out.trim().split("\n").filter(Boolean);
for (const r of remotes) if (!/github\.com[:/]yonghwan1106\/my-money-my-choice(\.git)?\s/.test(r)) problems.push(`원격 ${r}`);
if (remotes.length === 0) problems.push("원격 없음");

// 7. 태그 순서
const TAGS = ["gen-frozen", "signals-frozen", "model-frozen", "blind-made"];
const have = TAGS.filter((t) => git(["rev-parse", "-q", "--verify", `refs/tags/${t}`]).ok);
for (let i = 1; i < have.length; i++) {
  if (!git(["merge-base", "--is-ancestor", have[i - 1], have[i]]).ok) problems.push(`태그 순서 ${have[i - 1]} < ${have[i]} 아님`);
}
const missing = TAGS.filter((t) => !have.includes(t));
if (missing.length) (strict ? problems : notes).push(`태그 없음: ${missing.join(", ")}`);

for (const n of notes) console.log(`참고: ${n}`);
for (const p of problems) console.log(`FAIL ${p}`);
console.log(`check_forbidden: ${problems.length}건${problems.length === 0 ? " — OK" : ""}`);
process.exit(problems.length === 0 ? 0 : 1);
