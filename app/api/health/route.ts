// 응답 형태 = lib/engine/types.ts 의 HealthResponse (C5에서 그 타입으로 바꾼다)

export const runtime = "nodejs";
export const maxDuration = 30;
export const dynamic = "force-dynamic";

// B1 틀 — 내용은 C5에서 채운다 (§6-9). 키 값·접두어는 응답에 넣지 않는다.
export async function GET() {
  const sha = (process.env.VERCEL_GIT_COMMIT_SHA ?? "").slice(0, 7) || "local";
  const body = {
    ok: true,
    llm: process.env.ANTHROPIC_API_KEY ? "live" : "demo",
    model: process.env.ANTHROPIC_MODEL || "claude-haiku-5-5",
    version: `1.0.0+${sha}`,
    limits: {
      rpm_per_ip: Number(process.env.AI_RPM_PER_IP) || 6,
      daily_per_instance: Number(process.env.AI_DAILY_CAP) || 300,
    },
  };
  return Response.json(body, { headers: { "Cache-Control": "no-store" } });
}
