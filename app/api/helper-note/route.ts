export const runtime = "nodejs";
export const maxDuration = 30;
export const dynamic = "force-dynamic";

// B1 빈 라우트 — 내용은 C5에서 채운다 (§6-9).
export async function POST() {
  return Response.json({ error: "not_ready" }, { status: 404, headers: { "Cache-Control": "no-store" } });
}
