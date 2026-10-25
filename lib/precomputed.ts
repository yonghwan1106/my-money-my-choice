// 사전계산 조회 (구현명세 §6-10, 브라우저) — data/scenarios/*.json의 precomputed를 §6-5 해시 키로 찾는다.
// 있으면 호출하지 않고 mode "precomputed", 없을 때만 fetch. 시연 버튼으로 끝까지 가면 네트워크 호출 0건이어야 한다.
import type {
  HelperNoteRequest, HelperNoteResponse, UnderstandRequest, UnderstandResponse,
} from "./engine/types";
import { requestKey } from "./llm/hash";

export interface PrecomputedEntry<Q, R> { key: string; request: Q; response: R }
export interface PrecomputedBlock {
  understand: PrecomputedEntry<UnderstandRequest, UnderstandResponse>[];
  helperNotes: PrecomputedEntry<HelperNoteRequest, HelperNoteResponse>[];
}

export async function findUnderstand(pre: PrecomputedBlock | null | undefined, req: UnderstandRequest): Promise<UnderstandResponse | null> {
  if (!pre) return null;
  const key = await requestKey(req);
  const hit = pre.understand.find((e) => e.key === key);
  return hit ? { ...hit.response, mode: "precomputed" } : null;
}

export async function findHelperNote(pre: PrecomputedBlock | null | undefined, req: HelperNoteRequest): Promise<HelperNoteResponse | null> {
  if (!pre) return null;
  const key = await requestKey(req);
  const hit = pre.helperNotes.find((e) => e.key === key);
  return hit ? { ...hit.response, mode: "precomputed" } : null;
}

async function postJson<T>(url: string, body: unknown): Promise<T | null> {
  try {
    const r = await fetch(url, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
    if (!r.ok) return null;
    return (await r.json()) as T;
  } catch {
    return null;
  }
}

/** 사전계산 → 없으면 /api/understand. 네트워크도 실패하면 null(화면은 버튼으로 고르게 안내). req.text는 redact() 뒤 문장이어야 한다. */
export async function getUnderstand(pre: PrecomputedBlock | null | undefined, req: UnderstandRequest): Promise<UnderstandResponse | null> {
  return (await findUnderstand(pre, req)) ?? (await postJson<UnderstandResponse>("/api/understand", req));
}

/** 사전계산 → 없으면 /api/helper-note. 실패하면 null(화면은 helperNoteTemplate으로 「기본 문장」). */
export async function getHelperNote(pre: PrecomputedBlock | null | undefined, req: HelperNoteRequest): Promise<HelperNoteResponse | null> {
  return (await findHelperNote(pre, req)) ?? (await postJson<HelperNoteResponse>("/api/helper-note", req));
}
