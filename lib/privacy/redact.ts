// 이름 지우기 (구현명세 §6-8) — 브라우저에서 서버 호출 직전에 부른다. 서버는 redactNumbers를 한 번 더 적용한다.
import type { Helper } from "../engine/types";

/** 별칭 속 관계 낱말(이름이 아님) — 별칭 전체는 지우지만 이 낱말만 따로 지우지는 않는다. */
const RELATION_WORDS = new Set([
  "선생님", "선생", "쌤", "님", "씨", "누나", "언니", "형", "오빠", "엄마", "아빠", "이모", "삼촌", "고모", "할머니", "할아버지",
  "동생", "친구", "활동지원사", "지원사", "센터", "담당자", "사회복지사", "복지사", "팀장", "과장", "실장", "원장", "사장님",
]);

const PHONE = /01[016789][- ]?\d{3,4}[- ]?\d{4}/g;
const ACCOUNT = /\d{2,6}(-\d{2,8})+/g;
const COMMA_NUM = /\d{1,3}(,\d{3})+/g; // 「1,070,000」 — §6-8 규칙의 \d{4,}가 쉼표 숫자를 못 잡아 보탬
const LONG_NUM = /\d{4,}/g;

export function redactNumbers(text: string): string {
  return text.replace(PHONE, "[전화]").replace(ACCOUNT, "[숫자]").replace(COMMA_NUM, "[숫자]").replace(LONG_NUM, "[숫자]");
}

function nameParts(alias: string): string[] {
  return alias.split(/\s+/u).filter((t) => /^[가-힣]{2,4}$/u.test(t) && !RELATION_WORDS.has(t));
}

export function redact(text: string, ctx: { displayName: string; helpers: Helper[]; cpLabels: string[] }): string {
  const pairs: [string, string][] = [];
  const add = (word: string | null | undefined, token: string) => {
    const w = (word ?? "").trim();
    if (w.length >= 1 && !pairs.some(([x]) => x === w)) pairs.push([w, token]);
  };
  add(ctx.displayName, "[본인]");
  ctx.helpers.forEach((h, i) => {
    const tok = `[H${i + 1}]`;
    add(h.alias, tok);
    for (const p of nameParts(h.alias)) {
      add(p, tok);
      if (p.length === 3) add(p.slice(1), tok); // 「이수진」 → 「수진」도
    }
  });
  ctx.cpLabels.forEach((label, i) => {
    const tok = `[상대${i + 1}]`;
    add(label, tok);
    const l = label.replace(/\s+/gu, "");
    if (/^[가-힣]{3}$/u.test(l)) add(l.slice(1), tok); // 「한지훈」 → 「지훈」도
  });
  pairs.sort((a, b) => b[0].length - a[0].length);
  let out = text;
  for (const [w, tok] of pairs) out = out.split(w).join(tok);
  out = redactNumbers(out);
  return Array.from(out).slice(0, 200).join("");
}
