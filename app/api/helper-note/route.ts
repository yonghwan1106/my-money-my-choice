// POST /api/helper-note (구현명세 §6-9) — 조력자 알림의 「무슨 일이 있었는지」 요약(≤90자, 숫자 검사 통과한 것만).
// 500을 내지 않는다(예외는 잡아서 고정 문안). 본문 로그 없음.
import { badRequest, helperNote, ok, parseBody, parseHelperNoteRequest } from "../../../lib/llm/client";
import { clientIp } from "../../../lib/llm/limit";

export const runtime = "nodejs";
export const maxDuration = 30;
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  let raw: unknown = null;
  try { raw = parseBody(await req.text()); } catch { raw = null; }
  const body = parseHelperNoteRequest(raw);
  if (!body) return badRequest();
  return ok(await helperNote(body, { ip: clientIp(req) }));
}
