// 캐시·사전계산 공용 키 (구현명세 §6-5) — 브라우저·서버 공용(Web Crypto).
// 키 = sha256(prompt_version + "\n" + 정렬 직렬화(요청에서 prompt_version 뺀 나머지))

export function stableStringify(x: unknown): string {
  if (x === null || typeof x !== "object") return JSON.stringify(x) ?? "null";
  if (Array.isArray(x)) return "[" + x.map(stableStringify).join(",") + "]";
  const o = x as Record<string, unknown>;
  const keys = Object.keys(o).filter((k) => o[k] !== undefined).sort();
  return "{" + keys.map((k) => JSON.stringify(k) + ":" + stableStringify(o[k])).join(",") + "}";
}

export async function sha256Hex(s: string): Promise<string> {
  const buf = await globalThis.crypto.subtle.digest("SHA-256", new TextEncoder().encode(s));
  return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

export async function requestKey(req: { prompt_version: string; [k: string]: unknown } | object): Promise<string> {
  const { prompt_version, ...rest } = req as { prompt_version: string } & Record<string, unknown>;
  return sha256Hex(prompt_version + "\n" + stableStringify(rest));
}
