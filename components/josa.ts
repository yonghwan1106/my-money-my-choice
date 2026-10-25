// 조사 고르기 — 받침이 있으면 앞, 없으면 뒤(「누나는」「김도현 선생님은」). 한글이 아니면 「은(는)」처럼 둘 다.
export function josa(word: string, withBatchim: string, without: string): string {
  const w = word.trim();
  const c = w.charCodeAt(w.length - 1);
  if (c >= 0xac00 && c <= 0xd7a3) return w + ((c - 0xac00) % 28 !== 0 ? withBatchim : without);
  return `${w}${withBatchim}(${without})`;
}
