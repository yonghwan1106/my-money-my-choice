// GET /api/health (구현명세 §6-9) — 키 값·접두어는 응답에 넣지 않는다.
import type { HealthResponse } from "../../../lib/engine/types";
import { PRIMARY_MODEL } from "../../../lib/llm/client";
import { dailyCap, rpmPerIp } from "../../../lib/llm/limit";

export const runtime = "nodejs";
export const maxDuration = 30;
export const dynamic = "force-dynamic";

export async function GET() {
  const sha = (process.env.VERCEL_GIT_COMMIT_SHA ?? "").slice(0, 7) || "local";
  const body: HealthResponse = {
    ok: true,
    llm: process.env.ANTHROPIC_API_KEY ? "live" : "demo",
    model: PRIMARY_MODEL(),
    version: `1.0.0+${sha}`,
    limits: { rpm_per_ip: rpmPerIp(), daily_per_instance: dailyCap() },
  };
  return Response.json(body, { headers: { "Cache-Control": "no-store" } });
}
