// POST /api/understand (구현명세 §6-9) — 본인이 말로 한 답 → 5범주. 본인이 [맞아요]를 눌러야 반영된다.
// 500을 내지 않는다(예외는 잡아서 K0 폴백). 본문 로그 없음.
import { badRequest, ok, parseBody, parseUnderstandRequest, understand } from "../../../lib/llm/client";
import { clientIp } from "../../../lib/llm/limit";

export const runtime = "nodejs";
export const maxDuration = 30;
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  let raw: unknown = null;
  try { raw = parseBody(await req.text()); } catch { raw = null; }
  const body = parseUnderstandRequest(raw);
  if (!body) return badRequest();
  return ok(await understand(body, { ip: clientIp(req) }));
}
